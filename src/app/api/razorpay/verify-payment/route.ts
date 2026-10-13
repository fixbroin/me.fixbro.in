import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebaseAdmin';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { Timestamp } from '@/lib/mysqlDbAdmin';
import { fulfillCheckoutDraft } from '@/lib/bookingPricingServer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      isCancellationFee,
      feeAmount,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: 'Missing payment details for verification.' },
        { status: 400 }
      );
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? (appConfigSnap.data() as any) : null;

    const razorpayKeyId = appConfig?.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = appConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeySecret) {
      console.error('Razorpay Key Secret is not set in database settings or environment variables.');
      return NextResponse.json(
        { success: false, error: 'Payment gateway not configured on server for verification.' },
        { status: 500 }
      );
    }

    const verificationPayload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(verificationPayload.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ success: false, error: 'Invalid payment signature.' }, { status: 400 });
    }

    // Direct Razorpay Server API Verification: confirm payment exists on Razorpay and is captured/authorized
    if (razorpayKeyId) {
      try {
        const instance = new Razorpay({
          key_id: razorpayKeyId,
          key_secret: razorpayKeySecret,
        });
        const rzpPayment: any = await instance.payments.fetch(razorpay_payment_id);
        if (!rzpPayment || rzpPayment.order_id !== razorpay_order_id) {
          return NextResponse.json(
            { success: false, error: 'Payment order mismatch on Razorpay server.' },
            { status: 400 }
          );
        }
        if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
          return NextResponse.json(
            { success: false, error: `Payment is not completed (status: ${rzpPayment.status}).` },
            { status: 400 }
          );
        }
      } catch (rzpErr: any) {
        console.error('Error fetching payment from Razorpay API in verify-payment:', rzpErr);
        return NextResponse.json(
          { success: false, error: 'Could not verify payment with Razorpay server.' },
          { status: 400 }
        );
      }
    }

    // Signature and server payment are cryptographically verified!
    let updatedBooking: any = null;

    if (bookingId) {
      const bookingRef = adminDb.collection('bookings').doc(bookingId);
      const bookingSnap = await bookingRef.get();

      if (bookingSnap.exists) {
        const bookingData = bookingSnap.data() as any;

        if (isCancellationFee) {
          // Handle Cancellation Fee
          await bookingRef.update({
            status: 'Cancelled',
            updatedAt: Timestamp.now(),
            cancellationFeePaid: Number(feeAmount) || 0,
            cancellationPaymentId: razorpay_payment_id,
          });

          updatedBooking = {
            ...bookingData,
            status: 'Cancelled',
            cancellationFeePaid: Number(feeAmount) || 0,
            cancellationPaymentId: razorpay_payment_id,
          };

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006';
          fetch(`${appUrl}/api/bookings/post-process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingDocId: bookingId, cancelledBy: 'user' }),
          }).catch((err) => console.error('Error triggering post-process for cancellation:', err));
        } else if (bookingData.status === 'Pending Payment') {
          // Confirm booking authoritatively on server
          const nextBookingNumber = await assignNewBookingNumber();

          let effectiveUserId = bookingData.userId;
          if (!effectiveUserId && bookingData.customerEmail) {
            try {
              const userSnap = await adminDb.collection('users').where('email', '==', bookingData.customerEmail.toLowerCase().trim()).limit(1).get();
              if (!userSnap.empty) {
                effectiveUserId = userSnap.docs[0].id;
              }
            } catch (userLookupErr) {
              console.warn('Error resolving user by email in razorpay verify:', userLookupErr);
            }
          }

          const updateFields: any = {
            status: 'Confirmed',
            bookingNumber: nextBookingNumber,
            paymentMethod: 'Online',
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature,
            updatedAt: Timestamp.now(),
          };
          if (effectiveUserId && !bookingData.userId) {
            updateFields.userId = effectiveUserId;
          }

          await bookingRef.update(updateFields);

          updatedBooking = {
            ...bookingData,
            id: bookingId,
            ...updateFields,
          };

          // Trigger Server Post-Processing (Auto dispatch, notification, WhatsApp)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006';
          fetch(`${appUrl}/api/bookings/post-process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingDocId: bookingId, triggerSource: 'razorpay_checkout_verify' }),
          }).catch((err) => console.error('Error triggering post-process from verify-payment:', err));

          // Notify User In-App
          if (bookingData.userId) {
            try {
              await adminDb.collection('userNotifications').add({
                userId: bookingData.userId,
                title: 'Booking Confirmed!',
                message: `Your booking ${bookingData.bookingId} has been successfully placed. We'll assign a provider shortly.`,
                type: 'success',
                href: '/my-bookings',
                read: false,
                createdAt: Timestamp.now(),
              });
            } catch (notifyErr) {
              console.error('Error sending in-app notification:', notifyErr);
            }
          }
        } else {
          updatedBooking = { ...bookingData, id: bookingId };
        }
      }
    } else if (!isCancellationFee) {
      // Fulfill from server-side checkoutDraft (if present)
      try {
        const fulfilled = await fulfillCheckoutDraft({
          draftId: razorpay_order_id,
          gateway: 'razorpay',
          paymentDetails: {
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature,
          },
          triggerSource: 'razorpay_checkout_verify',
        });
        if (fulfilled) {
          updatedBooking = fulfilled.booking;
        }
      } catch (fulfillErr) {
        console.warn('Could not fulfill checkoutDraft in verify-payment (will fall back to create-cash):', fulfillErr);
      }
    }

    return NextResponse.json({
      success: true,
      status: 'captured',
      booking: updatedBooking,
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
