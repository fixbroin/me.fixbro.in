"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { AppSettings } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";
const CACHE_KEY = "app-config";

interface UseApplicationConfigReturn {
  config: AppSettings;
  isLoading: boolean;
  error: string | null;
}

export function useApplicationConfig(): UseApplicationConfigReturn {
  const [config, setConfig] = useState<AppSettings>(() => getCache<AppSettings>(CACHE_KEY, true) || defaultAppSettings);
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  const processData = useCallback((firestoreData: Partial<AppSettings>): AppSettings => {
    return {
      ...defaultAppSettings,
      ...firestoreData,
      timeSlotSettings: {
        ...defaultAppSettings.timeSlotSettings,
        ...(firestoreData.timeSlotSettings || {}),
        weeklyAvailability: {
          ...defaultAppSettings.timeSlotSettings.weeklyAvailability,
          ...(firestoreData.timeSlotSettings?.weeklyAvailability || {}),
        }
      },
      platformFees: firestoreData.platformFees || defaultAppSettings.platformFees || [],
      enableCancellationPolicy: typeof firestoreData.enableCancellationPolicy === 'boolean' ? firestoreData.enableCancellationPolicy : defaultAppSettings.enableCancellationPolicy,
      isProviderRegistrationEnabled: typeof firestoreData.isProviderRegistrationEnabled === 'boolean' ? firestoreData.isProviderRegistrationEnabled : defaultAppSettings.isProviderRegistrationEnabled,
      isCancelledChequeCompulsory: typeof firestoreData.isCancelledChequeCompulsory === 'boolean' ? firestoreData.isCancelledChequeCompulsory : defaultAppSettings.isCancelledChequeCompulsory,
      enableEmailPasswordLogin: typeof firestoreData.enableEmailPasswordLogin === 'boolean' ? firestoreData.enableEmailPasswordLogin : defaultAppSettings.enableEmailPasswordLogin,
      enableOtpLogin: typeof firestoreData.enableOtpLogin === 'boolean' ? firestoreData.enableOtpLogin : defaultAppSettings.enableOtpLogin,
      enableGoogleLogin: typeof firestoreData.enableGoogleLogin === 'boolean' ? firestoreData.enableGoogleLogin : defaultAppSettings.enableGoogleLogin,
      isReferralSystemEnabled: typeof firestoreData.isReferralSystemEnabled === 'boolean' ? firestoreData.isReferralSystemEnabled : defaultAppSettings.isReferralSystemEnabled,
    };
  }, []);

  useEffect(() => {
    const configDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);

    const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const processed = processData(docSnap.data());
        setConfig(processed);
      }
      setIsLoading(false);
    }, (err: any) => {
      if (err?.name !== 'AbortError' && !err?.message?.includes('Failed to fetch')) {
        console.error("Error subscribing to app config:", err);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [processData]);

  return { config, isLoading, error };
}
