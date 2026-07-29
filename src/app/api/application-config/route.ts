import { NextResponse } from 'next/server';
import { getGlobalAppSettings } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const data = await getGlobalAppSettings();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate'
      }
    });
  } catch (error) {
    console.error("API Error in /api/application-config:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
