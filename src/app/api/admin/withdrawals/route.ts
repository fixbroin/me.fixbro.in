import { NextResponse } from 'next/server';
import { getPool, getDocsInternal, updateDocInternal } from '@/lib/mysql';

export async function GET() {
  try {
    const pool = await getPool();
    const rawWithdrawals = await getDocsInternal(pool, 'withdrawalRequests', [{ type: 'orderBy', field: 'requestedAt', direction: 'desc' }]);
    const withdrawals = rawWithdrawals.map((w: any) => ({ id: w.id, ...w.data }));
    return NextResponse.json({ success: true, withdrawals });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, data } = await request.json();
    const pool = await getPool();
    await updateDocInternal(pool, 'withdrawalRequests', id, data);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
