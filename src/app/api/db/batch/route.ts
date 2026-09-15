import { NextResponse, type NextRequest } from 'next/server';
import { getPool, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';
import { verifyRequest, validateAccess, validateMutationAccess } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { operations = [] } = await request.json();

    // Verify access and sanitize all operations in the batch
    const sanitizedOps: any[] = [];
    for (const op of operations) {
      const pathToCheck = op.collection ? `${op.collection}/${op.id || ''}` : op.id || '';
      const isAllowed = validateAccess(user, pathToCheck, 'write');
      if (!isAllowed) {
        return NextResponse.json({ success: false, error: `Forbidden: No write access to "${pathToCheck}".` }, { status: 403 });
      }

      const mutationCheck = validateMutationAccess(user, op.action, op.collection, op.id, op.data);
      if (!mutationCheck.allowed) {
        return NextResponse.json({ success: false, error: mutationCheck.reason || `Forbidden: Mutation not allowed on "${pathToCheck}".` }, { status: 403 });
      }

      sanitizedOps.push({
        ...op,
        data: mutationCheck.sanitizedData !== undefined ? mutationCheck.sanitizedData : op.data
      });
    }

    const pool = await getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      for (const op of sanitizedOps) {
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
