"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, Activity, UserCircle, Home, ShoppingCart, FileText, UserPlus, 
  Tag, Zap, CalendarCheck2, LogOut, Trash2 as TrashIcon, AlertTriangle, 
  Clock, RefreshCcw, ChevronRight, ExternalLink, ShieldCheck, User
} from "lucide-react";
import type { UserActivity, FirestoreUser } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, Timestamp, limit, getDocs, writeBatch, where, documentId, startAfter, getDoc, doc, type DocumentSnapshot } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { getArchivedActivities } from '@/lib/adminDashboardUtils';
import { triggerRefresh } from '@/lib/revalidateUtils';


import { getTimestampMillis } from '@/lib/utils';

interface GroupedUserActivity extends UserActivity {
  _isGrouped?: boolean;
  _totalQuantity?: number;
  _groupCount?: number;
  userDisplayName?: string; // Denormalized name
}

const EventBadge = ({ eventType }: { eventType: UserActivity['eventType'] }) => {
  const configs: Record<string, { icon: any, color: string, bg: string, label: string }> = {
    newUser: { icon: UserPlus, color: 'text-green-600', bg: 'bg-green-500/10', label: 'New User' },
    userLogin: { icon: UserCircle, color: 'text-blue-600', bg: 'bg-blue-500/10', label: 'Login' },
    userLogout: { icon: LogOut, color: 'text-red-600', bg: 'bg-red-500/10', label: 'Logout' },
    pageView: { icon: Home, color: 'text-indigo-600', bg: 'bg-indigo-500/10', label: 'Page View' },
    addToCart: { icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-500/10', label: 'Cart Add' },
    removeFromCart: { icon: TrashIcon, color: 'text-pink-600', bg: 'bg-pink-500/10', label: 'Cart Remove' },
    newBooking: { icon: Tag, color: 'text-teal-600', bg: 'bg-teal-500/10', label: 'Booking' },
    checkoutStep: { icon: Zap, color: 'text-purple-600', bg: 'bg-purple-500/10', label: 'Checkout' },
    adminAction: { icon: CalendarCheck2, color: 'text-slate-600', bg: 'bg-slate-500/10', label: 'Admin' },
    timeOnPage: { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/5', label: 'Time Spent' },
  };

  const config = configs[eventType] || { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-500/10', label: eventType };
  const Icon = config.icon;

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-transparent font-bold text-[10px] uppercase tracking-wider shadow-sm", config.bg, config.color)}>
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </div>
  );
};

const formatTimestamp = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return formatDistanceToNow(new Date(millis), { addSuffix: true });
};

import { onSnapshot } from '@/lib/mysqlDb';

export default function AdminActivityFeedPage() {
  const { config: appConfig } = useApplicationConfig();
  const [cachedActivities, setCachedActivities] = useState<UserActivity[]>([]);
  const [liveActivities, setLiveActivities] = useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const formatActivityTimestamp = useCallback((timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return `${formatDateInTimezone(millis, appConfig?.timezone, { day: '2-digit', month: 'short' })} ${formatTimeInTimezone(millis, appConfig?.timezone)}`;
  }, [appConfig?.timezone]);
  const loadCachedData = useCallback(async () => {
    try {
      const result = await getArchivedActivities();
      setCachedActivities(result);
    } catch (err) {
      console.error("Error loading activity feed cache:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Setup Live Listener (Real-time for ONLY the latest 20 items)
  useEffect(() => {
    loadCachedData();

    const q = query(collection(db, "userActivities"), orderBy("timestamp", "desc"), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLive = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UserActivity));
      setLiveActivities(newLive);
    }, (error) => {
      console.error("Live listener error:", error);
    });

    return () => unsubscribe();
  }, [loadCachedData]);

  // 3. Merge Live and Cached data (Deduplicated)
  const activities = useMemo(() => {
    const combined = [...liveActivities, ...cachedActivities];
    // Use a Map to ensure unique IDs (live data takes priority)
    const uniqueMap = new Map(combined.map(a => [a.id, a]));
    return Array.from(uniqueMap.values()).sort((a, b) => {
        return getTimestampMillis(b.timestamp) - getTimestampMillis(a.timestamp);
    });
  }, [liveActivities, cachedActivities]);

  // Fetch missing user names
  useEffect(() => {
    const uidsToFetch = Array.from(new Set(
      activities
        .filter(a => a.userId && (!a.userDisplayName || a.userDisplayName === 'Registered User'))
        .map(a => a.userId)
    )).filter(uid => uid && !userNames[uid]) as string[];

    if (uidsToFetch.length === 0) return;

    const fetchNames = async () => {
      const newUserNames = { ...userNames };
      // Process in small chunks to avoid massive concurrent requests or complex queries
      for (const uid of uidsToFetch) {
        try {
          const userDoc = await getDoc(doc(db, "users", uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as FirestoreUser;
            newUserNames[uid] = userData.displayName || userData.email || 'Registered User';
          } else {
            newUserNames[uid] = 'Registered User';
          }
        } catch (err) {
          console.error(`Error fetching user ${uid}:`, err);
          newUserNames[uid] = 'Registered User';
        }
      }
      setUserNames(newUserNames);
    };

    fetchNames();
  }, [activities, userNames]);


  const displayActivities = useMemo(() => {
    const result: GroupedUserActivity[] = [];
    activities.forEach((activity) => {
      // Add the real name if we have it in our map
      const enhancedActivity = { ...activity } as GroupedUserActivity;
      if (enhancedActivity.userId && userNames[enhancedActivity.userId]) {
        enhancedActivity.userDisplayName = userNames[enhancedActivity.userId];
      }

      const prev = result[result.length - 1];
      const isSameUser = prev && (
        (enhancedActivity.userId && enhancedActivity.userId === prev.userId) || 
        (enhancedActivity.guestId && enhancedActivity.guestId === prev.guestId)
      );
      
      const isGroupableType = enhancedActivity.eventType === 'addToCart' || enhancedActivity.eventType === 'removeFromCart';
      
      if (isSameUser && prev.eventType === enhancedActivity.eventType && isGroupableType && prev.eventData.serviceId === enhancedActivity.eventData.serviceId) {
        prev._isGrouped = true;
        prev._groupCount = (prev._groupCount || 1) + 1;
        if (enhancedActivity.eventData.quantity) {
          prev._totalQuantity = (prev._totalQuantity || prev.eventData.quantity || 0) + enhancedActivity.eventData.quantity;
        }
      } else {
        const newActivity = { ...enhancedActivity } as GroupedUserActivity;
        if (isGroupableType) {
          newActivity._totalQuantity = enhancedActivity.eventData.quantity;
          newActivity._groupCount = 1;
        }
        result.push(newActivity);
      }
    });
    return result;
  }, [activities, userNames]);

  const handleClearAllActivities = async () => {
    setIsClearing(true);
    try {
      const activitiesCollectionRef = collection(db, "userActivities");
      const querySnapshot = await getDocs(activitiesCollectionRef);
      
      if (querySnapshot.empty) {
        toast({ title: "No Activities", description: "There are no activities to clear.", variant: "default" });
        setIsClearing(false);
        return;
      }

      const batchArray = [];
      let currentBatch = writeBatch(db);
      let currentBatchSize = 0;

      querySnapshot.docs.forEach((doc) => {
        currentBatch.delete(doc.ref);
        currentBatchSize++;
        if (currentBatchSize === 500) { 
          batchArray.push(currentBatch);
          currentBatch = writeBatch(db);
          currentBatchSize = 0;
        }
      });

      if (currentBatchSize > 0) {
        batchArray.push(currentBatch);
      }

      for (const batch of batchArray) {
        await batch.commit();
      }
      
      // SmartSync: Clear the server-side cache
      await triggerRefresh('activities');
      await triggerRefresh('global-cache');
      
      // Clear local state immediately
      
      setLiveActivities([]);
      setCachedActivities([]);
      toast({ title: "Activities Cleared", description: "All user activities have been cleared." });
    } catch (error) {
      console.error("Error clearing activities: ", error);
      toast({ title: "Error Clearing Activities", description: (error as Error).message || "Could not clear all activities.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const renderEventData = (activity: GroupedUserActivity) => {
    const data = activity.eventData;
    const isGrouped = activity._isGrouped;
    const totalQty = activity._totalQuantity;

    switch (activity.eventType) {
      case 'pageView':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{data.pageUrl || 'N/A'}</span>
            <Link href={data.pageUrl || '#'} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-primary/10 rounded-md transition-colors">
              <ExternalLink className="h-3 w-3 text-primary" />
            </Link>
          </div>
        );
      case 'timeOnPage':
        return <span className="text-xs font-medium">Spent <span className="text-primary">{data.durationSeconds}s</span> on {data.pageUrl || 'a page'}</span>;
      case 'addToCart':
        return (
          <span className="text-xs font-medium">
            Added <span className="text-orange-600">{data.serviceName}</span> 
            {isGrouped ? (
              <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black uppercase tracking-tighter">
                Total: {totalQty}
              </span>
            ) : (
              ` (Qty: ${data.quantity})`
            )}
          </span>
        );
      case 'removeFromCart':
        return (
          <span className="text-xs font-medium text-pink-600">
            Removed {data.serviceName}
            {isGrouped && (
              <span className="ml-2 px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-black uppercase tracking-tighter">
                Total: {totalQty}
              </span>
            )}
          </span>
        );
      case 'newBooking':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-600">₹{data.totalAmount?.toFixed(2)}</span>
            <Link href={`/admin/bookings/edit/${data.bookingDocId || '#'}`} className="text-xs font-bold text-blue-600 hover:underline flex items-center">
              {data.bookingId} <ChevronRight className="h-3 w-3 ml-0.5" />
            </Link>
          </div>
        );
      case 'newUser':
        return <span className="text-xs font-bold text-green-600">{data.email || data.mobileNumber}</span>;
      case 'userLogin':
        return (
          <span className="text-xs font-medium">
            via {data.email || data.mobileNumber || data.loginMethod || 'Auth'}
            {data.loginMethod && (data.email || data.mobileNumber) && (
              <span className="ml-1 text-[10px] text-muted-foreground uppercase opacity-70">({data.loginMethod})</span>
            )}
          </span>
        );
      case 'userLogout':
        return <span className="text-xs text-muted-foreground italic">Logout ({data.logoutMethod})</span>;
      case 'checkoutStep':
        return <span className="text-xs font-bold text-purple-600 uppercase tracking-tighter">{data.checkoutStepName}</span>;
      default:
        return <code className="text-[10px] bg-muted/50 p-1 px-2 rounded font-mono text-muted-foreground break-all">{JSON.stringify(data)}</code>;
    }
  };

  const renderUserCell = (activity: GroupedUserActivity) => {
    const isGuest = !activity.userId;
    const name = activity.userDisplayName || (isGuest ? 'Guest User' : 'Registered User');
    
    return (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 border shadow-sm shrink-0">
          <AvatarFallback className={cn("text-[10px] font-black uppercase", isGuest ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary")}>
            {isGuest ? <User className="h-4 w-4" /> : name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold truncate tracking-tight">{name}</p>
            {!isGuest && <ShieldCheck className="h-3 w-3 text-blue-500" />}
          </div>
          <p className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]" title={activity.userId || activity.guestId || ""}>
            {activity.userId || activity.guestId}
          </p>
        </div>
      </div>
    );
  };

  const renderMobileCard = (activity: GroupedUserActivity, idx: number) => (
    <motion.div
      key={activity.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx < 10 ? idx * 0.05 : 0 }}
      className="p-5 border-b last:border-none bg-card hover:bg-muted/30 transition-colors"
    >
      <div className="flex justify-between items-start mb-4">
        <EventBadge eventType={activity.eventType} />
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
            {formatActivityTimestamp(activity.timestamp)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-2xl border border-dashed border-muted-foreground/20">
          <Avatar className="h-10 w-10 border shadow-sm shrink-0">
            <AvatarFallback className={cn("text-xs font-black uppercase", !activity.userId ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary")}>
              {!activity.userId ? <User className="h-4 w-4" /> : (activity.userDisplayName || 'U').charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold truncate tracking-tight">
                {activity.userDisplayName || (activity.userId ? 'Registered User' : 'Guest User')}
              </p>
              {activity.userId && <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate break-all" title={activity.userId || activity.guestId || ""}>
              {activity.userId || activity.guestId}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-primary/[0.03] border border-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">Interaction Details</span>
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {renderEventData(activity)}
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Platform History</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight flex items-center">
            Activity Feed
          </h1>
          <p className="text-muted-foreground text-sm font-medium">Archived stream of all platform events. (Refreshed hourly)</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-card border shadow-sm p-2 rounded-2xl">
          <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold text-xs" onClick={() => loadCachedData()} disabled={isLoading}>
            <RefreshCcw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Sync Now
          </Button>

          <PermissionGuard moduleId="activity_feed" action="delete">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-10 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive font-bold text-xs" disabled={isLoading || isClearing || activities.length === 0}>
                  {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                  Delete All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl p-8">
                <AlertDialogHeader>
                  <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <AlertDialogTitle className="text-2xl font-bold tracking-tight text-destructive uppercase">Confirm Full Purge</AlertDialogTitle>
                  <AlertDialogDescription className="text-base font-medium">
                    This will permanently wipe ALL recorded user activities from the system. This operation cannot be reversed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-8 gap-3">
                  <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80">Keep Data</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAllActivities} className="rounded-xl bg-destructive hover:bg-destructive/90 px-8">
                    Erase Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </PermissionGuard>
        </div>
      </header>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card">
        <CardContent className="p-0">
          {isLoading && activities.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-[400px] space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Syncing Cache...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-32 bg-muted/5">
              <Activity className="h-16 w-16 mx-auto text-muted-foreground/20 mb-6" />
              <p className="text-xl font-bold tracking-tight">No Events Detected</p>
              <p className="text-muted-foreground text-sm mt-1">Activities will appear here after the next sync.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="w-[180px] pl-8 py-5 text-[10px] font-black uppercase tracking-widest">Type</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest">Interaction</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest">User Identity</TableHead>
                      <TableHead className="text-right pr-8 text-[10px] font-black uppercase tracking-widest">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {displayActivities.map((activity, idx) => (
                        <motion.tr
                          key={activity.id}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3, delay: idx < 10 ? idx * 0.05 : 0 }}
                          className="group border-b border-muted/40 transition-all hover:bg-primary/[0.02]"
                        >
                          <TableCell className="pl-8 py-4">
                            <EventBadge eventType={activity.eventType} />
                          </TableCell>
                          <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                            {renderEventData(activity)}
                          </TableCell>
                          <TableCell>
                            {renderUserCell(activity)}
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
                                {formatActivityTimestamp(activity.timestamp)}
                              </span>
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>

              {/* Mobile View: Cards */}
              <div className="md:hidden">
                <AnimatePresence initial={false}>
                  {displayActivities.map((activity, idx) => renderMobileCard(activity, idx))}
                </AnimatePresence>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
