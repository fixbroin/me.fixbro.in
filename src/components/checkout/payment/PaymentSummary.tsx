
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Info, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from '@/lib/mysqlDb';
import type { FirestoreService, AppliedPlatformFeeItem } from '@/types/firestore';
import { getActiveCheckoutEntries, type CartEntry } from '@/lib/cartManager';
import TaxBreakdownDisplay from '@/components/shared/TaxBreakdownDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from "@/components/ui/alert";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface AppliedPromoCodeInfo {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  calculatedDiscount: number;
}

const getBasePrice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
  if (isTaxInclusive && taxPercent && taxPercent > 0) {
    return displayedPrice / (1 + taxPercent / 100);
  }
  return displayedPrice;
};

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

interface PaymentSummaryProps {
  paymentMethod: string;
  canBook: boolean;
  appliedPromo: AppliedPromoCodeInfo | null;
  onSumCalculated?: (sum: number) => void;
}

export default function PaymentSummary({ paymentMethod, canBook, appliedPromo, onSumCalculated }: PaymentSummaryProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { showLoading, hideLoading } = useLoading();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const { settings: globalSettings } = useGlobalSettings();

  const [cartEntries, setCartEntries] = useState<CartEntry[]>([]);
  const [serviceDetailsMap, setServiceDetailsMap] = useState<Record<string, FirestoreService>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [subTotal, setSubTotal] = useState(0); 
  const [visitingCharge, setVisitingCharge] = useState(0); 
  const [taxAmount, setTaxAmount] = useState(0); 
  const [totalAmountDue, setTotalAmountDue] = useState(0); 
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);

  const [calculatedPlatformFees, setCalculatedPlatformFees] = useState<AppliedPlatformFeeItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isTaxBreakdownOpen, setIsTaxBreakdownOpen] = useState(false);
  const [taxBreakdownItems, setTaxBreakdownItems] = useState<any[]>([]);
  const [visitingChargeBreakdown, setVisitingChargeBreakdown] = useState<any>(null);
  const [sumOfDisplayedItemPrices, setSumOfDisplayedItemPrices] = useState(0);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const entries = getActiveCheckoutEntries();
    setCartEntries(entries);

    if (entries.length === 0) {
      setIsLoading(false);
      return;
    }

    try {
      const detailsPromises = entries.map(async (entry) => {
        const serviceSnap = await getDoc(doc(db, "adminServices", entry.serviceId));
        return serviceSnap.exists() ? { ...serviceSnap.data(), id: serviceSnap.id } as FirestoreService : null;
      });
      const resolved = (await Promise.all(detailsPromises)).filter(Boolean) as FirestoreService[];
      const map = resolved.reduce((acc, s) => ({ ...acc, [s.id]: s }), {});
      setServiceDetailsMap(map);
    } catch (error) {
      console.error("Error loading payment data", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isLoading || isLoadingAppSettings || cartEntries.length === 0) return;

    let currentBaseSubtotal = 0;
    let currentSumOfDisplayed = 0;
    const newBreakdown: any[] = [];

    cartEntries.forEach((entry) => {
      const detail = serviceDetailsMap[entry.serviceId];
      if (detail) {
        const displayedPrice = calculateIncrementalTotalPriceForItem(detail, entry.quantity);
        currentSumOfDisplayed += displayedPrice;
        const taxRate = detail.taxPercent || 0;
        const basePrice = getBasePrice(displayedPrice, detail.isTaxInclusive, taxRate);
        currentBaseSubtotal += basePrice;
        const itemTax = basePrice * (taxRate / 100);
        newBreakdown.push({
          name: detail.name,
          quantity: entry.quantity,
          pricePerUnit: displayedPrice / entry.quantity,
          itemSubtotal: basePrice,
          taxPercent: taxRate,
          taxAmount: itemTax,
          isTaxInclusive: detail.isTaxInclusive === true
        });
      }
    });

    setSumOfDisplayedItemPrices(currentSumOfDisplayed);
    if (onSumCalculated) onSumCalculated(currentSumOfDisplayed);
    setSubTotal(currentBaseSubtotal);
    setTaxBreakdownItems(newBreakdown);

    let currentDiscount = 0;
    if (appliedPromo && currentSumOfDisplayed > 0) {
      if (appliedPromo.discountType === 'percentage') {
        currentDiscount = (currentSumOfDisplayed * appliedPromo.discountValue) / 100;
      } else {
        currentDiscount = appliedPromo.discountValue;
      }
      currentDiscount = Math.min(currentDiscount, currentSumOfDisplayed);
      setDiscountAmount(currentDiscount);
    } else {
      setDiscountAmount(0);
    }

    const netAmount = currentSumOfDisplayed - currentDiscount;
    let baseVC = 0;
    let displayedVC = 0;
    let currentPolicy: string | null = null;

    if (appConfig.enableMinimumBookingPolicy && netAmount < (appConfig.minimumBookingAmount || 0)) {
      displayedVC = appConfig.visitingChargeAmount || 0;
      baseVC = getBasePrice(displayedVC, appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent);
      if (appConfig.minimumBookingPolicyDescription) {
        currentPolicy = appConfig.minimumBookingPolicyDescription
          .replace(/{MINIMUM_BOOKING_AMOUNT}/g, (appConfig.minimumBookingAmount || 0).toString())
          .replace(/{VISITING_CHARGE}/g, displayedVC.toString());
      }
    }
    setVisitingCharge(baseVC);
    setPolicyMessage(currentPolicy);

    let platformFeeBase = 0;
    let platformFeeTax = 0;
    const newPlatformFees: AppliedPlatformFeeItem[] = [];

    (appConfig.platformFees || []).forEach(fee => {
      if (fee.isActive) {
        const feeAmount = fee.type === 'percentage' ? (currentSumOfDisplayed * fee.value) / 100 : fee.value;
        const feeTax = feeAmount * (fee.feeTaxRatePercent / 100);
        newPlatformFees.push({
          name: fee.name,
          type: fee.type,
          valueApplied: fee.value,
          calculatedFeeAmount: feeAmount,
          taxRatePercentOnFee: fee.feeTaxRatePercent,
          taxAmountOnFee: feeTax
        });
        platformFeeBase += feeAmount;
        platformFeeTax += feeTax;
      }
    });
    setCalculatedPlatformFees(newPlatformFees);

    const itemTaxTotal = newBreakdown.reduce((sum, item) => sum + item.taxAmount, 0);
    let vcTax = 0;
    if (appConfig.enableTaxOnVisitingCharge && baseVC > 0) {
      vcTax = baseVC * ((appConfig.visitingChargeTaxPercent || 0) / 100);
    }
    setVisitingChargeBreakdown(displayedVC > 0 ? {
      amount: displayedVC,
      baseAmount: baseVC,
      taxPercent: appConfig.visitingChargeTaxPercent || 0,
      taxAmount: vcTax,
      isTaxInclusive: appConfig.isVisitingChargeTaxInclusive || false
    } : null);

    const finalTax = itemTaxTotal + vcTax + platformFeeTax;
    setTaxAmount(finalTax);
    setTotalAmountDue(currentBaseSubtotal + baseVC - currentDiscount + platformFeeBase + finalTax);
  }, [cartEntries, serviceDetailsMap, appConfig, isLoading, isLoadingAppSettings, appliedPromo, onSumCalculated]);

  const loadRazorpay = () => new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const handleBookNow = async () => {
    if (!canBook) return;
    setIsProcessingPayment(true);
    showLoading();

    const storageMethod = paymentMethod === 'later' ? 'Pay After Service' : 'Online';

    if (paymentMethod === 'later') {
        localStorage.setItem('fixbroPaymentMethod', storageMethod);
        localStorage.setItem('fixbroFinalBookingTotal', totalAmountDue.toString());
        if (appliedPromo) {
            localStorage.setItem('fixbroBookingDiscountCode', appliedPromo.code);
            localStorage.setItem('fixbroBookingDiscountAmount', appliedPromo.calculatedDiscount.toString());
            localStorage.setItem('fixbroAppliedPromoCodeId', appliedPromo.id);
        }
        if (calculatedPlatformFees.length > 0) localStorage.setItem('fixbroAppliedPlatformFees', JSON.stringify(calculatedPlatformFees));
        router.push('/checkout/thank-you'); 
        return; 
    }

    const scriptLoaded = await loadRazorpay();
    if (!scriptLoaded) {
      toast({ title: "Error", description: "Razorpay failed to load.", variant: "destructive" });
      setIsProcessingPayment(false);
      hideLoading();
      return;
    }

    try {
      const res = await fetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(totalAmountDue * 100) }),
      });
      const orderDetails = await res.json();

      const options = {
        key: appConfig.razorpayKeyId,
        amount: orderDetails.amount,
        currency: "INR",
        name: globalSettings?.websiteName || "FixBro",
        description: "Service Booking",
        order_id: orderDetails.id,
        handler: (response: any) => {
          localStorage.setItem('razorpayPaymentId', response.razorpay_payment_id);
          localStorage.setItem('razorpayOrderId', response.razorpay_order_id);
          localStorage.setItem('razorpaySignature', response.razorpay_signature);
          localStorage.setItem('fixbroPaymentMethod', 'Online');
          localStorage.setItem('fixbroFinalBookingTotal', totalAmountDue.toString());
          if (appliedPromo) {
            localStorage.setItem('fixbroBookingDiscountCode', appliedPromo.code);
            localStorage.setItem('fixbroBookingDiscountAmount', appliedPromo.calculatedDiscount.toString());
            localStorage.setItem('fixbroAppliedPromoCodeId', appliedPromo.id);
          }
          if (calculatedPlatformFees.length > 0) localStorage.setItem('fixbroAppliedPlatformFees', JSON.stringify(calculatedPlatformFees));
          router.push('/checkout/thank-you');
        },
        prefill: {
          name: auth.currentUser?.displayName || "Guest",
          email: auth.currentUser?.email || "guest@example.com",
          contact: auth.currentUser?.phoneNumber || ""
        },
        theme: { color: "#45A0A2" },
        modal: { ondismiss: () => { setIsProcessingPayment(false); hideLoading(); }}
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      toast({ title: "Payment Error", variant: "destructive" });
      setIsProcessingPayment(false);
      hideLoading();
    }
  };

  if (isLoading) return <div className="p-3 bg-muted animate-pulse rounded-xl h-64" />;

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="bg-primary/5 py-4">
        <CardTitle className="text-lg">Order Summary</CardTitle>
      </CardHeader>
      <CardContent className="py-6 space-y-4">
        {/* Breakdown */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items Total</span>
            <span>₹{sumOfDisplayedItemPrices.toLocaleString()}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-green-600 font-medium">
              <span>Discount {appliedPromo ? `(${appliedPromo.code})` : ''}</span>
              <span>-₹{discountAmount.toLocaleString()}</span>
            </div>
          )}
          {visitingCharge > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Visiting Charge</span>
              <span>₹{(appConfig.visitingChargeAmount || 0).toLocaleString()}</span>
            </div>
          )}
          {calculatedPlatformFees.map(fee => (
            <div key={fee.name} className="flex justify-between">
              <span className="text-muted-foreground">{fee.name}</span>
              <span>₹{(fee.calculatedFeeAmount + fee.taxAmountOnFee).toLocaleString()}</span>
            </div>
          ))}
          {taxAmount > 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1 text-muted-foreground">
                Tax
                <Info className="h-3 w-3 cursor-pointer" onClick={() => setIsTaxBreakdownOpen(true)} />
              </div>
              <span>₹{taxAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
            <span>Total Amount</span>
            <span className="text-primary">₹{totalAmountDue.toLocaleString()}</span>
          </div>
        </div>

        {policyMessage && (
          <Alert className="bg-amber-50 border-amber-200 py-2 shadow-sm">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-700 leading-tight">{policyMessage}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="bg-primary/5 py-6">
        <Button 
          className="w-full py-6 text-lg font-bold shadow-lg" 
          disabled={!canBook || isProcessingPayment}
          onClick={handleBookNow}
        >
          {isProcessingPayment ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
          {paymentMethod === 'later' ? 'Confirm Booking' : 'Book & Pay Now'}
        </Button>
      </CardFooter>

      <Dialog open={isTaxBreakdownOpen} onOpenChange={setIsTaxBreakdownOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tax Breakdown</DialogTitle>
            <DialogDescription>
              A detailed view of the taxes applied to your items and platform fees.
            </DialogDescription>
          </DialogHeader>
          <TaxBreakdownDisplay 
            items={taxBreakdownItems}
            visitingCharge={visitingChargeBreakdown}
            platformFees={calculatedPlatformFees}
            subTotalBeforeDiscount={subTotal}
            totalDiscount={discountAmount}
            totalTax={taxAmount}
            grandTotal={totalAmountDue}
            defaultTaxRatePercent={appConfig.visitingChargeTaxPercent || 0}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
