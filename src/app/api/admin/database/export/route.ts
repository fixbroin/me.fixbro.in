// src/app/api/admin/database/export/route.ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/mysql';

const TABLES = [
  'adminCategories',
  'adminSubCategories',
  'adminServices',
  'userCarts',
  'bookings',
  'users',
  'adminSlideshows',
  'webSettings',
  'appConfiguration',
  'contentPages',
  'adminFAQs',
  'adminReviews',
  'timeSlotCategoryLimits',
  'adminPromoCodes',
  'taxes',
  'visitorInfoLogs',
  'userActivities',
  'chats',
  'chats_messages',
  'userNotifications',
  'adminPopups',
  'admins',
  'providerApplications',
  'withdrawalRequests',
  'blogPosts',
  'contactUsSubmissions',
  'popupSubmissions',
  'cityCategorySeoSettings',
  'areaCategorySeoSettings',
  'areaServiceSeoSettings',
  'quotations',
  'invoices',
  'serviceZones',
  'referrals',
  'pinCodeAreaMappings',
  'cities',
  'areas',
  'searchAnalytics',
  'leaves',
  'seoSettings'
];

export async function GET() {
  try {
    const pool = await getPool();
    const exportData: Record<string, any[]> = {};

    for (const table of TABLES) {
      const [rows]: any = await pool.query(`SELECT \`id\`, \`parent_id\`, \`data\` FROM \`${table}\``);
      exportData[table] = (rows || []).map((row: any) => {
        const rawData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return {
          _id: row.id,
          _parentId: row.parent_id || null,
          ...rawData
        };
      });
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="database-backup-${new Date().toISOString().slice(0,10)}.json"`
      }
    });
  } catch (error: any) {
    console.error("Database backup failed:", error);
    return NextResponse.json({ error: error.message || 'Backup failed' }, { status: 500 });
  }
}
