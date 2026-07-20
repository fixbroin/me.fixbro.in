"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { CheckCircle2, Home, ListOrdered, Mail, Download, Loader2, MapPin, Tag, HandCoins, Ban, Hash, Package, Calendar, Clock, CreditCard, Activity, IndianRupee, Wallet, AlertTriangle } from 'lucide-react';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, Timestamp, doc, getDoc, runTransaction, query, where, getDocs, limit, updateDoc, deleteDoc, setDoc } from '@/lib/mysqlDb';
import type { FirestoreBooking, BookingServiceItem, FirestoreService, FirestorePromoCode, AppSettings, AppliedPlatformFeeItem, FirestoreNotification, BookingStatus, MarketingAutomationSettings, MarketingSettings, ProviderApplication } from '@/types/firestore';
import { getActiveCheckoutEntries, removeCheckedOutItemsFromCart } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { sendBookingConfirmationEmail, type BookingConfirmationEmailInput } from '@/ai/flows/sendBookingEmailFlow';
import { useRouter } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId } from '@/lib/guestIdManager';
import { sendWhatsAppFlow } from '@/ai/flows/sendWhatsAppFlow';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { getTimestampMillis } from '@/lib/utils';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { incrementSystemStats } from '@/lib/systemStatsUtils';
import { getHaversineDistance } from '@/lib/locationUtils';

// Add type declarations for GTM dataLayer and gtag
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

interface DisplayBookingDetails extends FirestoreBooking {
    servicesSummary: string;
    scheduledDateDisplay: string;
    visitingChargeDisplayed: number;
}

const generateBookingId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FB-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(chars.length * Math.random()));
  }
  return result;
};

const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive: boolean, taxPercent: number): number => {
    if (!isTaxInclusive || taxPercent <= 0) return displayedPrice;
    return (displayedPrice * 100) / (100 + taxPercent);
};

const clearLocalStorageItems = async (uid?: string) => {
    try {
        await removeCheckedOutItemsFromCart(uid);
    } catch (e) {
        console.error("Error clearing cart after booking:", e);
    }
    if (typeof window !== 'undefined') {
        localStorage.removeItem('fixbroScheduledDate');
        localStorage.removeItem('fixbroScheduledTimeSlot');
        localStorage.removeItem('fixbroEstimatedEndTime');
        localStorage.removeItem('fixbroCustomerAddress');
        localStorage.removeItem('razorpayPaymentId');
        localStorage.removeItem('razorpayOrderId');
        localStorage.removeItem('razorpaySignature');
        localStorage.removeItem('fixbroAppliedPromoCode');
        localStorage.removeItem('fixbroBookingDiscountCode');
        localStorage.removeItem('fixbroBookingDiscountAmount');
        localStorage.removeItem('fixbroAppliedPromoCodeId');
        localStorage.removeItem('fixbroAppliedPlatformFees');
        localStorage.removeItem('isProcessingCancellationFee');
        localStorage.removeItem('bookingIdForCancellationFee');
        localStorage.removeItem('cancellationFeeAmount');
        localStorage.removeItem('fixbroPaymentMethod');
        localStorage.removeItem('fixbroFinalBookingTotal');
    }
};

// --- START: Pricing Logic ---
const getPriceForNthUnit = (service: FirestoreService, n: number): number => {
  if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0 || n <= 0) {
    return service.discountedPrice ?? service.price;
  }
  const sortedVariants = [...service.priceVariants].sort((a, b) => a.fromQuantity - b.fromQuantity);
  const applicableTier = sortedVariants.find(tier => {
    const start = tier.fromQuantity;
    const end = tier.toQuantity ?? Infinity;
    return n >= start && n <= end;
  });
  if (applicableTier) return applicableTier.price;
  const lastApplicableTier = sortedVariants.slice().reverse().find(tier => n >= tier.fromQuantity);
  if (lastApplicableTier) return lastApplicableTier.price;
  return service.discountedPrice ?? service.price;
};

const calculateIncrementalTotalPriceForItem = (service: FirestoreService, quantity: number): number => {
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
// --- END: Pricing Logic ---

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
        return dateString;
    }
};


export default function ThankYouPage() {
  const [isMounted, setIsMounted] = useState(false);
  const processingRef = useRef(false); // To prevent double processing in StrictMode
  const [bookingDetailsForDisplay, setBookingDetailsForDisplay] = useState<DisplayBookingDetails | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isCancellationConfirmation, setIsCancellationConfirmation] = useState(false);
  const [cancelledBookingId, setCancelledBookingId] = useState<string | null>(null); 
  const [cancellationFeePaidAmount, setCancellationFeePaidAmount] = useState<number>(0);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const { hideLoading } = useLoading();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const SummaryItem = ({ icon: Icon, label, value, className, valueClassName }: { icon: any, label: string, value: React.ReactNode, className?: string, valueClassName?: string }) => (
    <div className={cn("flex items-center justify-between py-3.5 group", className)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-colors">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className={cn("text-sm font-bold text-right ml-4", valueClassName)}>{value}</span>
    </div>
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || isLoadingAppSettings) return;

    const processPage = async () => {
      if (processingRef.current) return;
      processingRef.current = true;
      
      setIsLoadingPage(true);
      hideLoading(); 
      
      const paymentMethod = localStorage.getItem('fixbroPaymentMethod');
      const isOnlinePayment = paymentMethod === 'Online';
      
      const isProcessingCancellationFee = localStorage.getItem('isProcessingCancellationFee') === 'true';
      const bookingFirestoreDocIdForCancellation = localStorage.getItem('bookingIdForCancellationFee');
      const feeAmountStr = localStorage.getItem('cancellationFeeAmount');
      const razorpayPaymentId = localStorage.getItem('razorpayPaymentId'); 
      const razorpayOrderId = localStorage.getItem('razorpayOrderId');
      const razorpaySignature = localStorage.getItem('razorpaySignature');

      // --- 1. Handle Cancellation Fee Payment Verification ---
      if (isProcessingCancellationFee && bookingFirestoreDocIdForCancellation && feeAmountStr && razorpayPaymentId) {
        try {
            const verificationResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature }),
            });
            const verificationResult = await verificationResponse.json();
            if (!verificationResult.success || verificationResult.status !== 'captured') {
                throw new Error(verificationResult.error || "Payment verification failed.");
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });
            
            setIsCancellationConfirmation(true);
            const feeAmount = parseFloat(feeAmountStr);
            setCancellationFeePaidAmount(feeAmount);
            
            const originalBookingRef = doc(db, "bookings", bookingFirestoreDocIdForCancellation);
            const originalBookingSnap = await getDoc(originalBookingRef);
            if (originalBookingSnap.exists()) {
                const originalBookingData = originalBookingSnap.data() as FirestoreBooking;
                setCancelledBookingId(originalBookingData.bookingId);
                await updateDoc(originalBookingRef, { 
                    status: "Cancelled" as BookingStatus, 
                    updatedAt: Timestamp.now(),
                    cancellationFeePaid: feeAmount,
                    cancellationPaymentId: razorpayPaymentId,
                });
                toast({ title: "Booking Cancelled", description: `Booking ${originalBookingData.bookingId} has been cancelled.` });
            } else {
                toast({ title: "Error", description: "Original booking not found.", variant: "destructive" });
            }

        } catch (error) {
            console.error("Error during cancellation payment verification/update:", error);
            toast({ title: "Payment Error", description: (error as Error).message || "Failed to verify payment. Please contact support.", variant: "destructive" });
        } finally {
            await clearLocalStorageItems(currentUser?.uid);
            setIsLoadingPage(false);
        }
        return;
      }
      
      const cartEntriesFromStorage = getActiveCheckoutEntries();
      if (cartEntriesFromStorage.length === 0) {
        toast({ title: "Booking Processed", description: "Redirecting to My Bookings.", variant: "default" });
        router.push('/my-bookings');
        setIsLoadingPage(false);
        return;
      }

      // --- 2. Handle Regular Booking Confirmation ---
      if (isOnlinePayment) {
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            toast({ title: "Verification Failed", description: "Payment details are missing. Please contact support if you were charged.", variant: "destructive" });
            router.push('/cart'); setIsLoadingPage(false); return;
        }
        try {
            const verificationResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature }),
            });
            const verificationResult = await verificationResponse.json();
            if (!verificationResult.success || verificationResult.status !== 'captured') {
                throw new Error(verificationResult.error || "Payment verification failed. Please contact support.");
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });
            // Payment verified, we continue to create the booking
        } catch (error) {
            console.error("Error during regular payment verification:", error);
            toast({ title: "Payment Error", description: (error as Error).message, variant: "destructive", duration: 7000 });
            router.push('/checkout/payment'); setIsLoadingPage(false); return;
        }
      }

      try {
        const newBookingId = generateBookingId();
        let customerEmail = "customer@example.com", scheduledDateStored = new Date().toLocaleDateString('en-CA'), scheduledTimeSlot = "10:00 AM";
        let customerName = "Guest User", customerPhone = "N/A", addressLine1 = "N/A", addressLine2: string | undefined, city = "N/A", state = "N/A", pincode = "N/A";
        let latitude: number | undefined, longitude: number | undefined;
        let bookingDiscountCode: string | undefined, bookingDiscountAmount: number | undefined, appliedPromoCodeId: string | undefined;
        let storedAppliedPlatformFees: AppliedPlatformFeeItem[] = [];
        let estimatedEndTime: string | undefined;
        let currentCategoryId: string | null = null;
        let storedInterveningBreaks: any[] = [];
        let storedDailyTimeline: any[] = [];

        if (typeof window !== 'undefined') {
          customerEmail = localStorage.getItem('fixbroCustomerEmail') || customerEmail;
          currentCategoryId = localStorage.getItem('fixbroActiveCheckoutCategory');
          scheduledDateStored = localStorage.getItem('fixbroScheduledDate') || scheduledDateStored; 
          scheduledTimeSlot = localStorage.getItem('fixbroScheduledTimeSlot') || scheduledTimeSlot;
          estimatedEndTime = localStorage.getItem('fixbroEstimatedEndTime') || undefined;
          const breaksStr = localStorage.getItem('fixbroInterveningBreaks');
          if (breaksStr) { try { storedInterveningBreaks = JSON.parse(breaksStr); } catch (e) {} }
          const dailyTimelineStr = localStorage.getItem('fixbroDailyTimeline');
          if (dailyTimelineStr) { try { storedDailyTimeline = JSON.parse(dailyTimelineStr); } catch (e) {} }
          bookingDiscountCode = localStorage.getItem('fixbroBookingDiscountCode') || undefined;
          const discountAmountStr = localStorage.getItem('fixbroBookingDiscountAmount');
          bookingDiscountAmount = discountAmountStr ? parseFloat(discountAmountStr) : undefined;
          appliedPromoCodeId = localStorage.getItem('fixbroAppliedPromoCodeId') || undefined;
          const platformFeesStr = localStorage.getItem('fixbroAppliedPlatformFees');
          if (platformFeesStr) { try { storedAppliedPlatformFees = JSON.parse(platformFeesStr); } catch (e) { console.error("Error parsing stored platform fees:", e); } }
          const addressDataString = localStorage.getItem('fixbroCustomerAddress');
          if (addressDataString) { const addressData = JSON.parse(addressDataString); customerName = addressData.fullName || customerName; customerPhone = addressData.phone || customerPhone; addressLine1 = addressData.addressLine1 || addressLine1; addressLine2 = addressData.addressLine2 || undefined; city = addressData.city || city; state = addressData.state || state; pincode = addressData.pincode || pincode; latitude = addressData.latitude === null ? undefined : addressData.latitude; longitude = addressData.longitude === null ? undefined : addressData.longitude; }
        }

        let sumOfDisplayedItemPrices = 0;
        const serviceItemsPromises = cartEntriesFromStorage.map(async (entry) => {
          const serviceDocRef = doc(db, "adminServices", entry.serviceId);
          const serviceSnap = await getDoc(serviceDocRef);
          if (serviceSnap.exists()) {
            const serviceData = serviceSnap.data() as FirestoreService;
            const displayedPriceForQuantity = calculateIncrementalTotalPriceForItem(serviceData, entry.quantity);
            sumOfDisplayedItemPrices += displayedPriceForQuantity;
            
            const itemTaxRate = (serviceData.taxPercent || 0) > 0 ? (serviceData.taxPercent || 0) : 0;
            const basePriceForQuantity = getBasePriceForInvoice(displayedPriceForQuantity, serviceData.isTaxInclusive === true, itemTaxRate);
            const taxAmountForItem = basePriceForQuantity * (itemTaxRate / 100);

            return { serviceId: entry.serviceId, name: serviceData.name, quantity: entry.quantity, pricePerUnit: displayedPriceForQuantity / entry.quantity, 
              discountedPricePerUnit: serviceData.discountedPrice, 
              isTaxInclusive: serviceData.isTaxInclusive === true, 
              taxPercentApplied: itemTaxRate, taxAmountForItem: taxAmountForItem,
              _basePriceForBooking: basePriceForQuantity / entry.quantity,
              imageUrl: serviceData.imageUrl || null
            };
          } return null;
        });
        const resolvedServiceItems = (await Promise.all(serviceItemsPromises)).filter(item => item !== null) as (BookingServiceItem & {_basePriceForBooking: number})[];
        if (resolvedServiceItems.length !== cartEntriesFromStorage.length) { toast({title: "Error", description: "Some cart services not found. Booking aborted.", variant: "destructive"}); setIsLoadingPage(false); router.push('/cart'); return; }

        const baseSubTotalForBooking = resolvedServiceItems.reduce((sum, item) => sum + (item._basePriceForBooking * item.quantity), 0);
        
        let baseVisitingChargeForBooking = 0; 
        const subtotalForVcPolicyCheck = sumOfDisplayedItemPrices - (bookingDiscountAmount || 0);
        if (appConfig.enableMinimumBookingPolicy && typeof appConfig.minimumBookingAmount === 'number' && typeof appConfig.visitingChargeAmount === 'number') { if (subtotalForVcPolicyCheck > 0 && subtotalForVcPolicyCheck < appConfig.minimumBookingAmount) { baseVisitingChargeForBooking = getBasePriceForInvoice(appConfig.visitingChargeAmount, !!appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent); } }
        
        const totalItemTax = resolvedServiceItems.reduce((sum, item) => sum + (item.taxAmountForItem || 0), 0);
        let visitingChargeTax = 0; if (appConfig.enableTaxOnVisitingCharge && baseVisitingChargeForBooking > 0 && (appConfig.visitingChargeTaxPercent || 0) > 0) { visitingChargeTax = baseVisitingChargeForBooking * ((appConfig.visitingChargeTaxPercent || 0) / 100); }
        
        const totalBasePlatformFees = storedAppliedPlatformFees.reduce((sum, fee) => sum + fee.calculatedFeeAmount, 0);
        const totalTaxOnPlatformFees = storedAppliedPlatformFees.reduce((sum, fee) => sum + fee.taxAmountOnFee, 0);
        
        const totalTaxForBooking = totalItemTax + visitingChargeTax + totalTaxOnPlatformFees;
        const totalAmountForBooking = baseSubTotalForBooking + baseVisitingChargeForBooking + totalBasePlatformFees + totalTaxForBooking - (bookingDiscountAmount || 0);

        // --- SMART TAGGING & AUTO-DISPATCH LOGIC ---
        let coverageType: 'provider_match' | 'admin_only' = 'admin_only';
        let suggestedProviderIds: string[] = [];
        let autoAssignedProviderId: string | undefined = undefined;
        let bookingStatus: FirestoreBooking['status'] = (paymentMethod === 'later' || paymentMethod === 'Pay After Service') ? "Pending Payment" : "Confirmed";

        // Assign Sequential Booking Number
        const nextBookingNumber = await assignNewBookingNumber();

        const newBookingData: Omit<FirestoreBooking, 'id'> = {
          bookingId: newBookingId, 
          bookingNumber: nextBookingNumber,
          ...(currentUser?.uid && { userId: currentUser.uid }),
          customerName, customerEmail, customerPhone, addressLine1, ...(addressLine2 && { addressLine2 }), city, state, pincode,
          ...(latitude !== undefined && { latitude }), ...(longitude !== undefined && { longitude }),
          scheduledDate: scheduledDateStored,
          scheduledTimeSlot, 
          ...(estimatedEndTime && { estimatedEndTime }),
          interveningBreaks: storedInterveningBreaks,
          dailyTimeline: storedDailyTimeline,
          services: resolvedServiceItems.map(({ _basePriceForBooking, ...rest }) => rest),
          subTotal: baseSubTotalForBooking,
          ...(baseVisitingChargeForBooking > 0 && { visitingCharge: baseVisitingChargeForBooking }),
          taxAmount: totalTaxForBooking, totalAmount: totalAmountForBooking,
          ...(bookingDiscountCode !== undefined && { discountCode: bookingDiscountCode }),
          ...(bookingDiscountAmount !== undefined && { discountAmount: bookingDiscountAmount }),
          ...(storedAppliedPlatformFees.length > 0 && { appliedPlatformFees: storedAppliedPlatformFees }),
          paymentMethod: paymentMethod || "Unknown",
          status: (paymentMethod === 'later' || paymentMethod === 'Pay After Service') ? "Pending Payment" : "Confirmed",
          ...(razorpayPaymentId && { razorpayPaymentId }),
          ...(razorpayOrderId && { razorpayOrderId }),
          ...(razorpaySignature && { razorpaySignature }),
          createdAt: Timestamp.now(), isReviewedByCustomer: false,
          
          // Pass category info for server-side auto-dispatch
          workCategoryId: currentCategoryId || undefined,
        };

        const docRef = await addDoc(collection(db, "bookings"), newBookingData);
        // Track stats for new booking
        incrementSystemStats({ totalBookings: 1 }).catch(e => console.error("Stats increment error:", e));

        const servicesSummary = resolvedServiceItems.map(s => `${s.name} (x${s.quantity})`).join(', ');

        // Log the booking creation activity (User Activity)
        logUserActivity(
          'newBooking',
          {
            bookingId: newBookingId,
            bookingDocId: docRef.id,
            totalAmount: totalAmountForBooking,
            paymentMethod: paymentMethod || "Unknown",
            customerName,
            customerPhone,
            servicesSummary
          },
          currentUser?.uid,
          !currentUser ? getGuestId() : null,
          customerName
        );
        
        // --- SEND BOOKING NOTIFICATIONS (Push + In-App) ---
        try {
           // Notify User (Safe to do client-side if logged in)
           if (currentUser?.uid) {
              const userNotification: Omit<FirestoreNotification, 'id'> = {
                userId: currentUser.uid,
                title: "Booking Confirmed!",
                message: `Your booking ${newBookingId} has been successfully placed. We'll assign a provider shortly.`,
                type: 'success',
                href: '/my-bookings',
                read: false,
                createdAt: Timestamp.now(),
              };
              await addDoc(collection(db, "userNotifications"), userNotification);
              triggerPushNotification({
                userId: currentUser.uid,
                title: userNotification.title,
                body: userNotification.message,
                href: userNotification.href
              }).catch(err => console.error("Error sending user booking push:", err));
           }

           // Note: Admin notification is now handled exclusively by the server in /api/bookings/post-process
        } catch (notifyError) {
          console.error("Error sending booking notifications:", notifyError);
        }
        // --- END BOOKING NOTIFICATIONS ---

        // --- IMMEDIATELY PREPARE UI DATA AND SHOW SUCCESS SCREEN ---
        setBookingDetailsForDisplay({ 
            ...(newBookingData as FirestoreBooking), 
            id: docRef.id, 
            servicesSummary, 
            createdAt: (() => {
                const millis = getTimestampMillis(newBookingData.createdAt);
                return millis ? new Date(millis).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
            })(),
 
            scheduledDateDisplay: formatDateForDisplay(newBookingData.scheduledDate),
            latitude: newBookingData.latitude === undefined ? null : newBookingData.latitude, 
            longitude: newBookingData.longitude === undefined ? null : newBookingData.longitude, 
            visitingChargeDisplayed: baseVisitingChargeForBooking, 
            discountCode: newBookingData.discountCode, 
            discountAmount: newBookingData.discountAmount, 
            appliedPlatformFees: newBookingData.appliedPlatformFees 
        } as any);
        setIsLoadingPage(false); // Stop loading early
        toast({ title: "Booking Confirmed!", description: `Your booking ID is ${newBookingId}.`});

        // --- FIRE AND FORGET: Server handles everything else safely ---
        fetch('/api/bookings/post-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingDocId: docRef.id }),
        }).catch(err => console.error("Error triggering server post-process:", err));

        await clearLocalStorageItems(currentUser?.uid);

      } catch (error) {
        console.error("Error creating booking:", error);
        toast({ title: "Booking Failed", description: (error as Error).message || "Could not complete booking.", variant: "destructive" });
        setIsLoadingPage(false);
      }
    };

    processPage();
  }, [isMounted, isLoadingAppSettings, appConfig, toast, router, currentUser, hideLoading]);

  if (isLoadingPage || !isMounted || isLoadingAppSettings || (!bookingDetailsForDisplay && !isCancellationConfirmation)) {
    return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <CheckoutStepper currentStepId="confirmation" />
        <Card className="shadow-lg"><CardHeader className="items-center text-center"><Loader2 className="h-12 w-12 text-primary animate-spin mb-4" /><CardTitle className="text-xl sm:text-2xl">Processing Your Request...</CardTitle><CardDescription className="text-sm sm:text-base">Please wait a moment.</CardDescription></CardHeader><CardContent className="space-y-4 min-h-[200px]"></CardContent></Card>
      </div>
    );
  }

  if (isCancellationConfirmation) {
    return (
      <div className="max-w-3xl mx-auto px-2 sm:px-0 pb-10">
        <Card className="shadow-2xl border-none overflow-hidden rounded-3xl text-center">
          <CardHeader className="items-center px-4 sm:px-6 pt-10 pb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-destructive/10 blur-3xl rounded-full scale-150 animate-pulse" />
              <Ban className="h-20 w-20 sm:h-24 sm:w-24 text-destructive relative z-10" />
            </div>
            <CardTitle className="text-3xl sm:text-4xl font-black mt-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Booking Cancelled</CardTitle>
            <CardDescription className="text-lg text-muted-foreground font-medium max-w-sm mx-auto">
                Cancellation fee of <span className="text-foreground font-bold">₹{cancellationFeePaidAmount.toFixed(2)}</span> has been paid.
                Booking ID: <span className="text-foreground font-bold">#{cancelledBookingId || 'N/A'}</span> has been successfully cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 md:px-8 pb-8 pt-2">
             <div className="p-4 rounded-2xl bg-muted border border-border/50 text-sm text-muted-foreground">
                If applicable, any refund will be processed to your original payment method within 5-7 business days.
             </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-4 justify-center p-8 bg-muted/30 border-t">
            <Link href="/" passHref className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 font-bold rounded-xl border-2 hover:bg-background shadow-sm">
                <Home className="mr-2 h-4 w-4" /> Go to Home
              </Button>
            </Link>
            <Link href="/my-bookings" passHref className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-12 font-bold rounded-xl shadow-lg shadow-primary/20">
                <ListOrdered className="mr-2 h-4 w-4" /> View My Bookings
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  if (!bookingDetailsForDisplay) {
     return (
      <div className="max-w-3xl mx-auto px-2 sm:px-0 pb-10">
        <CheckoutStepper currentStepId="confirmation" />
        <Card className="shadow-2xl border-none overflow-hidden rounded-3xl text-center">
            <CardHeader className="items-center px-4 sm:px-6 pt-10 pb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full scale-150 animate-pulse" />
                  <CheckCircle2 className="h-20 w-20 sm:h-24 sm:w-24 text-accent relative z-10" />
                </div>
                <CardTitle className="text-3xl sm:text-4xl font-black mt-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Booking Processed</CardTitle>
                <CardDescription className="text-lg text-muted-foreground font-medium max-w-sm mx-auto">
                    Your request has been successfully received and processed.
                </CardDescription>
            </CardHeader>
             <CardContent className="px-4 sm:px-6 md:px-8 pb-8 pt-2">
                 <p className="text-center text-muted-foreground">Loading your booking details. You can also view them in your account profile.</p>
             </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-4 justify-center p-8 bg-muted/30 border-t">
                <Link href="/" passHref className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 font-bold rounded-xl border-2 hover:bg-background shadow-sm">
                    <Home className="mr-2 h-4 w-4" /> Go to Home
                  </Button>
                </Link>
                <Link href="/my-bookings" passHref className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto h-12 font-bold rounded-xl shadow-lg shadow-primary/20">
                    <ListOrdered className="mr-2 h-4 w-4" /> View My Bookings
                  </Button>
                </Link>
            </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-2 sm:px-0 pb-10">
      <CheckoutStepper currentStepId="confirmation" />
      <Card className="shadow-2xl border-none overflow-hidden rounded-3xl">
        <CardHeader className="items-center px-4 sm:px-6 pt-10 pb-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full scale-150 animate-pulse" />
            <CheckCircle2 className="h-20 w-20 sm:h-24 sm:w-24 text-accent relative z-10" />
          </div>
          <CardTitle className="text-3xl sm:text-4xl font-black mt-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Booking Confirmed!
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground font-medium max-w-sm mx-auto">
            Sit back and relax. Your service has been successfully scheduled.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-4 sm:px-8 pb-8 pt-2 text-left">
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-bold mb-6 text-center text-foreground flex items-center justify-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Booking Summary
            </h3>
            
            <div className="space-y-0">
                <SummaryItem icon={Hash} label="Booking ID" value={bookingDetailsForDisplay.bookingId} />
                <Separator className="opacity-40" />
                
                <SummaryItem icon={Package} label="Service(s)" value={bookingDetailsForDisplay.servicesSummary} />
                <Separator className="opacity-40" />
                
                <SummaryItem icon={Calendar} label="Scheduled Date" value={bookingDetailsForDisplay.scheduledDateDisplay} />
                <Separator className="opacity-40" />
                
                <SummaryItem icon={Clock} label="Time Slot" value={bookingDetailsForDisplay.scheduledTimeSlot} />
                <Separator className="opacity-40" />

                {bookingDetailsForDisplay.estimatedEndTime && (
                  <>
                    <SummaryItem 
                        icon={Activity} 
                        label="Estimated Completion" 
                        valueClassName="text-emerald-600"
                        value={`${new Date(bookingDetailsForDisplay.estimatedEndTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${new Date(bookingDetailsForDisplay.estimatedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`} 
                    />
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.dailyTimeline && bookingDetailsForDisplay.dailyTimeline.length > 1 && (
                  <>
                    <div className="py-2.5 px-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 rounded-xl space-y-2 text-sm text-muted-foreground my-2">
                      <p className="font-bold text-xs text-blue-800 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Day-by-Day Work Schedule
                      </p>
                      <div className="space-y-1.5 pl-1">
                        {bookingDetailsForDisplay.dailyTimeline.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap text-sm py-1.5 border-b border-border/20 last:border-0">
                            <span className="font-semibold text-foreground/80">{item.dateLabel}</span>
                            <span className="font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap">
                              {item.startTime} - {item.endTime}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.interveningBreaks && bookingDetailsForDisplay.interveningBreaks.length > 0 && (
                  <>
                    <div className="py-2 px-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 rounded-xl space-y-1.5 text-xs text-muted-foreground my-2">
                      <p className="font-bold text-[10px] text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Includes Gaps / Holidays
                      </p>
                      <div className="space-y-1 pl-1">
                        {bookingDetailsForDisplay.interveningBreaks.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className={`mt-1.5 h-1.5 w-1.5 rounded-full ${item.type === 'holiday' ? 'bg-red-500' : item.type === 'partial' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                            <div className="text-muted-foreground">
                              <span className="font-semibold text-foreground/80">{item.dateLabel}</span>
                              {item.timeLabel && <span className="ml-1">({item.timeLabel})</span>}
                              <span className="ml-1.5 font-medium text-muted-foreground/80">— {item.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator className="opacity-40" />
                  </>
                )}

                <SummaryItem icon={MapPin} label="Address" value={`${bookingDetailsForDisplay.addressLine1}${bookingDetailsForDisplay.addressLine2 ? ', ' + bookingDetailsForDisplay.addressLine2 : ''}, ${bookingDetailsForDisplay.city}`} />
                <Separator className="opacity-40" />

                <SummaryItem icon={IndianRupee} label="Items Total" value={`₹${bookingDetailsForDisplay.subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                <Separator className="opacity-40" />

                {bookingDetailsForDisplay.discountAmount != null && bookingDetailsForDisplay.discountAmount > 0 && (
                  <>
                    <SummaryItem 
                        icon={Tag} 
                        label={`Discount (${bookingDetailsForDisplay.discountCode || 'Applied'})`} 
                        valueClassName="text-emerald-600"
                        value={`- ₹${bookingDetailsForDisplay.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
                    />
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.visitingChargeDisplayed != null && bookingDetailsForDisplay.visitingChargeDisplayed > 0 && (
                  <>
                    <SummaryItem icon={IndianRupee} label="Visiting Charge" value={`+ ₹${bookingDetailsForDisplay.visitingCharge?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.appliedPlatformFees?.map((fee, index) => (
                  <React.Fragment key={index}>
                    <SummaryItem icon={HandCoins} label={fee.name} value={`+ ₹${(fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(2)}`} />
                    <Separator className="opacity-40" />
                  </React.Fragment>
                ))}

                {bookingDetailsForDisplay.taxAmount > 0 && (
                  <>
                    <SummaryItem icon={Activity} label="Total Tax" value={`+ ₹${bookingDetailsForDisplay.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                    <Separator className="opacity-40" />
                  </>
                )}

                <SummaryItem 
                    icon={CreditCard} 
                    label="Total Amount" 
                    valueClassName="text-xl text-primary"
                    value={`₹${bookingDetailsForDisplay.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
                />
                <Separator className="opacity-40" />

                <SummaryItem icon={Wallet} label="Payment Method" value={bookingDetailsForDisplay.paymentMethod} />
                <Separator className="opacity-40" />

                <SummaryItem icon={Activity} label="Status" value={bookingDetailsForDisplay.status} />
            </div>

            <div className="mt-8 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center gap-3">
               <Mail className="h-5 w-5 text-primary shrink-0" />
               <p className="text-sm text-muted-foreground text-center">
                 Confirmation sent to <span className="font-bold text-foreground">{bookingDetailsForDisplay.customerEmail}</span>
               </p>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-4 justify-center p-8 bg-muted/30 border-t">
          <Link href="/" passHref className="w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 font-bold rounded-xl border-2 hover:bg-background shadow-sm">
              <Home className="mr-2 h-4 w-4" /> Go to Home
            </Button>
          </Link>
          <Link href="/my-bookings" passHref className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto h-12 font-bold rounded-xl shadow-lg shadow-primary/20">
              <ListOrdered className="mr-2 h-4 w-4" /> View My Bookings
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
