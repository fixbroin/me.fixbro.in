// src/app/api/admin/images/export/route.ts
import { NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const zip = new AdmZip();

    if (fs.existsSync(uploadsDir)) {
      zip.addLocalFolder(uploadsDir);
    } else {
      fs.mkdirSync(uploadsDir, { recursive: true });
      zip.addLocalFolder(uploadsDir);
    }

    const buffer = zip.toBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="images-backup-${new Date().toISOString().slice(0, 10)}.zip"`
      }
    });
  } catch (error: any) {
    console.error("Images backup failed:", error);
    return NextResponse.json({ error: error.message || 'Backup failed' }, { status: 500 });
  }
}
