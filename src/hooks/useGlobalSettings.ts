"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, getDoc, Timestamp } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, ThemeColors, ThemePalette, GlobalAdminPopup, LoaderType } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { defaultGlobalWebSettings } from '@/config/webDefaults';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';
import { getTimestampMillis } from '@/lib/utils';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const CACHE_KEY = "global-web-settings";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const isBot = (): boolean => {
  if (typeof window === 'undefined') return true;
  const botPatterns = [
      'bot', 'crawler', 'spider', 'crawling', 'googlebot', 'bingbot', 'yandexbot', 
      'slurp', 'duckduckbot', 'baiduspider', 'adsbot', 'mediapartners-google',
      'lighthouse', 'gtmetrix', 'pingdom', 'facebookexternalhit', 'whatsapp', 'linkedinbot'
  ];
  const ua = navigator.userAgent.toLowerCase();
  return botPatterns.some(pattern => ua.includes(pattern));
};

const processSettingsData = (data: Partial<GlobalWebSettings>): GlobalWebSettings => {
  const mergedLightPalette: Required<ThemePalette> = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
  THEME_PALETTE_KEYS.forEach(key => {
    if (data.themeColors?.light?.[key]) {
      (mergedLightPalette[key] as any) = data.themeColors.light[key];
    }
  });

  const mergedDarkPalette: Required<ThemePalette> = { ...DEFAULT_DARK_THEME_COLORS_HSL };
  THEME_PALETTE_KEYS.forEach(key => {
    if (data.themeColors?.dark?.[key]) {
      (mergedDarkPalette[key] as any) = data.themeColors.dark[key];
    }
  });

  const globalAdminPopup = {
    ...defaultGlobalWebSettings.globalAdminPopup,
    ...(data.globalAdminPopup || {}),
  } as GlobalAdminPopup;

  if (globalAdminPopup.sentAt && !(globalAdminPopup.sentAt instanceof Timestamp)) {
    const millis = getTimestampMillis(globalAdminPopup.sentAt);
    if (millis) {
      globalAdminPopup.sentAt = Timestamp.fromMillis(millis);
    }
  }

  return {
    ...defaultGlobalWebSettings,
    ...data,
    themeColors: {
      light: mergedLightPalette,
      dark: mergedDarkPalette,
    },
    socialMediaLinks: {
      ...defaultGlobalWebSettings.socialMediaLinks,
      ...(data.socialMediaLinks || {}),
    },
    homepageContent: data.homepageContent,
    globalAdminPopup,
  };
};

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalWebSettings>(() => {
    const cached = getCache<GlobalWebSettings>(CACHE_KEY, true);
    return cached ? processSettingsData(cached) : defaultGlobalWebSettings;
  });
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const hasLoadedRef = useRef(false);
  const isVisitorBot = useRef(isBot());

  useEffect(() => {
    if (settings?.loaderType && typeof document !== 'undefined') {
      document.cookie = `fixbro-loader-type=${settings.loaderType}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [settings?.loaderType]);

  useEffect(() => {
    if (isVisitorBot.current && !isAdmin) {
      setIsLoading(false);
      return;
    }

    // Direct fast fetch to dedicated /api/global-settings REST endpoint
    fetch('/api/global-settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.webSettings) {
          const processed = processSettingsData(data.webSettings);
          setSettings(processed);
          setCache(CACHE_KEY, processed, true);
        }
      })
      .catch(err => console.warn("Global settings REST fetch fallback:", err))
      .finally(() => setIsLoading(false));

    const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const processed = processSettingsData(docSnap.data());
        setSettings(processed);
        setCache(CACHE_KEY, processed, true);
      }
      setIsLoading(false);
      hasLoadedRef.current = true;
    }, (err: any) => {
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  return { settings, isLoading, error };
}
