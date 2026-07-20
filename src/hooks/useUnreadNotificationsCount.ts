
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth'; // Assuming useAuth is in the same hooks directory or adjust path
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, limit, or, and } from '@/lib/mysqlDb';
import type { FirestoreNotification } from '@/types/firestore';

interface UseUnreadNotificationsCountReturn {
  count: number;
  isLoading: boolean;
}

export function useUnreadNotificationsCount(userIdOverride?: string): UseUnreadNotificationsCountReturn {
  const { user, isSuperAdmin, adminRole, isLoading: authLoading } = useAuth();
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const effectiveUserId = userIdOverride || user?.uid;
  const isAdmin = !!adminRole || isSuperAdmin;

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!effectiveUserId) {
      setCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const notificationsCollectionRef = collection(db, "userNotifications");
    
    let newQuery;

    if (isSuperAdmin) {
      // Super Admin sees everything
      newQuery = query(
        notificationsCollectionRef,
        where("read", "==", false),
        limit(20)
      );
    } else if (isAdmin) {
      // Other admins see their own OR any admin alerts, but only unread ones
      newQuery = query(
        notificationsCollectionRef,
        and(
          or(
            where("userId", "==", effectiveUserId),
            where("type", "==", "admin_alert")
          ),
          where("read", "==", false)
        ),
        limit(20)
      );
    } else {
      // Regular users only see their own unread
      newQuery = query(
        notificationsCollectionRef,
        where("userId", "==", effectiveUserId),
        where("read", "==", false),
        limit(20)
      );
    }

    const unsubscribe = onSnapshot(newQuery, (querySnapshot) => {
      setCount(querySnapshot.size);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching unread notifications count:", error);
      setCount(0);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveUserId, isSuperAdmin, isAdmin, authLoading]);

  return { count, isLoading };
}
