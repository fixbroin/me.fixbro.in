import { type NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from '@/lib/mysqlDbAdmin';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { verifyRequest } from '@/lib/dbSecurity';

const generateBookingId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FB-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(chars.length * Math.random()));
  }
  return result;
};

const getPriceForNthUnit = (service: any, n: number): number => {
  if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0 || n <= 0) {
    return service.discountedPrice ?? service.price;
  }
  const sortedVariants = [...service.priceVariants].sort((a: any, b: any) => a.fromQuantity - b.fromQuantity);
  const applicableTier = sortedVariants.find((tier: any) => {
    const start = tier.fromQuantity;
    const end = tier.toQuantity ?? Infinity;
    return n >= start && n <= end;
  });
  if (applicableTier) return applicableTier.price;
  const lastApplicableTier = sortedVariants.slice().reverse().find((tier: any) => n >= tier.fromQuantity);
  if (lastApplicableTier) return lastApplicableTier.price;
  return service.discountedPrice ?? service.price;
};

const calculateIncrementalTotalPriceForItem = (service: any, quantity: number): number => {
  if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0) {
    const unitPrice = service.discountedPrice ?? service.price;
    return unitPrice * quantity;
  }
  let total = 0;
  for (let i = 1; i <= quantity; i++) {
    total += getPriceForNthUnit(service, i);
  }
  return total;
};

const getBasePrice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
  if (isTaxInclusive && taxPercent && taxPercent > 0) {
    return (displayedPrice * 100) / (100 + taxPercent);
  }
  return displayedPrice;
};

export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    const body = await req.json();

    const {
      items = [],
      scheduledDate,
      scheduledTimeSlot,
      estimatedEndTime,
      customerAddress,
      paymentMethod = 'Online',
      promoCode,
      workCategoryId,
      interveningBreaks = [],
      dailyTimeline = []
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'Cart items are required.' }, { status: 400 });
    }

    if (!customerAddress || (!customerAddress.fullName && !user.uid)) {
      return NextResponse.json({ success: false, error: 'Customer address is required.' }, { status: 400 });
    }

    // 1. Fetch server application configuration
    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? (appConfigSnap.data() as any) : {};

    // 2. Fetch and calculate server-side service prices & taxes
    let verifiedSubTotal = 0;
    let verifiedTaxAmount = 0;
    const verifiedServices: any[] = [];

    for (const item of items) {
      if (!item.serviceId) continue;
      const svcSnap = await adminDb.collection('adminServices').doc(item.serviceId).get();
      if (!svcSnap.exists) {
        return NextResponse.json({ success: false, error: `Service "${item.serviceId}" not found in database.` }, { status: 404 });
      }

      const svc = svcSnap.data() as any;
      if (svc.isActive === false) {
        return NextResponse.json({ success: false, error: `Service "${svc.name}" is not currently active.` }, { status: 400 });
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const displayedPrice = calculateIncrementalTotalPriceForItem(svc, qty);
      verifiedSubTotal += displayedPrice;

      const taxRate = (svc.taxPercent || 0) > 0 ? svc.taxPercent : 0;
      const basePrice = getBasePrice(displayedPrice, svc.isTaxInclusive === true, taxRate);
      const itemTax = basePrice * (taxRate / 100);
      verifiedTaxAmount += itemTax;

      verifiedServices.push({
        serviceId: item.serviceId,
        name: svc.name,
        quantity: qty,
        pricePerUnit: displayedPrice / qty,
        discountedPricePerUnit: svc.discountedPrice || null,
        isTaxInclusive: svc.isTaxInclusive === true,
        taxPercentApplied: taxRate,
        taxAmountForItem: itemTax,
        imageUrl: svc.imageUrl || null
      });
    }

    if (verifiedServices.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid services in booking request.' }, { status: 400 });
    }

    // 3. Server-side Category visiting charge validation
    let visitingCharge = 0;
    if (workCategoryId) {
      const catSnap = await adminDb.collection('adminCategories').doc(workCategoryId).get();
      if (catSnap.exists) {
        const cat = catSnap.data() as any;
        const minBooking = cat.minimumBookingAmount || 0;
        const chargeAmount = cat.visitingChargeAmount || 0;
        if (chargeAmount > 0 && verifiedSubTotal < minBooking) {
          visitingCharge = chargeAmount;
        }
      }
    }

    // 4. Server-side Platform fee calculation
    let platformFeeTotal = 0;
    const appliedPlatformFees: any[] = [];
    const platformFeeSettings = appConfig.platformFeeSettings || [];
    if (appConfig.enablePlatformFee && Array.isArray(platformFeeSettings)) {
      for (const fee of platformFeeSettings) {
        if (fee.enabled) {
          let feeAmount = 0;
          if (fee.type === 'percentage') {
            feeAmount = (verifiedSubTotal * (fee.amount || 0)) / 100;
          } else {
            feeAmount = fee.amount || 0;
          }
          const feeTax = (fee.taxPercent || 0) > 0 ? (feeAmount * fee.taxPercent) / 100 : 0;
          platformFeeTotal += feeAmount + feeTax;
          appliedPlatformFees.push({
            name: fee.name || 'Platform Fee',
            amount: feeAmount,
            taxAmount: feeTax,
            total: feeAmount + feeTax,
            taxPercent: fee.taxPercent || 0
          });
        }
      }
    }

    // 5. Server-side Promo code validation
    let discountAmount = 0;
    let validPromoCode: string | null = null;
    if (promoCode && typeof promoCode === 'string' && promoCode.trim()) {
      const normalizedCode = promoCode.toUpperCase().trim();
      const promoSnap = await adminDb
        .collection('adminPromoCodes')
        .where('code', '==', normalizedCode)
        .limit(1)
        .get();

      let promoData: any = null;
      if (!promoSnap.empty) {
        promoData = promoSnap.docs[0].data();
      } else {
        const couponSnap = await adminDb
          .collection('adminCoupons')
          .where('code', '==', normalizedCode)
          .limit(1)
          .get();
        if (!couponSnap.empty) {
          promoData = couponSnap.docs[0].data();
        }
      }

      if (promoData && promoData.isActive !== false) {
        const minBooking = promoData.minimumBookingAmount || promoData.minBookingAmount || 0;
        if (verifiedSubTotal >= minBooking) {
          if (promoData.discountType === 'percentage') {
            discountAmount = (verifiedSubTotal * (promoData.discountValue || 0)) / 100;
            if (promoData.maxDiscountAmount && discountAmount > promoData.maxDiscountAmount) {
              discountAmount = promoData.maxDiscountAmount;
            }
          } else {
            discountAmount = promoData.discountValue || 0;
          }
          validPromoCode = normalizedCode;
        }
      }
    }

    // 6. Compute authoritative total amount
    const grossTotal = verifiedSubTotal + visitingCharge + verifiedTaxAmount + platformFeeTotal;
    const finalTotal = Math.max(0, Math.round((grossTotal - discountAmount) * 100) / 100);

    // 7. Booking construction
    const bookingId = generateBookingId();
    const isPayAfterService = paymentMethod === 'Pay After Service';
    let bookingNumber = 0;
    if (isPayAfterService) {
      bookingNumber = await assignNewBookingNumber();
    }

    const customerEmail = customerAddress?.email || (user.uid !== 'guest' ? user.email : '') || '';
    const customerName = customerAddress?.fullName || 'Customer';
    const customerPhone = customerAddress?.phone || '';

    const newBookingData = {
      bookingId,
      bookingNumber,
      ...(user.uid !== 'guest' ? { userId: user.uid } : {}),
      customerName,
      customerEmail,
      customerPhone,
      addressLine1: customerAddress?.addressLine1 || '',
      ...(customerAddress?.addressLine2 ? { addressLine2: customerAddress.addressLine2 } : {}),
      city: customerAddress?.city || '',
      state: customerAddress?.state || '',
      pincode: customerAddress?.pincode || '',
      ...(customerAddress?.latitude !== undefined && customerAddress.latitude !== null ? { latitude: customerAddress.latitude } : {}),
      ...(customerAddress?.longitude !== undefined && customerAddress.longitude !== null ? { longitude: customerAddress.longitude } : {}),
      scheduledDate: scheduledDate || new Date().toISOString().split('T')[0],
      scheduledTimeSlot: scheduledTimeSlot || '10:00 AM',
      estimatedEndTime: estimatedEndTime || null,
      interveningBreaks: Array.isArray(interveningBreaks) ? interveningBreaks : [],
      dailyTimeline: Array.isArray(dailyTimeline) ? dailyTimeline : [],
      services: verifiedServices,
      subTotal: verifiedSubTotal,
      ...(visitingCharge > 0 ? { visitingCharge } : {}),
      taxAmount: verifiedTaxAmount,
      platformFeeTotal,
      totalAmount: finalTotal,
      ...(validPromoCode ? { discountCode: validPromoCode, discountAmount } : {}),
      ...(appliedPlatformFees.length > 0 ? { appliedPlatformFees } : {}),
      paymentMethod: isPayAfterService ? 'Pay After Service' : 'Online',
      status: isPayAfterService ? 'Confirmed' : 'Pending Payment',
      paymentStatus: 'Pending',
      createdAt: Timestamp.now(),
      isReviewedByCustomer: false,
      workCategoryId: workCategoryId || null
    };

    const docRef = await adminDb.collection('bookings').add(newBookingData);

    return NextResponse.json({
      success: true,
      bookingId,
      bookingDocId: docRef.id,
      bookingNumber,
      totalAmount: finalTotal,
      paymentMethod: newBookingData.paymentMethod,
      status: newBookingData.status
    });

  } catch (error: any) {
    console.error('Error creating booking on server:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
