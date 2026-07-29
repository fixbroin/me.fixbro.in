import { NextResponse } from 'next/server';
import { getPool, getDocsInternal, addDocInternal } from '@/lib/mysql';

export async function GET() {
  try {
    const pool = await getPool();
    const rawLogs = await getDocsInternal(pool, 'userActivities', [{ type: 'orderBy', field: 'timestamp', direction: 'desc' }]);
    const activities = rawLogs.map((a: any) => ({ id: a.id, ...a.data }));
    return NextResponse.json({ success: true, activities });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const pool = await getPool();
    const result = await addDocInternal(pool, 'userActivities', {
      ...data,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json({ success: true, id: result.id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
