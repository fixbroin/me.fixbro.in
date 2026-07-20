import { NextResponse } from 'next/server';
import { getAdminServices } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const services = await getAdminServices();
    return NextResponse.json(services);
  } catch (error) {
    console.error("API Error in /api/services:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
