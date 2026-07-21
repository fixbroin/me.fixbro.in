import { NextResponse } from 'next/server';
import { getPool, getDocsInternal, addDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';

export async function GET() {
  try {
    const pool = await getPool();
    const rawReviews = await getDocsInternal(pool, 'adminReviews', []);
    const reviews = rawReviews.map((r: any) => ({ id: r.id, ...r.data }));
    return NextResponse.json({ success: true, reviews });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const pool = await getPool();
    const result = await addDocInternal(pool, 'adminReviews', data);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, data } = await request.json();
    const pool = await getPool();
    await updateDocInternal(pool, 'adminReviews', id, data);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    const pool = await getPool();
    await deleteDocInternal(pool, 'adminReviews', id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
