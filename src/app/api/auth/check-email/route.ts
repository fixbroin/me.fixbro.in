import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initFirebaseAdmin } from '@/lib/firebase-admin';
import { RateLimiter, getClientIp } from '@/lib/rateLimit';

// Allow max 10 requests per minute per IP to prevent email harvesting and enumeration
const emailCheckLimiter = new RateLimiter(10, 60 * 1000);

// Basic regex for email format sanity check
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rateCheck = emailCheckLimiter.check(clientIp);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { exists: false, error: 'Too many requests. Please try again later.' },
      { 
        status: 429,
        headers: { 'Retry-After': rateCheck.retryAfterSeconds.toString() }
      }
    );
  }

  const startTime = Date.now();

  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json({ exists: false, error: 'Valid email is required' }, { status: 400 });
    }

    initFirebaseAdmin();

    const auth = getAuth();
    let exists = false;
    try {
      await auth.getUserByEmail(email.trim().toLowerCase());
      exists = true;
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        exists = false;
      } else {
        return NextResponse.json({ exists: false, error: authError.message }, { status: 500 });
      }
    }

    // Mitigation against side-channel timing attacks
    const elapsed = Date.now() - startTime;
    if (elapsed < 200) {
      await new Promise(resolve => setTimeout(resolve, 200 - elapsed));
    }

    return NextResponse.json({ exists });
  } catch (error: any) {
    console.error('Error checking email existence:', error);
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
  }
}
