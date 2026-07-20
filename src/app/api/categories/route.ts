import { NextResponse } from 'next/server';
import { getAdminCategories, getAdminSubCategories } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const [categories, subCategories] = await Promise.all([
      getAdminCategories(),
      getAdminSubCategories()
    ]);
    return NextResponse.json({ categories, subCategories });
  } catch (error) {
    console.error("API Error in /api/categories:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
