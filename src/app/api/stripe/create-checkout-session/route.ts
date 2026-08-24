import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';

const getCurrencySubunitDecimals = (currencyCode: string): number => {
  const c = currencyCode.toUpperCase();
  if (['JPY', 'KRW', 'CLP', 'VND', 'UGX'].includes(c)) return 0;
  if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 3;
  return 2;
};

export async function POST(req: NextRequest) {
  try {
    const { type, amount, currency = 'INR', bookingId, providerId, successUrl, cancelUrl } = await req.json();

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount provided.' }, { status: 400 });
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const stripeSecretKey = appConfig?.stripeSecretKey;
    if (!stripeSecretKey) {
      console.error("Stripe Secret Key is not configured in settings.");
      return NextResponse.json({ success: false, error: 'Stripe is not configured on this server.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as any,
    });

    const decimals = getCurrencySubunitDecimals(currency);
    const stripeAmount = Math.round(amount * Math.pow(10, decimals));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: type === 'wallet_topup' 
                ? 'Provider Wallet Top Up' 
                : type === 'cancellation_fee' 
                ? `Cancellation Fee (Booking #${bookingId})` 
                : `Service Booking Payment (#${bookingId})`,
            },
            unit_amount: stripeAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        type,
        bookingId: bookingId || "",
        providerId: providerId || "",
        amount: amount.toString(),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session || !session.url) {
      return NextResponse.json({ success: false, error: 'Failed to create checkout session.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: session.url, sessionId: session.id });

  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
