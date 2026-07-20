import { type NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ success: false, error: 'URL is required.' }, { status: 400 });
    }

    // Safety check: ensure we are only deleting files inside the uploads directory
    if (!url.startsWith('/uploads/')) {
      return NextResponse.json({ success: false, error: 'Invalid file path.' }, { status: 400 });
    }

    // Resolve absolute path in public directory
    const filePath = path.join(process.cwd(), 'public', url);

    try {
      await fs.unlink(filePath);
      return NextResponse.json({ success: true, message: 'File deleted successfully.' });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File does not exist, consider it success
        return NextResponse.json({ success: true, message: 'File not found, skipped.' });
      }
      throw err;
    }
  } catch (error: any) {
    console.error('Error in /api/delete-upload:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to delete file.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
