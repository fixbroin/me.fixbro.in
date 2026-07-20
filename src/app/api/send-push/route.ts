// src/app/api/send-push/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

// Initialize messaging only once
let messaging: admin.messaging.Messaging;
try {
    messaging = admin.messaging();
} catch (e) {
    // If not already initialized, the adminDb import should have handled app init.
    // If somehow it's not ready, we can't send.
}

export async function POST(request: Request) {
  try {
    const { userId, title, body, href, icon, sound } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Get user's FCM tokens from Firestore
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const fcmTokensObj = userData?.fcmTokens || {};
    const tokens = Object.keys(fcmTokensObj);

    if (tokens.length === 0) {
      return NextResponse.json({ error: 'No FCM tokens found for this user' }, { status: 200 });
    }

    // 2. Prepare the message
    const messagePayload = {
      notification: {
        title,
        body,
      },
      data: {
        click_action: href || '/',
        icon: icon || '/android-chrome-192x192.png',
        sound: sound || 'default', // Pass internal sound identifier
      },
      // Essential for background handling in modern browsers
      webpush: {
        notification: {
          title,
          body,
          icon: icon || '/android-chrome-192x192.png',
          data: {
            url: href || '/',
            sound: sound || 'default',
          }
        }
      }
    };

    // 3. Send to all registered tokens for this user
    const sendPromises = tokens.map(token => 
      messaging.send({
        ...messagePayload,
        token,
      }).catch(async (err: any) => {
        console.error(`Failed to send push to token ${token}:`, err);
        
        // Handle dead or invalid tokens
        const isDeadToken = 
            err.code === 'messaging/registration-token-not-registered' || 
            err.code === 'messaging/invalid-argument' ||
            err.message?.includes('unregistered') ||
            err.message?.includes('registration-token-not-registered') ||
            err.message?.includes('invalid-argument') ||
            err.errorInfo?.code === 'messaging/registration-token-not-registered';

        if (isDeadToken) {
            console.log(`Token ${token} is no longer valid. Deleting from Firestore for user ${userId}...`);
            try {
                await adminDb.collection('users').doc(userId).update({
                    [`fcmTokens.${token}`]: admin.firestore.FieldValue.delete()
                });
                console.log(`Successfully removed dead token ${token} for user ${userId}`);
            } catch (deleteErr) {
                console.error(`Failed to delete dead token ${token} from Firestore:`, deleteErr);
            }
        }
        return null;
      })
    );

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, message: `Push sent to ${tokens.length} devices.` });

  } catch (error: any) {
    console.error('Error in send-push API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
