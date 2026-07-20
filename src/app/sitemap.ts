import { MetadataRoute } from 'next';
import { adminDb } from '@/lib/firebaseAdmin'; 
import { Timestamp } from '@/lib/mysqlDbAdmin'; 
import type { FirestoreCategory, FirestoreService, FirestoreCity, FirestoreArea, FirestoreBlogPost, ContentPage, AreaServiceSeoSetting } from '@/types/firestore';
import { getBaseUrl } from '@/lib/config'; 
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-static'; 
export const revalidate = false;

const safeToISOString = (timestamp: Timestamp | undefined | string | Date, fallbackDate: string): string => {
  try {
    if (timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
      return (timestamp as Timestamp).toDate().toISOString();
    }
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    return fallbackDate;
  } catch (e) {
    return fallbackDate;
  }
};

async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const appBaseUrl = getBaseUrl(); 
  const entries: MetadataRoute.Sitemap = [];
  const currentDate = new Date().toISOString();

  const staticPages = [
    '', '/about-us', '/contact-us', '/careers', '/terms-and-conditions',
    '/privacy-policy', '/faq', '/service-disclaimer', '/cancellation-policy', '/damage-and-claims-policy', '/categories', 
    '/blog', '/sitemap', '/near-me',
  ];

  staticPages.forEach(page => {
    entries.push({
      url: `${appBaseUrl}${page}`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: page === '' ? 1.0 : 0.8,
    });
  });

  // Fetch all active categories once to reuse
  let categories: FirestoreCategory[] = [];
  try {
    const categoriesSnapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).get();
    categories = categoriesSnapshot.docs.map(doc => doc.data() as FirestoreCategory);
  } catch (e) {
    console.error("Sitemap: Error fetching categories:", e);
  }

  // Add category-specific near-me pages
  categories.forEach(categoryData => {
    if (categoryData.slug) {
      entries.push({
        url: `${appBaseUrl}/near-me/${categoryData.slug}`,
        lastModified: currentDate,
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
  });

  try {
    const contentPagesSnapshot = await adminDb.collection('contentPages').get();
    contentPagesSnapshot.forEach(docSnap => {
      const pageData = docSnap.data() as ContentPage;
      if (pageData.slug && !staticPages.includes(`/${pageData.slug}`)) {
        entries.push({
          url: `${appBaseUrl}/${pageData.slug}`,
          lastModified: safeToISOString(pageData.updatedAt || pageData.createdAt, currentDate),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching content pages:", e);
  }

  try {
    const blogSnapshot = await adminDb
      .collection('blogPosts')
      .where('isPublished', '==', true)
      .get();
    blogSnapshot.forEach(docSnap => {
      const blogData = docSnap.data() as FirestoreBlogPost;
      if (blogData.slug) {
        entries.push({
          url: `${appBaseUrl}/blog/${blogData.slug}`,
          lastModified: safeToISOString(blogData.updatedAt || blogData.createdAt, currentDate),
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching blog posts:", e);
  }

  // Add categories sitemap
  categories.forEach(categoryData => {
    if (categoryData.slug) {
      entries.push({
        url: `${appBaseUrl}/category/${categoryData.slug}`,
        lastModified: safeToISOString(categoryData.createdAt, currentDate),
        changeFrequency: 'daily',
        priority: 0.9,
      });
    }
  });

  try {
    const servicesSnapshot = await adminDb
      .collection('adminServices')
      .where('isActive', '==', true)
      .get();
    servicesSnapshot.forEach(docSnap => {
      const serviceData = docSnap.data() as FirestoreService;
      if (serviceData.slug) {
        entries.push({
          url: `${appBaseUrl}/service/${serviceData.slug}`,
          lastModified: safeToISOString(serviceData.updatedAt || serviceData.createdAt, currentDate),
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching services:", e);
  }

  try {
    // Fetch cities and areas in single parallel calls
    const [citiesSnapshot, areasSnapshot] = await Promise.all([
      adminDb.collection('cities').where('isActive', '==', true).get(),
      adminDb.collection('areas').where('isActive', '==', true).get(),
    ]);

    const areas = areasSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreArea));
    
    // Group areas by cityId in memory
    const areasByCityId = new Map<string, FirestoreArea[]>();
    areas.forEach(area => {
      if (area.cityId) {
        if (!areasByCityId.has(area.cityId)) {
          areasByCityId.set(area.cityId, []);
        }
        areasByCityId.get(area.cityId)!.push(area);
      }
    });

    for (const cityDoc of citiesSnapshot.docs) {
      const city = cityDoc.data() as FirestoreCity;
      if (!city.slug) continue;

      entries.push({
        url: `${appBaseUrl}/${city.slug}`,
        lastModified: safeToISOString(city.updatedAt || city.createdAt, currentDate),
        changeFrequency: 'daily',
        priority: 0.9,
      });

      categories.forEach(category => {
        if (category.slug) {
          entries.push({
            url: `${appBaseUrl}/${city.slug}/category/${category.slug}`,
            lastModified: safeToISOString(category.createdAt, currentDate),
            changeFrequency: 'daily',
            priority: 0.8,
          });
        }
      });

      const cityAreas = areasByCityId.get(cityDoc.id) || [];
      cityAreas.forEach(area => {
        if (area.slug) {
          entries.push({
            url: `${appBaseUrl}/${city.slug}/${area.slug}`,
            lastModified: safeToISOString(area.updatedAt || area.createdAt, currentDate),
            changeFrequency: 'daily',
            priority: 0.8,
          });

          categories.forEach(category => {
            if (category.slug) {
              entries.push({
                url: `${appBaseUrl}/${city.slug}/${area.slug}/${category.slug}`,
                lastModified: safeToISOString(category.createdAt, currentDate),
                changeFrequency: 'daily',
                priority: 0.7,
              });
            }
          });
        }
      });
    }
  } catch (e) {
    console.error("Sitemap: Error fetching cities/areas/categories:", e);
  }

  // Add localized service-wise SEO overrides sitemap entries
  try {
    const serviceSeoSnapshot = await adminDb
      .collection('areaServiceSeoSettings')
      .where('isActive', '==', true)
      .get();
    
    serviceSeoSnapshot.forEach(docSnap => {
      const setting = docSnap.data() as AreaServiceSeoSetting;
      if (setting.citySlug && setting.areaSlug && setting.serviceSlug) {
        entries.push({
          url: `${appBaseUrl}/${setting.citySlug}/${setting.areaSlug}/service/${setting.serviceSlug}`,
          lastModified: safeToISOString(setting.updatedAt || setting.createdAt, currentDate),
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching area-service SEO entries:", e);
  }

  const uniqueEntries = Array.from(new Map(entries.map(entry => [entry.url, entry])).values());
  return uniqueEntries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return unstable_cache(
    async () => {
      try {
        return await getSitemapEntries();
      } catch (error) {
        console.error("SITEMAP_GENERATION_ERROR: Failed to generate sitemap entries:", error);
        const appBaseUrl = getBaseUrl(); 
        return [
          {
            url: appBaseUrl,
            lastModified: new Date().toISOString(),
            changeFrequency: 'yearly' as const,
            priority: 0.1,
          },
        ];
      }
    },
    ['sitemap-data'],
    { 
      revalidate: false, 
      tags: ['sitemap', 'global-cache'] 
    }
  )();
}
