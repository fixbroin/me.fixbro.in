// src/app/api/admin/database/import/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/mysql';

export async function POST(req: Request) {
  try {
    let importData: any = null;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No backup file uploaded' }, { status: 400 });
      }
      const text = await file.text();
      importData = JSON.parse(text);
    } else {
      importData = await req.json();
    }

    if (!importData || typeof importData !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON format in backup file' }, { status: 400 });
    }

    const pool = await getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      let totalCount = 0;
      for (const table of Object.keys(importData)) {
        const rows = importData[table];
        if (!Array.isArray(rows)) continue;

        // Clear existing table data to ensure clean restore state
        await conn.query(`DELETE FROM \`${table}\``);

        for (const row of rows) {
          const { _id, _parentId, ...data } = row;
          const serializedData = { ...data, id: _id };
          await conn.query(
            `INSERT INTO \`${table}\` (\`id\`, \`parent_id\`, \`data\`) VALUES (?, ?, ?)`,
            [_id, _parentId || null, JSON.stringify(serializedData)]
          );
          totalCount++;
        }
      }

      await conn.commit();
      return NextResponse.json({ success: true, count: totalCount });
    } catch (err: any) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error: any) {
    console.error("Database import failed:", error);
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
  }
}
