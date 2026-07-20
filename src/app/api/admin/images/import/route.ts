// src/app/api/admin/images/import/route.ts
import { NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Extract all files to public/uploads, overwriting existing ones
    zip.extractAllTo(uploadsDir, true);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Images restore failed:", error);
    return NextResponse.json({ error: error.message || 'Restore failed' }, { status: 500 });
  }
}
