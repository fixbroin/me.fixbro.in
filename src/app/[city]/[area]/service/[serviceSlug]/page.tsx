import { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { adminDb } from '@/lib/firebaseAdmin';
import { getGlobalSEOSettings, getAreaServiceSeoOverride } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import { serializeFirestoreData } from '@/lib/serializeUtils';
import { getAggregateRating } from '@/lib/homepageUtils';
import { replacePlaceholders, defaultSeoValues } from '@/lib/seoUtils';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';
import AreaServiceSeoPageClient from '@/components/service/AreaServiceSeoPageClient';
import type { FirestoreCity, FirestoreArea, FirestoreService, AreaServiceSeoSetting } from '@/types/firestore';

interface AreaServicePageProps {
  params: Promise<{ city: string; area: string; serviceSlug: string }>;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

const getPageData = cache(async (citySlug: string, areaSlug: string, serviceSlug: string) => {
  return unstable_cache(
    async () => {
      try {
        if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.') || areaSlug.includes('.') || serviceSlug.includes('.')) {
          return null;
        }

        // Get City
        const citiesRef = adminDb.collection('cities');
        const cityQuery = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
        const citySnapshot = await cityQuery.get();
        if (citySnapshot.empty) return null;
        const cityData = { ...serializeFirestoreData<any>(citySnapshot.docs[0].data()), id: citySnapshot.docs[0].id } as FirestoreCity;

        // Get Area
        const areasRef = adminDb.collection('areas');
        const areaQuery = areasRef.where('cityId', '==', cityData.id).where('slug', '==', areaSlug).where('isActive', '==', true).limit(1);
        const areaSnapshot = await areaQuery.get();
        if (areaSnapshot.empty) return null;
        const areaData = { ...serializeFirestoreData<any>(areaSnapshot.docs[0].data()), id: areaSnapshot.docs[0].id } as FirestoreArea;

        // Get Service
        const servicesRef = adminDb.collection('adminServices');
        const serviceQuery = servicesRef.where('slug', '==', serviceSlug).limit(1);
        const serviceSnapshot = await serviceQuery.get();
        if (serviceSnapshot.empty) return null;
        const serviceData = { ...serializeFirestoreData<any>(serviceSnapshot.docs[0].data()), id: serviceSnapshot.docs[0].id } as FirestoreService;

        // Get Override Config
        const seoOverride = await getAreaServiceSeoOverride(areaData.id, serviceData.id);

        return { cityData, areaData, serviceData, seoOverride };
      } catch (error) {
        console.error(`[AreaServicePageProps] Error fetching page data:`, error);
        return null;
      }
    },
    [`area-service-data-${citySlug}-${areaSlug}-${serviceSlug}`],
    { revalidate: false, tags: ['cities', 'areas', 'services', 'seo-settings', 'global-cache'] }
  )();
});

export async function generateMetadata(
  { params }: AreaServicePageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { city: citySlug, area: areaSlug, serviceSlug } = await params;
  const pageData = await getPageData(citySlug, areaSlug, serviceSlug);

  if (!pageData) return {};
  const { cityData, areaData, serviceData, seoOverride } = pageData;

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();

  const placeholderData = {
    cityName: cityData.name,
    areaName: areaData.name,
    serviceName: serviceData.name
  };

  // Build customized metadata with manual config values or localized fallbacks
  const title = replacePlaceholders(
    seoOverride?.meta_title || `${serviceData.name} in ${areaData.name}, ${cityData.name} | FixBro`,
    placeholderData
  );

  const description = replacePlaceholders(
    seoOverride?.meta_description || `Professional ${serviceData.name} services in ${areaData.name}, ${cityData.name}. Quality home solutions, transparent pricing, verified experts by FixBro.`,
    placeholderData
  );

  const keywordsString = replacePlaceholders(
    seoOverride?.meta_keywords || `${serviceData.name} in ${areaData.name}, ${serviceData.name} near me, best ${serviceData.name} in ${cityData.name}`,
    placeholderData
  );
  const keywords = keywordsString.split(',').map(k => k.trim()).filter(k => k);

  const rawSchemaImage = serviceData.imageUrl || seoSettings.structuredDataImage || `/default-image.png`;
  const ogImage = rawSchemaImage.startsWith('http') ? rawSchemaImage : `${appBaseUrl}${rawSchemaImage.startsWith('/') ? '' : '/'}${rawSchemaImage}`;

  const pagePath = `/${cityData.slug}/${areaData.slug}/service/${serviceData.slug}`;

  return {
    title: title,
    description: description,
    keywords: keywords.length > 0 ? keywords : undefined,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${appBaseUrl}${pagePath}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: pagePath,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'article',
    },
  };
}

export default async function AreaServiceDetailPage({ params }: AreaServicePageProps) {
  const { city: citySlug, area: areaSlug, serviceSlug } = await params;
  const [pageData, aggregateRating, seoSettings] = await Promise.all([
    getPageData(citySlug, areaSlug, serviceSlug),
    getAggregateRating(),
    getGlobalSEOSettings()
  ]);

  if (!pageData || !pageData.serviceData) {
    notFound();
  }

  const { cityData, areaData, serviceData, seoOverride } = pageData;
  const appBaseUrl = getBaseUrl();
  const pagePath = `/${cityData.slug}/${areaData.slug}/service/${serviceData.slug}`;

  const breadcrumbItems = [
    { name: "Home", url: appBaseUrl },
    { name: cityData.name, url: `${appBaseUrl}/${cityData.slug}` },
    { name: areaData.name, url: `${appBaseUrl}/${cityData.slug}/${areaData.slug}` },
    { name: serviceData.name, url: `${appBaseUrl}/${cityData.slug}/${areaData.slug}/service/${serviceData.slug}` }
  ];
  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbItems);

  // Ratings calculation
  const ratingValue = serviceData.rating || aggregateRating?.ratingValue || seoSettings.fallbackRatingValue || "4.8";
  const reviewCount = serviceData.reviewCount || aggregateRating?.reviewCount || seoSettings.fallbackReviewCount || "156";
  const serviceImageUrl = serviceData.imageUrl || `/android-chrome-512x512.png`;
  const schemaImage = serviceImageUrl.startsWith('http') ? serviceImageUrl : `${appBaseUrl}${serviceImageUrl.startsWith('/') ? '' : '/'}${serviceImageUrl}`;

  const placeholderData = {
    cityName: cityData.name,
    areaName: areaData.name,
    serviceName: serviceData.name
  };

  // Resolve dynamic content templates with local city/area/service placeholders
  const seoContent = seoOverride?.seo_content || replacePlaceholders(seoSettings.areaServiceSeoContentTemplate || defaultSeoValues.areaServiceSeoContentTemplate, placeholderData);
  const rawFaqs = seoOverride?.faqs || seoSettings.areaServiceFaqsTemplate || defaultSeoValues.areaServiceFaqsTemplate || [];
  const faqs = rawFaqs.map(f => ({
    question: replacePlaceholders(f.question, placeholderData),
    answer: replacePlaceholders(f.answer, placeholderData)
  }));

  const ratingValNum = parseFloat(String(ratingValue)) || 4.8;
  const reviewCountNum = parseInt(String(reviewCount), 10) || 17856;

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": seoOverride?.h1_title || `${serviceData.name} in ${areaData.name}, ${cityData.name}`,
    "description": seoOverride?.meta_description || serviceData.description || `Professional ${serviceData.name} services in ${areaData.name}, ${cityData.name}.`,
    "image": schemaImage,
    "provider": {
      "@type": "LocalBusiness",
      "name": "FixBro",
      "telephone": seoSettings.structuredDataTelephone,
      "priceRange": "₹₹",
      "image": schemaImage,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": seoSettings.structuredDataStreetAddress,
        "addressLocality": cityData.name,
        "addressRegion": seoSettings.structuredDataRegion,
        "addressCountry": "IN"
      }
    },
    "areaServed": {
      "@type": "City",
      "name": cityData.name
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": ratingValNum,
      "reviewCount": reviewCountNum,
      "bestRating": 5,
      "worstRating": 1
    }
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": seoOverride?.h1_title || `${serviceData.name} in ${areaData.name}, ${cityData.name}`,
    "description": seoOverride?.meta_description || serviceData.description || `Professional ${serviceData.name} services in ${areaData.name}, ${cityData.name}.`,
    "image": schemaImage,
    "brand": {
      "@type": "Brand",
      "name": "FixBro"
    },
    "sku": `${cityData.id}-${areaData.id}-${serviceData.id}`,
    "mpn": `${cityData.id}-${areaData.id}-${serviceData.id}`,
    "offers": serviceData.price ? {
      "@type": "Offer",
      "price": parseFloat(String(serviceData.discountedPrice || serviceData.price)) || 0,
      "priceCurrency": "INR",
      "availability": "https://schema.org/InStock",
      "url": `${appBaseUrl}${pagePath}`,
      "priceValidUntil": `${new Date().getFullYear() + 5}-12-31`,
      "validFrom": `${new Date().getFullYear()}-01-01`,
      "hasMerchantReturnPolicy": {
        "@type": "MerchantReturnPolicy",
        "applicableCountry": "IN",
        "returnPolicyCategory": "https://schema.org/MerchantReturnNotPermitted"
      },
      "shippingDetails": {
        "@type": "OfferShippingDetails",
        "shippingRate": {
          "@type": "MonetaryAmount",
          "value": 0,
          "currency": "INR"
        },
        "shippingDestination": {
          "@type": "DefinedRegion",
          "addressCountry": "IN"
        },
        "deliveryTime": {
          "@type": "ShippingDeliveryTime",
          "handlingTime": {
            "@type": "QuantitativeValue",
            "minValue": 0,
            "maxValue": 0,
            "unitCode": "DAY"
          },
          "transitTime": {
            "@type": "QuantitativeValue",
            "minValue": 0,
            "maxValue": 0,
            "unitCode": "DAY"
          }
        }
      }
    } : undefined,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": ratingValNum,
      "reviewCount": reviewCountNum,
      "bestRating": 5,
      "worstRating": 1
    }
  };

  let faqSchema = null;
  if (faqs.length > 0) {
    faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs.map(faq => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    };
  }

  return (
    <>
      <JsonLdScript data={serviceSchema} idSuffix={`area-service-main-${cityData.id}-${areaData.id}-${serviceData.id}`} />
      <JsonLdScript data={productSchema} idSuffix={`area-service-product-${cityData.id}-${areaData.id}-${serviceData.id}`} />
      <JsonLdScript data={breadcrumbSchema} idSuffix={`breadcrumb-area-service-${cityData.id}-${areaData.id}-${serviceData.id}`} />
      {faqSchema && <JsonLdScript data={faqSchema} idSuffix={`faqs-area-service-${cityData.id}-${areaData.id}-${serviceData.id}`} />}
      <AreaServiceSeoPageClient
        cityData={cityData}
        areaData={areaData}
        serviceData={serviceData}
        seoOverride={seoOverride}
        seoContent={seoContent}
        faqs={faqs}
        breadcrumbItems={breadcrumbItems}
      />
    </>
  );
}
