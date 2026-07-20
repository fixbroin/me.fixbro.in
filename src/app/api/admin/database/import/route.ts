// src/app/api/admin/database/import/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/mysql';

export async function POST(req: Request) {
  try {
    const importData = await req.json();
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
