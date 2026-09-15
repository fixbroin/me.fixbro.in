
import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingDocId } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ success: false, error: 'Missing payment details for verification.' }, { status: 400 });
    }
    
    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const razorpayKeySecret = appConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeySecret) {
      console.error("Razorpay Key Secret is not set in database settings or environment variables.");
      return NextResponse.json({ success: false, error: 'Payment gateway not configured on server for verification.' }, { status: 500 });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Cryptographic signature verified successfully
      if (bookingDocId) {
        try {
          const bookingRef = adminDb.collection('bookings').doc(bookingDocId);
          const bookingSnap = await bookingRef.get();
          if (bookingSnap.exists) {
            const bData = bookingSnap.data() as any;
            if (bData?.status === 'Pending Payment') {
              const { assignNewBookingNumber } = await import('@/lib/webServerUtils');
              const { Timestamp } = await import('@/lib/mysqlDbAdmin');
              let finalBookingNum = bData.bookingNumber;
              if (!finalBookingNum || finalBookingNum === 0) {
                finalBookingNum = await assignNewBookingNumber();
              }
              await bookingRef.update({
                status: 'Confirmed',
                paymentStatus: 'Paid',
                bookingNumber: finalBookingNum,
                paymentMethod: 'Online',
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                razorpaySignature: razorpay_signature,
                updatedAt: Timestamp.now(),
              });

              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006';
              fetch(`${appUrl}/api/bookings/post-process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingDocId, triggerSource: 'razorpay_server_verify' })
              }).catch(err => console.error("Error triggering post-process from verify-payment:", err));
            }
          }
        } catch (dbErr) {
          console.error("Error updating booking status in verify-payment:", dbErr);
        }
      }

      return NextResponse.json({ success: true, status: 'captured' });
    } else {
      // Signature is invalid.
      return NextResponse.json({ success: false, error: 'Invalid payment signature.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
