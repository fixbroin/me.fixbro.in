import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, FirestoreArea, FirestoreService, FirestoreSubCategory, FirestoreBlogPost, ContentPage, AreaServiceSeoSetting } from '@/types/firestore';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Metadata } from 'next';
import { getBaseUrl } from '@/lib/config';
import { FileText, MapPin, Layers, Briefcase, BookOpen, ChevronRight, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sitemap - FixBro Home Services',
  description: 'Explore all pages, cities, categories, and services offered by FixBro. Your complete guide to our home service platform.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: `${getBaseUrl()}/sitemap`,
  }
};

interface SitemapData {
  pages: Array<{ name: string; url: string }>;
  cities: FirestoreCity[];
  cityCategories: Array<{ city: FirestoreCity }>;
  areaCategories: Array<{ city: FirestoreCity; areas: FirestoreArea[] }>;
  globalCategories: FirestoreCategory[];
  servicesByCategory: Array<{ category: FirestoreCategory; subCategories: Array<{ subCategory: FirestoreSubCategory; services: FirestoreService[] }> }>;
  blogs: FirestoreBlogPost[];
  serviceOverrides: AreaServiceSeoSetting[];
}

const getSitemapData = cache(async (): Promise<SitemapData> => {
  return unstable_cache(
    async () => {
      // Static Pages
      const staticPages = [
        { name: 'Home', url: '/' },
        { name: 'About Us', url: '/about-us' },
        { name: 'Contact Us', url: '/contact-us' },
        { name: 'All Categories', url: '/categories' },
        { name: 'FAQ', url: '/faq' },
        { name: 'Blog', url: '/blog' },
        { name: 'Login', url: '/auth/login' },
        { name: 'Sign Up', url: '/auth/signup' },
        { name: 'Join as a Provider', url: '/provider-registration' },
        { name: 'Damage & Claims Policy', url: '/damage-and-claims-policy' },
      ];
      
      const contentPagesSnap = await adminDb.collection('contentPages').get();
      const dynamicContentPages = contentPagesSnap.docs.map(doc => {
          const data = doc.data() as ContentPage;
          return { name: data.title, url: `/${data.slug}`};
      }).filter(page => !staticPages.some(p => p.url === page.url));


      // Fetch all data in parallel
      const [
        citiesSnap,
        categoriesSnap,
        subCategoriesSnap,
        servicesSnap,
        blogsSnap,
        serviceSeoSnap
      ] = await Promise.all([
        adminDb.collection('cities').where('isActive', '==', true).orderBy('name').get(),
        adminDb.collection('adminCategories').where('isActive', '==', true).orderBy('order').get(),
        adminDb.collection('adminSubCategories').where('isActive', '==', true).orderBy('name').get(),
        adminDb.collection('adminServices').where('isActive', '==', true).orderBy('name').get(),
        adminDb.collection('blogPosts').where('isPublished', '==', true).orderBy('createdAt', 'desc').get(),
        adminDb.collection('areaServiceSeoSettings').where('isActive', '==', true).get()
      ]);

      const cities = citiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreCity));
      const categories = categoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreCategory));
      const subCategories = subCategoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreSubCategory));
      const services = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreService));
      const blogs = blogsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreBlogPost));
      
      const parsedServiceOverrides = serviceSeoSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AreaServiceSeoSetting));
      
      // Group City-wise Categories
      const cityCategories = cities.map(city => ({
        city,
      }));
      
      // Group Area-wise Categories
      const areaCategoriesPromises = cities.map(async (city) => {
        const areasSnap = await adminDb.collection('areas').where('cityId', '==', city.id).where('isActive', '==', true).orderBy('name').get();
        const areas = areasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreArea));
        return {
          city,
          areas,
        };
      });
      const areaCategories = await Promise.all(areaCategoriesPromises);

      // Group Services by Category -> SubCategory
      const servicesByCategory = categories.map(category => {
        const relevantSubCats = subCategories.filter(sc => sc.parentId === category.id);
        const subCategoriesWithServices = relevantSubCats.map(subCategory => ({
          subCategory,
          services: services.filter(s => s.subCategoryId === subCategory.id)
        })).filter(sc => sc.services.length > 0);
        return { category, subCategories: subCategoriesWithServices };
      }).filter(cat => cat.subCategories.length > 0);

      return {
        pages: [...staticPages, ...dynamicContentPages],
        cities,
        cityCategories,
        areaCategories,
        globalCategories: categories,
        servicesByCategory,
        blogs,
        serviceOverrides: parsedServiceOverrides
      };
    },
    ['visual-sitemap-data'],
    { 
      revalidate: false, 
      tags: ['sitemap', 'cities', 'areas', 'categories', 'services', 'blog', 'global-cache'] 
    }
  )();
});


export default async function SitemapPage() {
  const data = await getSitemapData();

  return (
    <div className="min-h-screen bg-muted/20 pb-16">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-12 text-center">
            <h1 className="text-4xl md:text-6xl font-headline font-bold text-foreground mb-4">Sitemap</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">Your complete guide to FixBro. Find every service, city, and information page in one place.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {/* Section 1: All Main Pages */}
          <Card className="border-none shadow-sm bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 pb-3">
                <CardTitle className="text-xl flex items-center gap-2"><FileText className="h-5 w-5 text-primary"/>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                <ul className="space-y-3 text-sm">
                    {data.pages.map(page => (
                    <li key={page.url} className="flex items-center group">
                        <ChevronRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity mr-1" />
                        <Link href={page.url} className="text-muted-foreground hover:text-primary transition-colors font-medium">{page.name}</Link>
                    </li>
                    ))}
                </ul>
            </CardContent>
          </Card>

          {/* Section 2: City-wise Home Pages */}
          <Card className="border-none shadow-sm bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 pb-3">
                <CardTitle className="text-xl flex items-center gap-2"><MapPin className="h-5 w-5 text-primary"/>Popular Cities</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                <ul className="space-y-3 text-sm">
                    {data.cities.map(city => (
                    <li key={city.id} className="flex items-center group">
                        <ChevronRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity mr-1" />
                        <Link href={`/${city.slug}`} className="text-muted-foreground hover:text-primary transition-colors font-medium">{city.name}</Link>
                    </li>
                    ))}
                </ul>
            </CardContent>
          </Card>
          
          {/* Section 5: All Categories */}
          <Card className="border-none shadow-sm bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 pb-3">
                <CardTitle className="text-xl flex items-center gap-2"><Layers className="h-5 w-5 text-primary"/>All Categories</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                <ul className="space-y-3 text-sm">
                    {data.globalCategories.map(cat => (
                    <li key={cat.id} className="flex items-center group">
                        <ChevronRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity mr-1" />
                        <Link href={`/category/${cat.slug}`} className="text-muted-foreground hover:text-primary transition-colors font-medium">{cat.name}</Link>
                    </li>
                    ))}
                </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-12">
            {/* Section 3: City-wise Categories */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Globe className="h-6 w-6"/></div>
                    <h2 className="text-2xl font-bold font-headline">City Specific Categories</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {data.cityCategories.map(({ city }) => (
                    <div key={city.id} className="bg-card p-5 rounded-2xl shadow-sm border border-border/50">
                        <h3 className="font-bold text-foreground text-lg mb-3 flex items-center gap-2 border-b pb-2">
                            <MapPin className="h-4 w-4 text-primary opacity-70"/> {city.name}
                        </h3>
                        <ul className="space-y-2.5 text-xs">
                            {data.globalCategories.map(cat => (
                            <li key={`${city.id}-${cat.id}`} className="group flex items-center gap-1.5">
                                <span className="h-1 w-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                                <Link href={`/${city.slug}/category/${cat.slug}`} className="text-muted-foreground hover:text-primary transition-colors">{cat.name} in {city.name}</Link>
                            </li>
                            ))}
                        </ul>
                    </div>
                ))}
                </div>
            </section>

            {/* Section 4: Area-wise Categories */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><MapPin className="h-6 w-6"/></div>
                    <h2 className="text-2xl font-bold font-headline">Area Specific Categories</h2>
                </div>
                <div className="space-y-8">
                {data.areaCategories.map(({ city, areas }) => (
                    <div key={city.id} className="bg-muted/30 p-3 rounded-3xl border border-border/20">
                        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                            <span className="bg-primary w-2 h-6 rounded-full"/> {city.name} Regions
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {areas.map(area => (
                            <div key={area.id} className="bg-card p-4 rounded-xl border border-border/50 shadow-sm">
                                <h4 className="font-bold text-foreground/90 text-sm mb-3 border-b border-primary/10 pb-2">{area.name}</h4>
                                <ul className="space-y-2 text-[11px]">
                                {data.globalCategories.map(cat => (
                                    <li key={`${area.id}-${cat.id}`} className="group flex items-center gap-1.5">
                                        <ChevronRight className="h-2.5 w-2.5 text-primary/40 group-hover:text-primary transition-colors"/>
                                        <Link href={`/${city.slug}/${area.slug}/${cat.slug}`} className="text-muted-foreground hover:text-primary transition-colors line-clamp-1">{cat.name}</Link>
                                    </li>
                                ))}
                                </ul>
                            </div>
                            ))}
                        </div>
                    </div>
                ))}
                </div>
            </section>
            
            {/* Section 6: All Services by Category */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Briefcase className="h-6 w-6"/></div>
                    <h2 className="text-2xl font-bold font-headline">Explore Every Service</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {data.servicesByCategory.map(({ category, subCategories }) => (
                    <div key={category.id} className="bg-card p-5 rounded-2xl shadow-sm border border-border/50">
                        <h3 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2 border-b pb-2">
                            <span className="h-2 w-2 rounded-full bg-primary" /> {category.name}
                        </h3>
                        <ul className="space-y-5">
                            {subCategories.map(({ subCategory, services }) => (
                                <li key={subCategory.id}>
                                    <p className="font-bold text-primary/80 text-[10px] uppercase tracking-widest mb-2">{subCategory.name}</p>
                                    <ul className="space-y-2">
                                        {services.map(service => (
                                            <li key={service.id} className="flex items-center gap-2 group">
                                                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20 group-hover:bg-primary transition-colors" />
                                                <Link href={`/service/${service.slug}`} className="text-muted-foreground hover:text-primary text-xs transition-colors">{service.name}</Link>
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                </div>
            </section>

            {/* Section 7: All Blog Pages */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><BookOpen className="h-6 w-6"/></div>
                    <h2 className="text-2xl font-bold font-headline">From Our Blog</h2>
                </div>
                <div className="bg-card p-8 rounded-3xl shadow-sm border border-border/50">
                    <ul className="space-y-3 columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-8">
                    {data.blogs.map(blog => (
                        <li key={blog.id} className="break-inside-avoid flex items-start gap-2 group">
                            <ChevronRight className="h-3 w-3 text-primary mt-1 opacity-40 group-hover:opacity-100 transition-opacity" />
                            <Link href={`/blog/${blog.slug}`} className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors leading-snug">{blog.title}</Link>
                        </li>
                    ))}
                    </ul>
                </div>
            </section>

            {/* Section 8: Localized Service SEO Pages */}
            {data.serviceOverrides && data.serviceOverrides.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Briefcase className="h-6 w-6"/></div>
                        <h2 className="text-2xl font-bold font-headline">Localized Service Pages</h2>
                    </div>
                    <div className="bg-card p-8 rounded-3xl shadow-sm border border-border/50">
                        <ul className="space-y-3 columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-8">
                        {data.serviceOverrides.map(setting => (
                            <li key={setting.id} className="break-inside-avoid flex items-start gap-2 group">
                                <ChevronRight className="h-3 w-3 text-primary mt-1 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                                <Link 
                                  href={`/${setting.citySlug}/${setting.areaSlug}/service/${setting.serviceSlug}`} 
                                  className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors leading-snug"
                                >
                                  {setting.serviceName} in {setting.areaName} ({setting.cityName})
                                </Link>
                            </li>
                        ))}
                        </ul>
                    </div>
                </section>
            )}
        </div>
      </div>
    </div>
  );
}
