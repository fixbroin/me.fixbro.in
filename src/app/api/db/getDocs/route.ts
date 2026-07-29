import { NextResponse } from 'next/server';
import { getPool, getDocsInternal } from '@/lib/mysql';

const queryCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 3000;

export async function POST(request: Request) {
  try {
    const { path, constraints = [] } = await request.json();
    const isCacheable = (path === 'adminCategories' || path === 'adminSubCategories' || path === 'adminServices' || path === 'adminSlideshows' || path === 'webSettings' || path === 'adminReviews' || path === 'blogPosts') && constraints.length === 0;
    const cacheKey = `${path}:${JSON.stringify(constraints)}`;

    if (isCacheable) {
      const cached = queryCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return NextResponse.json(cached.data);
      }
    }

    const pool = await getPool();
    const result = await getDocsInternal(pool, path, constraints);

    if (isCacheable) {
      queryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { docs: [], size: 0, empty: true, error: error.message || 'Database query error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  queryCache.clear();
  return NextResponse.json({ success: true });
}
