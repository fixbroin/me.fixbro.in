import { NextResponse, type NextRequest } from 'next/server';
import { getPool, getDocInternal } from '@/lib/mysql';
import { verifyRequest, validateAccess, isUserAdmin, sanitizeDocumentData } from '@/lib/dbSecurity';

const docCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5000;

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { path, docId } = await request.json();
    const fullPath = docId ? `${path}/${docId}` : path;

    // Check Firestore-style access rules
    const isReadAllowed = validateAccess(user, fullPath, 'read');
    if (!isReadAllowed) {
      return NextResponse.json({ success: false, error: `Forbidden: No read access to "${fullPath}".` }, { status: 403 });
    }
    
    const isCacheable = fullPath.startsWith('webSettings') || fullPath.startsWith('seoSettings') || fullPath.startsWith('appConfiguration');
    const roleKey = isUserAdmin(user) ? 'admin' : 'public';
    const cacheKey = `${fullPath}:${roleKey}`;
    
    if (isCacheable) {
      const cached = docCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return NextResponse.json(cached.data);
      }
    }

    const pool = await getPool();
    const result = await getDocInternal(pool, path, docId);

    // Sanitize sensitive credentials and private data for non-admins
    if (result?.data) {
      result.data = sanitizeDocumentData(path, result.data, user);
    }

    if (isCacheable) {
      docCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { exists: false, data: null, error: error.message || 'Database error' },
      { status: 500 }
    );
  }
}
