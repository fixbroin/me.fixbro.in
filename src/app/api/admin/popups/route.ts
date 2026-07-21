import { NextResponse } from 'next/server';
import { getPool, getDocsInternal, addDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';

export async function GET() {
  try {
    const pool = await getPool();
    const rawPopups = await getDocsInternal(pool, 'adminPopups', []);
    const popups = rawPopups.map((p: any) => ({ id: p.id, ...p.data }));
    return NextResponse.json({ success: true, popups });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const pool = await getPool();
    const result = await addDocInternal(pool, 'adminPopups', data);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, data } = await request.json();
    const pool = await getPool();
    await updateDocInternal(pool, 'adminPopups', id, data);
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
    await deleteDocInternal(pool, 'adminPopups', id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
