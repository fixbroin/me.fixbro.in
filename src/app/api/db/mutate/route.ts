import { NextResponse } from 'next/server';
import { getPool, addDocInternal, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';

export async function POST(request: Request) {
  try {
    const { action, path, id, docId, data, options } = await request.json();
    const pool = await getPool();

    if (action === 'addDoc') {
      const result = await addDocInternal(pool, path, data);
      return NextResponse.json(result);
    }

    if (action === 'setDoc') {
      const targetId = id || docId;
      await setDocInternal(pool, path, targetId, data, options);
      return NextResponse.json({ success: true, id: targetId });
    }

    if (action === 'updateDoc') {
      const targetId = id || docId;
      await updateDocInternal(pool, path, targetId, data);
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
