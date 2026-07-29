
import { type NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest) {
  try {
    const { amount, currency = 'INR' } = await req.json();

    if (!amount || typeof amount !== 'number' || amount < 100) { // Razorpay minimum is 1 INR (100 paise)
      return NextResponse.json({ success: false, error: 'Invalid amount provided.' }, { status: 400 });
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("Razorpay API keys are not set in environment variables.");
      return NextResponse.json({ success: false, error: 'Payment gateway not configured on server.' }, { status: 500 });
    }

    const instance = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });

    const options = {
      amount: amount, // amount in the smallest currency unit (paise)
      currency: currency,
      receipt: `receipt_${nanoid()}`,
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
