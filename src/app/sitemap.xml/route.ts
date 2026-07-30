// src/app/sitemap.xml/route.ts
import { NextResponse } from 'next/server';
import { getCachedSitemapEntries } from '../sitemap-helper';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') || requestUrl.host;
    const proto = request.headers.get('x-forwarded-proto') || (requestUrl.protocol === 'https:' ? 'https' : 'http');
    const baseUrl = `${proto}://${host}`;

    const entries = await getCachedSitemapEntries();
    
    const CHUNK_SIZE = 45000;
    const numSitemaps = Math.ceil(entries.length / CHUNK_SIZE);
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    for (let i = 0; i < Math.max(1, numSitemaps); i++) {
      xml += `  <sitemap>\n`;
      xml += `    <loc>${baseUrl}/sitemaps/chunk-${i}.xml</loc>\n`;
      xml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
      xml += `  </sitemap>\n`;
    }
    
    xml += `</sitemapindex>\n`;
    
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate',
      },
    });
  } catch (error) {
    console.error("Error generating master sitemap index:", error);
    // Simple fallback if critical error occurs
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') || requestUrl.host;
    const proto = request.headers.get('x-forwarded-proto') || (requestUrl.protocol === 'https:' ? 'https' : 'http');
    const baseUrl = `${proto}://${host}`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <sitemap>\n`;
    xml += `    <loc>${baseUrl}/sitemaps/chunk-0.xml</loc>\n`;
    xml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
    xml += `  </sitemap>\n`;
    xml += `</sitemapindex>\n`;
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  }
}
