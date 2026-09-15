import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID is required.' }, { status: 400 });
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const stripeSecretKey = appConfig?.stripeSecretKey;
    if (!stripeSecretKey) {
      return NextResponse.json({ success: false, error: 'Stripe is not configured.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as any,
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const metadata = session.metadata || {};
      const { type, bookingId } = metadata;

      if (type === 'booking' && bookingId) {
        try {
          const bookingRef = adminDb.collection('bookings').doc(bookingId);
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
                stripeSessionId: session.id,
                stripePaymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
                paymentMethod: 'Online',
                updatedAt: Timestamp.now(),
              });

              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006';
              fetch(`${appUrl}/api/bookings/post-process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingDocId: bookingId, triggerSource: 'stripe_server_verify' })
              }).catch(err => console.error("Error triggering post-process from verify-session:", err));
            }
          }
        } catch (dbErr) {
          console.error("Error updating booking in verify-session:", dbErr);
        }
      }

      return NextResponse.json({ 
        success: true, 
        payment_intent: session.payment_intent, 
        status: session.payment_status, 
        metadata: session.metadata 
      });
    }

    return NextResponse.json({ success: false, error: 'Payment has not been completed.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Verification failed.' }, { status: 500 });
  }
}
