
import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { getInternalApiSecret } from '@/lib/dbSecurity';

const getWhatsAppConfig = async (): Promise<{ verifyToken?: string; appSecret?: string }> => {
  try {
    const docSnap = await adminDb.collection('webSettings').doc('marketingConfiguration').get();
    if (docSnap.exists) {
      const data = docSnap.data() as any;
      return {
        verifyToken: data?.whatsAppVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN,
        appSecret: data?.whatsAppAppSecret || process.env.WHATSAPP_APP_SECRET
      };
    }
  } catch (error) {
    console.error("Error fetching WhatsApp settings from database:", error);
  }
  return {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET
  };
};

/**
 * Handles the WhatsApp Webhook Verification GET request.
 * See: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const { verifyToken } = await getWhatsAppConfig();

  if (!verifyToken) {
    console.error("WHATSAPP_VERIFY_TOKEN is not set in database or environment variables.");
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  // Check if a token and mode is in the query string of the request
  if (mode === 'subscribe' && token === verifyToken) {
    // Responds with the challenge token from the request
    console.log('WhatsApp Webhook Verified!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    // Responds with '403 Forbidden' if verify tokens do not match
    console.warn('WhatsApp Webhook verification failed. Tokens do not match.');
    return new NextResponse('Forbidden', { status: 403 });
  }
}

/**
 * Handles incoming WhatsApp message notifications via POST request.
 * Cryptographically verifies Meta's x-hub-signature-256 HMAC-SHA256 header.
 * See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-hub-signature-256');
    const { appSecret } = await getWhatsAppConfig();

    if (appSecret) {
      if (!signatureHeader) {
        console.warn('WhatsApp webhook rejected: Missing x-hub-signature-256 header.');
        return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
      }

      const [prefix, signature] = signatureHeader.split('=');
      if (prefix !== 'sha256' || !signature) {
        console.warn('WhatsApp webhook rejected: Invalid signature format.');
        return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
      }

      const expectedSignature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      const signatureBuf = Buffer.from(signature, 'hex');
      const expectedBuf = Buffer.from(expectedSignature, 'hex');

      if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
        console.warn('WhatsApp webhook rejected: Signature mismatch.');
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 403 });
      }
    } else {
      const internalHeader = req.headers.get('x-internal-token');
      const validSecret = getInternalApiSecret();
      if (!internalHeader || internalHeader !== validSecret) {
        console.warn('WhatsApp webhook rejected: WHATSAPP_APP_SECRET is not configured on server.');
        return NextResponse.json({ error: 'Webhook signature verification required but secret not configured.' }, { status: 401 });
      }
    }

    const body = rawBody ? JSON.parse(rawBody) : {};

    // Log the verified payload
    console.log('Verified WhatsApp Webhook Payload:', JSON.stringify(body, null, 2));

    // WhatsApp requires a quick 200 OK response to acknowledge receipt of the webhook.
    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    return NextResponse.json({ status: 'error', error: (error as Error).message }, { status: 500 });
  }
}
