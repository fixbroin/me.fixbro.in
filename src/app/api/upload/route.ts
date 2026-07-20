// src/app/api/upload/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { executeDbGetDoc } from '@/app/actions/dbActions';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const uploadPath = (formData.get('uploadPath') as string) || 'general';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // 1. Check Media Storage Configuration
    let driver = process.env.STORAGE_DRIVER || 'local';
    let remoteUploadUrl = process.env.REMOTE_UPLOAD_URL || '';
    let remoteSecretKey = process.env.REMOTE_SECRET_KEY || '';

    try {
      const storageDoc = await executeDbGetDoc('webSettings', 'storageConfiguration');
      if (storageDoc && storageDoc.exists && storageDoc.data) {
        if (storageDoc.data.driver) driver = storageDoc.data.driver;
        if (storageDoc.data.remoteUploadUrl) remoteUploadUrl = storageDoc.data.remoteUploadUrl;
        if (storageDoc.data.remoteSecretKey) remoteSecretKey = storageDoc.data.remoteSecretKey;
      }
    } catch (dbErr) {
      console.warn("Could not load storageConfiguration from DB, using fallback defaults:", dbErr);
    }

    // 2. REMOTE SHARED HOSTING / OTHER SERVER STORAGE
    if (driver === 'remote' && remoteUploadUrl && remoteUploadUrl.trim() !== '') {
      try {
        const remoteFormData = new FormData();
        remoteFormData.append('file', file);
        remoteFormData.append('uploadPath', uploadPath);

        const remoteRes = await fetch(remoteUploadUrl.trim(), {
          method: 'POST',
          headers: {
            'x-api-secret': remoteSecretKey
          },
          body: remoteFormData
        });

        const remoteData = await remoteRes.json();
        if (remoteRes.ok && remoteData.success && remoteData.url) {
          return NextResponse.json({
            success: true,
            url: remoteData.url,
            fileName: remoteData.fileName || file.name,
            path: remoteData.url,
            driver: 'remote'
          });
        } else {
          console.error("Remote storage upload failed, falling back to local:", remoteData?.error);
        }
      } catch (remoteErr) {
        console.error("Error connecting to remote storage server, falling back to local:", remoteErr);
      }
    }

    // 3. LOCAL VPS STORAGE (Fallback / Default)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Clean destination subfolder under public/uploads/
    const cleanSubfolder = uploadPath.replace(/^[/\\]+|[/\\]+$/g, '').replace(/[/\\]+/g, '/');
    const targetDir = path.join(process.cwd(), 'public', 'uploads', cleanSubfolder);

    await fs.mkdir(targetDir, { recursive: true });

    // Generate unique filename preserving original extension
    const ext = path.extname(file.name) || '.jpg';
    const filename = `${Date.now()}-${nanoid(8)}${ext}`;
    const fullPath = path.join(targetDir, filename);

    await fs.writeFile(fullPath, buffer);

    // Build public URL
    const publicUrl = `/uploads/${cleanSubfolder ? cleanSubfolder + '/' : ''}${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: filename,
      path: publicUrl,
      driver: 'local'
    });
  } catch (error: any) {
    console.error("Upload handler error:", error);
    return NextResponse.json({ success: false, error: error.message || 'Upload failed' }, { status: 500 });
  }
}
