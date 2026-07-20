
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { triggerRefresh } from '@/lib/revalidateUtils';

export async function POST(req: NextRequest) {
  try {
    // 1. Security Check: Only allow Admins
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    const { tag } = await req.json();

    if (!tag) {
      return NextResponse.json({ error: 'Tag is required' }, { status: 400 });
    }

    // 2. Revalidate the requested tag using our smart trigger
    // This will also bump the global cache version in Firestore
    const tagToRefresh = tag === 'all' ? 'global' : tag;
    
    await triggerRefresh(tagToRefresh);

    console.log(`[Cache] Full system refresh triggered (Tag: ${tagToRefresh}) by admin ${decodedToken.uid}`);

    return NextResponse.json({ 
      success: true, 
      message: `Cache for tag "${tagToRefresh}" has been cleared.` 
    });

  } catch (error: any) {
    console.error('Error clearing cache:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
