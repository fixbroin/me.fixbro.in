import { NextResponse } from 'next/server';
import { getPool, getDocInternal } from '@/lib/mysql';

const docCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5000;

export async function POST(request: Request) {
  try {
    const { path, docId } = await request.json();
    const fullPath = docId ? `${path}/${docId}` : path;
    
    const isCacheable = fullPath.startsWith('webSettings') || fullPath.startsWith('seoSettings') || fullPath.startsWith('appConfiguration');
    
    if (isCacheable) {
      const cached = docCache.get(fullPath);
      if (cached && Date.now() < cached.expiresAt) {
        return NextResponse.json(cached.data);
      }
    }

    const pool = await getPool();
    const result = await getDocInternal(pool, path, docId);

    if (isCacheable) {
      docCache.set(fullPath, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { exists: false, data: null, error: error.message || 'Database error' },
      { status: 500 }
    );
  }
}
