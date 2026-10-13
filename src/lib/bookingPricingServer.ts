// src/lib/bookingPricingServer.ts
import { adminDb } from '@/lib/firebaseAdmin';
import { calculateIncrementalTotalPriceForItem, getBasePriceForInvoice, generateBookingId } from './bookingUtils';
import { assignNewBookingNumber } from './webServerUtils';
import { Timestamp } from './mysqlDbAdmin';
import { getPool, getDocsInternal } from './mysql';
import type { FirestoreService, FirestorePromoCode, AppliedPlatformFeeItem } from '@/types/firestore';

export interface CartInputItem {
  serviceId: string;
  quantity: number;
}

export interface CalculateServerBookingOptions {
  cartEntries: CartInputItem[];
  promoCode?: string;
  categoryId?: string;
}

export interface ServerBookingCalculationResult {
  services: any[];
  subTotal: number;
  visitingCharge: number;
  taxAmount: number;
  platformFeeTotal: number;
  appliedPlatformFees: AppliedPlatformFeeItem[];
  discountAmount: number;
  discountCode?: string;
  totalAmount: number;
  currency: string;
}

/**
 * Authoritative Server-Side Pricing Engine
 * Recalculates service prices, taxes, visiting charges, platform fees, and validated promo discounts.
 * Eliminates client price tampering.
 */
export async function calculateServerBookingTotal(
  options: CalculateServerBookingOptions
): Promise<ServerBookingCalculationResult> {
  const { cartEntries, promoCode, categoryId } = options;

  if (!Array.isArray(cartEntries) || cartEntries.length === 0) {
    throw new Error('Cart is empty.');
  }

  // 1. Fetch App Configuration
  const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
  const appConfig = appConfigSnap.exists ? (appConfigSnap.data() as any) : {};
  const currency = appConfig.currencyCode || 'INR';

  // 2. Fetch and resolve each service from database
  let baseSubTotal = 0;
  let totalItemTax = 0;
  let sumOfDisplayedItemPrices = 0;
  const resolvedServices: any[] = [];

  for (const entry of cartEntries) {
    if (!entry.serviceId || !entry.quantity || entry.quantity < 1) continue;

    const serviceDoc = await adminDb.collection('adminServices').doc(entry.serviceId).get();
    if (!serviceDoc.exists) {
      throw new Error(`Service "${entry.serviceId}" does not exist in catalog.`);
    }

    const serviceData = serviceDoc.data() as FirestoreService;
    const qty = Math.max(1, Math.floor(entry.quantity));
    const displayedPrice = calculateIncrementalTotalPriceForItem(serviceData, qty);
    sumOfDisplayedItemPrices += displayedPrice;

    const taxRate = (serviceData.taxPercent || 0) > 0 ? serviceData.taxPercent || 0 : 0;
    const isTaxInclusive = serviceData.isTaxInclusive === true;
    const basePrice = getBasePriceForInvoice(displayedPrice, isTaxInclusive, taxRate);
    const taxAmount = basePrice * (taxRate / 100);

    baseSubTotal += basePrice;
    totalItemTax += taxAmount;

    resolvedServices.push({
      serviceId: entry.serviceId,
      name: serviceData.name,
      quantity: qty,
      pricePerUnit: displayedPrice / qty,
      discountedPricePerUnit: serviceData.discountedPrice || null,
      isTaxInclusive,
      taxPercentApplied: taxRate,
      taxAmountForItem: taxAmount,
      _basePriceForBooking: basePrice / qty,
      imageUrl: serviceData.imageUrl || null,
    });
  }

  if (resolvedServices.length === 0) {
    throw new Error('No valid services found in cart.');
  }

  // 3. Category Overrides (visiting charge & minimum booking amount)
  let customVisitingCharge: number | undefined;
  let customMinBooking: number | undefined;

  if (categoryId) {
    try {
      const catDoc = await adminDb.collection('adminCategories').doc(categoryId).get();
      if (catDoc.exists) {
        const catData = catDoc.data();
        if (typeof catData?.visitingChargeAmount === 'number') {
          customVisitingCharge = catData.visitingChargeAmount;
        }
        if (typeof catData?.minimumBookingAmount === 'number') {
          customMinBooking = catData.minimumBookingAmount;
        }
      }
    } catch (e) {
      console.warn('Error fetching category overrides:', e);
    }
  }

  const vcAmount = typeof customVisitingCharge === 'number' ? customVisitingCharge : (appConfig.visitingChargeAmount || 0);
  const minBooking = typeof customMinBooking === 'number' ? customMinBooking : (appConfig.minimumBookingAmount || 0);

  // 4. Visiting Charge Calculation
  let baseVisitingCharge = 0;
  let visitingChargeTax = 0;

  if (appConfig.enableMinimumBookingPolicy && minBooking > 0 && vcAmount > 0) {
    if (sumOfDisplayedItemPrices < minBooking) {
      const isVcTaxInclusive = !!appConfig.isVisitingChargeTaxInclusive;
      const vcTaxPercent = appConfig.visitingChargeTaxPercent || 0;
      baseVisitingCharge = getBasePriceForInvoice(vcAmount, isVcTaxInclusive, vcTaxPercent);
      if (appConfig.enableTaxOnVisitingCharge && vcTaxPercent > 0) {
        visitingChargeTax = baseVisitingCharge * (vcTaxPercent / 100);
      }
    }
  }

  // 5. Platform Fees Calculation
  const appliedPlatformFees: AppliedPlatformFeeItem[] = [];
  let totalBasePlatformFees = 0;
  let totalTaxOnPlatformFees = 0;

  const rawPlatformFees = appConfig.platformFees;
  const platformFeesList: any[] = Array.isArray(rawPlatformFees)
    ? rawPlatformFees
    : (rawPlatformFees && typeof rawPlatformFees === 'object' ? Object.values(rawPlatformFees) : []);

  const isPlatformFeeGloballyEnabled = appConfig.enablePlatformFee !== false;

  // Platform fees apply when enabled and visiting charge is not applied (matching client rules across checkout & admin)
  if (isPlatformFeeGloballyEnabled && baseVisitingCharge === 0 && platformFeesList.length > 0) {
    for (const fee of platformFeesList) {
      if (!fee || fee.isActive === false || fee.isActive === 'false') continue;

      let feeAmount = 0;
      if (fee.type === 'percentage') {
        feeAmount = (sumOfDisplayedItemPrices * (Number(fee.value) || 0)) / 100;
      } else {
        feeAmount = Number(fee.value) || 0;
      }

      const taxRate = typeof fee.feeTaxRatePercent === 'number'
        ? fee.feeTaxRatePercent
        : (typeof fee.taxRate === 'number' ? fee.taxRate : 0);
      const taxAmount = (feeAmount * taxRate) / 100;

      appliedPlatformFees.push({
        name: fee.name || 'Platform Fee',
        type: fee.type || 'fixed',
        valueApplied: Number(fee.value) || 0,
        calculatedFeeAmount: Number(feeAmount.toFixed(2)),
        taxRatePercentOnFee: taxRate,
        taxAmountOnFee: Number(taxAmount.toFixed(2)),
        amount: Number((feeAmount + taxAmount).toFixed(2)),
      });

      totalBasePlatformFees += feeAmount;
      totalTaxOnPlatformFees += taxAmount;
    }
  }

  // 6. Server-Side Promo Code Validation
  let calculatedDiscount = 0;
  let appliedPromoCodeStr: string | undefined;

  if (promoCode && promoCode.trim()) {
    const cleanCode = promoCode.trim().toUpperCase();
    try {
      const promoQuery = await adminDb.collection('adminPromoCodes').where('code', '==', cleanCode).limit(1).get();
      if (!promoQuery.empty) {
        const promoDoc = promoQuery.docs[0];
        const promoData = promoDoc.data() as FirestorePromoCode;

        const isPromoActive = promoData.isActive !== false;
        let isNotExpired = true;

        const validUntil = promoData.validUntil || promoData.endDate;
        if (validUntil) {
          const expiryMillis = (validUntil as any).toDate 
            ? (validUntil as any).toDate().getTime() 
            : ((validUntil as any).seconds ? (validUntil as any).seconds * 1000 : new Date(validUntil as any).getTime());
          if (!isNaN(expiryMillis) && expiryMillis < Date.now()) {
            isNotExpired = false;
          }
        }

        const minAmount = promoData.minBookingAmount || (promoData as any).minOrderAmount || 0;
        const meetsMinimumOrder = !minAmount || sumOfDisplayedItemPrices >= minAmount;

        if (isPromoActive && isNotExpired && meetsMinimumOrder) {
          if (promoData.discountType === 'percentage') {
            calculatedDiscount = (sumOfDisplayedItemPrices * (promoData.discountValue || 0)) / 100;
          } else {
            calculatedDiscount = promoData.discountValue || 0;
          }

          calculatedDiscount = Math.min(calculatedDiscount, sumOfDisplayedItemPrices);
          appliedPromoCodeStr = cleanCode;
        }
      }
    } catch (e) {
      console.warn('Error validating promo code on server:', e);
    }
  }

  // 7. Final Authoritative Total
  const totalTax = totalItemTax + visitingChargeTax + totalTaxOnPlatformFees;
  const platformFeeTotal = totalBasePlatformFees + totalTaxOnPlatformFees;
  const totalAmount = Math.max(0, baseSubTotal + baseVisitingCharge + totalBasePlatformFees + totalTax - calculatedDiscount);

  return {
    services: resolvedServices,
    subTotal: Number(baseSubTotal.toFixed(2)),
    visitingCharge: Number(baseVisitingCharge.toFixed(2)),
    taxAmount: Number(totalTax.toFixed(2)),
    platformFeeTotal: Number(platformFeeTotal.toFixed(2)),
    appliedPlatformFees,
    discountAmount: Number(calculatedDiscount.toFixed(2)),
    discountCode: appliedPromoCodeStr,
    totalAmount: Number(totalAmount.toFixed(2)),
    currency,
  };
}

export interface FulfillDraftOptions {
  draftId: string;
  gateway: 'razorpay' | 'stripe';
  paymentDetails: {
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    razorpaySignature?: string;
    stripeSessionId?: string;
    stripePaymentIntent?: string | null;
  };
  triggerSource: string;
}

/**
 * Idempotently creates a Confirmed online booking from a server-side checkoutDraft
 * once payment has been cryptographically verified.
 */
export async function fulfillCheckoutDraft(options: FulfillDraftOptions): Promise<{
  booking: any;
  bookingDocId: string;
  bookingId: string;
  alreadyExisted: boolean;
} | null> {
  const { draftId, gateway, paymentDetails, triggerSource } = options;
  const pool = await getPool();

  // 1. Check idempotency in bookings table first
  if (gateway === 'razorpay' && paymentDetails.razorpayOrderId) {
    const existing = await getDocsInternal(pool, 'bookings', [
      { type: 'where', field: 'razorpayOrderId', op: '==', value: paymentDetails.razorpayOrderId },
      { type: 'limit', value: 1 },
    ]);
    if (existing && existing.length > 0) {
      return {
        booking: existing[0],
        bookingDocId: existing[0].id,
        bookingId: existing[0].bookingId,
        alreadyExisted: true,
      };
    }
  } else if (gateway === 'stripe' && paymentDetails.stripeSessionId) {
    const existing = await getDocsInternal(pool, 'bookings', [
      { type: 'where', field: 'stripeSessionId', op: '==', value: paymentDetails.stripeSessionId },
      { type: 'limit', value: 1 },
    ]);
    if (existing && existing.length > 0) {
      return {
        booking: existing[0],
        bookingDocId: existing[0].id,
        bookingId: existing[0].bookingId,
        alreadyExisted: true,
      };
    }
  }

  // 2. Look up the checkoutDraft document
  const draftRef = adminDb.collection('checkoutDrafts').doc(draftId);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) {
    return null;
  }

  const draft = draftSnap.data() as any;

  // If draft was already marked completed with a bookingDocId, return that booking
  if (draft.bookingDocId) {
    const existingSnap = await adminDb.collection('bookings').doc(draft.bookingDocId).get();
    if (existingSnap.exists) {
      const existingData = existingSnap.data() as any;
      return {
        booking: { ...existingData, id: existingSnap.id },
        bookingDocId: existingSnap.id,
        bookingId: existingData.bookingId,
        alreadyExisted: true,
      };
    }
  }

  if (!Array.isArray(draft.cartEntries) || draft.cartEntries.length === 0) {
    return null;
  }

  const customerInfo = draft.customerInfo || {};
  const schedule = draft.schedule || {};
  const workCategoryId = draft.workCategoryId || undefined;
  const promoCode = draft.promoCode || undefined;

  let resolvedUserId: string | undefined =
    typeof draft.userId === 'string' && draft.userId.trim() ? draft.userId.trim() : undefined;

  const emailToMatch = (customerInfo.email || '').toLowerCase().trim();
  if (!resolvedUserId && emailToMatch) {
    try {
      const matchingUsers = await getDocsInternal(pool, 'users', [
        { type: 'where', field: 'email', op: '==', value: emailToMatch },
        { type: 'limit', value: 1 },
      ]);
      if (matchingUsers && matchingUsers.length > 0) {
        resolvedUserId = matchingUsers[0].id;
      }
    } catch (e) {
      console.warn('Could not look up user by email in fulfillCheckoutDraft:', e);
    }
  }

  // 3. Calculate authoritative server price
  const pricing = await calculateServerBookingTotal({
    cartEntries: draft.cartEntries,
    promoCode,
    categoryId: workCategoryId,
  });

  // 4. Generate sequential booking number & booking ID
  const nextBookingNumber = await assignNewBookingNumber();
  const newBookingId = generateBookingId();

  const onlineFields: Record<string, any> =
    gateway === 'razorpay'
      ? {
          razorpayPaymentId: paymentDetails.razorpayPaymentId,
          razorpayOrderId: paymentDetails.razorpayOrderId,
          ...(paymentDetails.razorpaySignature && { razorpaySignature: paymentDetails.razorpaySignature }),
        }
      : {
          stripeSessionId: paymentDetails.stripeSessionId,
          ...(paymentDetails.stripePaymentIntent && { stripePaymentIntent: paymentDetails.stripePaymentIntent }),
        };

  const newBookingData: Record<string, any> = {
    bookingId: newBookingId,
    bookingNumber: nextBookingNumber,
    ...(resolvedUserId && { userId: resolvedUserId }),
    customerName: customerInfo.fullName || customerInfo.name || 'Guest User',
    customerEmail: customerInfo.email || '',
    customerPhone: customerInfo.phone || 'N/A',
    addressLine1: customerInfo.addressLine1 || 'N/A',
    ...(customerInfo.addressLine2 && { addressLine2: customerInfo.addressLine2 }),
    city: customerInfo.city || 'N/A',
    state: customerInfo.state || 'N/A',
    pincode: customerInfo.pincode || 'N/A',
    ...(customerInfo.latitude !== undefined && customerInfo.latitude !== null && { latitude: customerInfo.latitude }),
    ...(customerInfo.longitude !== undefined && customerInfo.longitude !== null && { longitude: customerInfo.longitude }),
    scheduledDate: schedule.scheduledDate || new Date().toISOString().split('T')[0],
    scheduledTimeSlot: schedule.scheduledTimeSlot || '10:00 AM',
    ...(schedule.estimatedEndTime && { estimatedEndTime: schedule.estimatedEndTime }),
    interveningBreaks: schedule.interveningBreaks || [],
    dailyTimeline: schedule.dailyTimeline || [],
    services: pricing.services,
    subTotal: pricing.subTotal,
    ...(pricing.visitingCharge > 0 && { visitingCharge: pricing.visitingCharge }),
    taxAmount: pricing.taxAmount,
    totalAmount: pricing.totalAmount,
    platformFeeTotal: pricing.platformFeeTotal,
    ...(pricing.appliedPlatformFees.length > 0 && { appliedPlatformFees: pricing.appliedPlatformFees }),
    ...(pricing.discountCode && { discountCode: pricing.discountCode }),
    ...(pricing.discountAmount > 0 && { discountAmount: pricing.discountAmount }),
    paymentMethod: 'Online',
    status: 'Confirmed',
    ...onlineFields,
    createdAt: Timestamp.now(),
    isReviewedByCustomer: false,
    ...(workCategoryId && { workCategoryId }),
  };

  const docRef = await adminDb.collection('bookings').add(newBookingData);

  await draftRef.update({
    status: 'completed',
    bookingDocId: docRef.id,
    bookingId: newBookingId,
    updatedAt: Timestamp.now(),
  });

  // Trigger Server-Side Post Processing (Notifications, Dispatch, WhatsApp)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006';
  fetch(`${appUrl}/api/bookings/post-process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingDocId: docRef.id,
      triggerSource,
    }),
  }).catch((err) => console.error('Error triggering post-process from fulfillCheckoutDraft:', err));

  if (resolvedUserId) {
    try {
      await adminDb.collection('userNotifications').add({
        userId: resolvedUserId,
        title: 'Booking Confirmed!',
        message: `Your booking ${newBookingId} has been successfully placed. We'll assign a provider shortly.`,
        type: 'success',
        href: '/my-bookings',
        read: false,
        createdAt: Timestamp.now(),
      });
    } catch (notifyErr) {
      console.error('Error sending in-app notification in fulfillCheckoutDraft:', notifyErr);
    }
  }

  return {
    booking: { ...newBookingData, id: docRef.id },
    bookingDocId: docRef.id,
    bookingId: newBookingId,
    alreadyExisted: false,
  };
}

