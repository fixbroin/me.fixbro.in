import { NextResponse, type NextRequest } from 'next/server';
import { getPool, addDocInternal, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';
import { verifyRequest, validateAccess, validateMutationAccess } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { action, path, id, docId, data, options } = await request.json();

    // Reconstruct the full document path to validate access properly
    const targetId = id || docId;
    const fullPath = targetId ? `${path}/${targetId}` : path;

    // 1. Check basic path-level access rules
    const isWriteAllowed = validateAccess(user, fullPath, 'write');
    if (!isWriteAllowed) {
      return NextResponse.json({ success: false, error: `Forbidden: No write access to "${fullPath}".` }, { status: 403 });
    }

    // 2. Perform field-level mutation validation & sanitization
    const mutationCheck = validateMutationAccess(user, action, path, targetId, data);
    if (!mutationCheck.allowed) {
      return NextResponse.json({ success: false, error: mutationCheck.reason || `Forbidden: Mutation not allowed on "${fullPath}".` }, { status: 403 });
    }

    const sanitizedData = mutationCheck.sanitizedData !== undefined ? mutationCheck.sanitizedData : data;

    const pool = await getPool();

    if (action === 'addDoc') {
      const result = await addDocInternal(pool, path, sanitizedData);
      return NextResponse.json(result);
    }

    if (action === 'setDoc') {
      const targetId = id || docId;
      await setDocInternal(pool, path, targetId, sanitizedData, options);
      return NextResponse.json({ success: true, id: targetId });
    }

    if (action === 'updateDoc') {
      const targetId = id || docId;
      await updateDocInternal(pool, path, targetId, sanitizedData);
      return NextResponse.json({ success: true, id: targetId });
    }

    if (action === 'deleteDoc') {
      const targetId = id || docId;
      await deleteDocInternal(pool, path, targetId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Database mutation error' },
      { status: 500 }
    );
  }
}
