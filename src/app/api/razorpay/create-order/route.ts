
import { type NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { nanoid } from 'nanoid';

import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { amount, currency = 'INR', notes } = await req.json();

    if (!amount || typeof amount !== 'number' || amount < 100) { // Razorpay minimum is 1 INR (100 paise)
      return NextResponse.json({ success: false, error: 'Invalid amount provided.' }, { status: 400 });
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const type = notes?.type;
    const bookingId = notes?.bookingId;
    const providerId = notes?.providerId;

    let reconciledBaseAmount = amount / 100;

    if (bookingId && (type === 'booking' || type === 'cancellation_fee')) {
      const bookingDoc = await adminDb.collection('bookings').doc(bookingId).get();
      if (!bookingDoc.exists) {
        return NextResponse.json({ success: false, error: 'Booking not found.' }, { status: 404 });
      }
      const bookingData = bookingDoc.data() as any;
      if (type === 'booking') {
        reconciledBaseAmount = bookingData.totalAmount;
      } else if (type === 'cancellation_fee') {
        const feeValue = appConfig?.cancellationFeeValue || 0;
        const feeType = appConfig?.cancellationFeeType || 'fixed';
        if (feeType === 'percentage') {
          reconciledBaseAmount = (feeValue / 100) * (bookingData.totalAmount || 0);
        } else {
          reconciledBaseAmount = feeValue;
        }
      }
    } else if (type === 'wallet_topup' && providerId) {
      const minDeposit = appConfig?.minDepositAmount || 500;
      const maxDeposit = appConfig?.maxDepositAmount || 10000;
      if ((amount / 100) < minDeposit || (amount / 100) > maxDeposit) {
        return NextResponse.json({ success: false, error: `Deposit must be between ${minDeposit} and ${maxDeposit}.` }, { status: 400 });
      }
    }

    const reconciledAmountPaise = Math.round(reconciledBaseAmount * 100);

    const razorpayKeyId = appConfig?.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = appConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("Razorpay API keys are not set in database settings or environment variables.");
      return NextResponse.json({ success: false, error: 'Payment gateway not configured on server.' }, { status: 500 });
    }

    const instance = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });

    const options = {
      amount: reconciledAmountPaise, // amount in the smallest currency unit (paise)
      currency: currency,
      receipt: `receipt_${nanoid()}`,
      notes: {
        ...(notes || {}),
        amount: reconciledBaseAmount.toString()
      },
    };

    const order = await instance.orders.create(options);

    if (!order) {
      return NextResponse.json({ success: false, error: 'Failed to create order with Razorpay.' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, ...order });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
