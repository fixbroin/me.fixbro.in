
"use client";

import { useLoading } from '@/contexts/LoadingContext';
import AppLoader from './AppLoader';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface GlobalActionLoaderProps {
  initialLoaderType?: string;
}

const GlobalActionLoader: React.FC<GlobalActionLoaderProps> = ({ initialLoaderType }) => {
  const { isLoading, hideLoading } = useLoading();
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Hide loader ONLY AFTER the new page has painted on screen
  useEffect(() => {
    if (isLoading && pathname !== previousPathnameRef.current) {
      previousPathnameRef.current = pathname;
      const timer = setTimeout(() => {
        hideLoading();
      }, 200);
      return () => clearTimeout(timer);
    }
    previousPathnameRef.current = pathname;
  }, [pathname, isLoading, hideLoading]);

  // 2. Safety Timeout: Don't let the loader stay forever if navigation fails (8 seconds)
  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        hideLoading();
      }, 8000); // 8 second safety limit
    } else if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isLoading, hideLoading]);

  if (!isLoading) {
    return null;
  }

  return <AppLoader text="Ready in a moment..." initialLoaderType={initialLoaderType} />;
};

export default GlobalActionLoader;
