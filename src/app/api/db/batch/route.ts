import { NextResponse } from 'next/server';
import { getPool, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';

export async function POST(request: Request) {
  try {
    const { operations = [] } = await request.json();
    const pool = await getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      for (const op of operations) {
        if (op.action === 'setDoc') {
          await setDocInternal(conn, op.collection, op.id, op.data, op.options);
        } else if (op.action === 'updateDoc') {
          await updateDocInternal(conn, op.collection, op.id, op.data);
        } else if (op.action === 'deleteDoc') {
          await deleteDocInternal(conn, op.collection, op.id);
        }
      }

      await conn.commit();
      return NextResponse.json({ success: true });
    } catch (err: any) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Batch transaction failed' },
      { status: 500 }
    );
  }
}
