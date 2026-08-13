"use client";

import PaymentPage from '@/components/checkout/payment/page';
import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

export default function CheckoutPaymentRoute() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-[400px] w-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading payment details...</p>
      </div>
    }>
      <PaymentPage />
    </Suspense>
  );
}
