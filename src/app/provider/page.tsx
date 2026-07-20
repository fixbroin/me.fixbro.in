
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle, Clock, Loader2, PackageSearch, ExternalLink, ShoppingBag, XCircle, PlayCircle, Tag, MapPin, User, Calendar, Phone, ArrowRight, TrendingUp } from "lucide-react";
import type { FirestoreBooking, BookingStatus } from '@/types/firestore';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp, collectionGroup, getDoc, addDoc, getDocs, limit } from '@/lib/mysqlDb';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useLoading } from '@/contexts/LoadingContext';
import AppImage from '@/components/ui/AppImage';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import type { FirestoreNotification } from '@/types/firestore';
import CompleteBookingDialog from '@/components/shared/CompleteBookingDialog';

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return dateString; }
};

const ProviderJobCard: React.FC<{
  job: FirestoreBooking;
  type: 'new' | 'ongoing' | 'completed';
  onAccept?: (bookingId: string) => void;
  onReject?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onCompleteWork?: (bookingId: string) => void;
  isProcessingAction?: boolean;
}> = ({ job, type, onAccept, onReject, onStartWork, onCompleteWork, isProcessingAction }) => {
  const { showLoading } = useLoading();
  const isJobCompleted = job.status === 'Completed';

  const handleViewDetailsClick = () => {
    showLoading();
  };

  const getStatusVariant = (status: FirestoreBooking['status']) => {
    if (status === 'ProviderAccepted' || status === 'InProgressByProvider') return 'default';
    if (status === 'Completed') return 'default';
    if (status === 'AssignedToProvider') return 'secondary';
    return 'outline';
  };

  const getStatusClasses = (status: FirestoreBooking['status']) => {
    if (status === 'ProviderAccepted' || status === 'InProgressByProvider') return 'bg-blue-500 text-white hover:bg-blue-600 border-none';
    if (status === 'Completed') return 'bg-green-500 text-white hover:bg-green-600 border-none';
    if (status === 'Cancelled' || status === 'ProviderRejected') return 'bg-red-500 text-white border-none';
    return '';
  };

  const handleWhatsAppClick = (e: React.MouseEvent, mobileNumber: string) => {
    e.stopPropagation();
    const sanitizedPhone = mobileNumber.replace(/\D/g, '');
    const internationalPhone = sanitizedPhone.startsWith('91') ? sanitizedPhone : `91${sanitizedPhone}`;
    const message = encodeURIComponent(`Hi ${job.customerName}, I'm your FixBro provider for booking #${job.bookingId}.`);
    window.open(`https://wa.me/${internationalPhone}?text=${message}`, '_blank');
  };

  return (
    <Card className="group overflow-hidden border-none shadow-md hover:shadow-xl transition-all duration-300 bg-card/50 backdrop-blur-sm flex flex-col h-full">
      <div className={cn(
        "h-1.5 w-full",
        type === 'new' ? "bg-primary" : type === 'ongoing' ? "bg-blue-500" : "bg-green-500"
      )} />
      
      <CardHeader className="p-4 sm:p-5">
        <div className="flex justify-between items-start gap-2 mb-2">
          <CardTitle className="text-base sm:text-lg font-bold leading-tight line-clamp-2 min-h-[3rem]">
            {job.services.map(s => s.name).join(', ')}
          </CardTitle>
          <Badge variant={getStatusVariant(job.status)} className={cn("capitalize whitespace-nowrap shadow-sm shrink-0", getStatusClasses(job.status))}>
            {job.status.replace(/([A-Z])/g, ' $1').replace('Provider ', '')}
          </Badge>
        </div>
        <div className="flex items-center text-[10px] sm:text-xs font-mono bg-muted/50 w-fit px-2 py-1 rounded text-muted-foreground">
          ID: {job.bookingId}
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:p-5 pt-0 space-y-3 flex-grow">
        <div className="grid gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground">{formatDateForDisplay(job.scheduledDate)}</span>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground">{job.scheduledTimeSlot}</span>
          </div>

          {job.estimatedEndTime && (
            <div className="flex items-center gap-2 bg-green-50/50 dark:bg-green-950/20 p-2 rounded-lg border border-green-100 dark:border-green-900/30">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              <div className="text-[11px] leading-tight">
                <p className="text-green-600/70 font-bold uppercase tracking-wider">Est. Completion</p>
                <p className="text-green-700 dark:text-green-400 font-semibold">
                  {new Date(job.estimatedEndTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(job.estimatedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-muted-foreground pt-1 border-t border-muted/50 mt-1">
            <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="line-clamp-2 text-xs">
              {isJobCompleted ? "[Hidden for Privacy]" : `${job.addressLine1}${job.addressLine2 ? `, ${job.addressLine2}` : ''}, ${job.city}`}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium text-foreground truncate max-w-[120px]">
                {isJobCompleted ? "[Hidden]" : job.customerName}
              </span>
            </div>
            
            {!isJobCompleted && job.customerPhone && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 gap-2 rounded-full border-primary/20 hover:bg-primary/5 text-primary"
                onClick={(e) => handleWhatsAppClick(e, job.customerPhone!)}
              >
                <AppImage src="/whatsapp.png" alt="WhatsApp" width={16} height={16} />
                <span className="text-xs font-bold">Contact</span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 sm:p-5 pt-0 flex flex-col sm:flex-row justify-end gap-2">
        <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs" asChild>
          <Link href={`/provider/booking/${job.id}`} onClick={handleViewDetailsClick}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5"/>View Details
          </Link>
        </Button>
        
        {type === 'new' && onAccept && onReject && (
          <>
            <Button size="sm" onClick={() => onReject(job.id!)} variant="destructive" disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <XCircle className="mr-1.5 h-3.5 w-3.5"/>} Reject
            </Button>
            <Button size="sm" onClick={() => onAccept(job.id!)} disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <CheckCircle className="mr-1.5 h-3.5 w-3.5"/>} Accept
            </Button>
          </>
        )}

        {type === 'ongoing' && job.status === 'ProviderAccepted' && onStartWork && (
          <Button size="sm" onClick={() => onStartWork(job.id!)} disabled={isProcessingAction} className="w-full sm:w-auto text-xs bg-blue-500 hover:bg-blue-600 text-white border-none">
            {isProcessingAction ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <PlayCircle className="mr-1.5 h-4 w-4"/>} Start Work
          </Button>
        )}
        
        {type === 'ongoing' && job.status === 'InProgressByProvider' && onCompleteWork && (
          <Button size="sm" onClick={() => onCompleteWork(job.id!)} disabled={isProcessingAction} className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700 text-white border-none">
            {isProcessingAction ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-1.5 h-4 w-4"/>} Mark Complete
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

const StatCard = ({ title, value, icon: Icon, colorClass, delay }: { title: string, value: number, icon: any, colorClass: string, delay: string }) => (
  <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm overflow-hidden group hover:shadow-md transition-all duration-300">
    <div className={cn("h-1 w-full", colorClass)} />
    <CardContent className="p-4 flex items-center justify-between">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
        <h3 className="text-2xl font-black mt-1">{value}</h3>
      </div>
      <div className={cn("p-2.5 rounded-xl bg-muted group-hover:scale-110 transition-transform duration-300", colorClass.replace('bg-', 'text-'))}>
        <Icon className="h-5 w-5" />
      </div>
    </CardContent>
  </Card>
);

export default function ProviderDashboardPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<FirestoreBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [processingBookingAction, setProcessingBookingAction] = useState<string | null>(null);

  // Completion Dialog State
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [bookingToComplete, setBookingToComplete] = useState<FirestoreBooking | null>(null);

  useEffect(() => {
    if (!providerUser || authIsLoading) {
      if (!authIsLoading && !providerUser) setIsLoadingBookings(false);
      return;
    }
    setIsLoadingBookings(true);
    const bookingsColGroupRef = collectionGroup(db, "bookings");
    const q = query(
      bookingsColGroupRef, 
      where("providerId", "==", providerUser.uid), 
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreBooking)));
      setIsLoadingBookings(false);
    }, (error) => {
      console.error("Error fetching provider bookings:", error);
      toast({ title: "Error", description: "Could not fetch your assigned jobs.", variant: "destructive" });
      setIsLoadingBookings(false);
    });
    return () => unsubscribe();
  }, [providerUser, authIsLoading, toast]);

  const updateBookingStatus = async (bookingId: string, newStatus: BookingStatus, additionalCharges?: {name: string, amount: number}[], finalizedPaymentMethod?: string) => {
    // SINGLE COMPLETION POPUP (Charges + Payment Method)
    if (newStatus === 'Completed' && !finalizedPaymentMethod) {
        const job = bookings.find(b => b.id === bookingId);
        if (job) {
            setBookingToComplete(job);
            setIsCompleteDialogOpen(true);
        }
        return;
    }

    setProcessingBookingAction(bookingId);
    try {
      const bookingDocRef = doc(db, "bookings", bookingId); 
      const updateData: any = { status: newStatus, updatedAt: Timestamp.now() };
      
      if (newStatus === "Completed") {
        if (additionalCharges && additionalCharges.length > 0) {
            updateData.additionalCharges = additionalCharges;
            const job = bookings.find(b => b.id === bookingId);
            updateData.totalAmount = (job?.totalAmount || 0) + additionalCharges.reduce((sum, c) => sum + c.amount, 0);
        }
        if (finalizedPaymentMethod) updateData.paymentMethod = finalizedPaymentMethod;
      }

      await updateDoc(bookingDocRef, updateData);
      
      // TRIGGER POST-PROCESS (Invoice + Emails)
      fetch('/api/bookings/post-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingDocId: bookingId }),
      }).catch(err => console.error("Notification trigger error:", err));

      toast({ title: "Success", description: `Job status updated to ${newStatus.replace(/([A-Z])/g, ' $1')}.` });
      setIsCompleteDialogOpen(false);
      setBookingToComplete(null);
    } catch (error) {
      console.error("Error updating job status:", error);
      toast({ title: "Error", description: "Could not update job status.", variant: "destructive" });
    } finally {
      setProcessingBookingAction(null);
    }
  };

  const newJobRequests = useMemo(() => bookings.filter(b => b.status === 'AssignedToProvider'), [bookings]);
  const ongoingJobs = useMemo(() => bookings.filter(b => b.status === 'ProviderAccepted' || b.status === 'InProgressByProvider'), [bookings]);
  const completedJobs = useMemo(() => bookings.filter(b => b.status === 'Completed'), [bookings]);

  if (authIsLoading || isLoadingBookings) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] space-y-4">
        <div className="relative h-16 w-16">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <Briefcase className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-muted-foreground font-medium animate-pulse">Syncing your dashboard...</p>
      </div>
    );
  }

  const providerFirstName = providerUser?.displayName?.split(' ')[0] || "Provider";

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2 px-3 py-1 border-primary/20 text-primary bg-primary/5 rounded-full font-bold">
            <TrendingUp className="h-3 w-3 mr-1.5" /> PRO DASHBOARD
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
            Welcome back, <span className="text-primary">{providerFirstName}!</span>
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">You have {newJobRequests.length} new service requests to review.</p>
        </div>
        <Button variant="outline" size="sm" asChild className="rounded-full font-bold border-muted-foreground/20">
          <Link href="/provider/my-jobs"><Briefcase className="mr-2 h-4 w-4" /> View Full History</Link>
        </Button>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="New Requests" value={newJobRequests.length} icon={Tag} colorClass="bg-primary" delay="0" />
        <StatCard title="Ongoing Jobs" value={ongoingJobs.length} icon={Clock} colorClass="bg-blue-500" delay="100ms" />
        <StatCard title="Completed" value={completedJobs.length} icon={CheckCircle} colorClass="bg-green-500" delay="200ms" />
      </div>

      <Separator className="bg-muted/50" />

      {/* New Requests Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-2">
            <div className="h-8 w-1.5 rounded-full bg-primary" />
            New Job Requests
            <Badge className="ml-2 bg-primary/10 text-primary border-none font-bold">{newJobRequests.length}</Badge>
          </h2>
        </div>
        {newJobRequests.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {newJobRequests.map((job) => (
              <ProviderJobCard key={job.id} job={job} type="new"
                onAccept={(id) => updateBookingStatus(id, 'ProviderAccepted')}
                onReject={(id) => updateBookingStatus(id, 'ProviderRejected')}
                isProcessingAction={processingBookingAction === job.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-muted/5">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <PackageSearch className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold">All caught up!</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">No new job requests assigned to you at the moment.</p>
          </div>
        )}
      </section>

      {/* Ongoing Jobs Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-2">
            <div className="h-8 w-1.5 rounded-full bg-blue-500" />
            Ongoing Jobs
            <Badge className="ml-2 bg-blue-500/10 text-blue-500 border-none font-bold">{ongoingJobs.length}</Badge>
          </h2>
        </div>
         {ongoingJobs.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ongoingJobs.map((job) => (
              <ProviderJobCard key={job.id} job={job} type="ongoing"
                onStartWork={(id) => updateBookingStatus(id, 'InProgressByProvider')}
                onCompleteWork={(id) => updateBookingStatus(id, 'Completed')}
                isProcessingAction={processingBookingAction === job.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-muted/5">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <PlayCircle className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold">No active jobs</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">You don't have any jobs currently in progress.</p>
          </div>
        )}
      </section>

      {/* Recent Completed Jobs Section */}
      <section className="space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-2">
            <div className="h-8 w-1.5 rounded-full bg-green-500" />
            Recently Completed
          </h2>
        </div>
        {completedJobs.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {completedJobs.slice(0, 3).map((job) => (
              <ProviderJobCard key={job.id} job={job} type="completed" />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm font-medium italic">No completed jobs yet.</p>
        )}
      </section>

      {bookingToComplete && (
        <CompleteBookingDialog 
          isOpen={isCompleteDialogOpen}
          onClose={() => { setIsCompleteDialogOpen(false); setBookingToComplete(null); }}
          onConfirm={(charges, pMethod) => updateBookingStatus(bookingToComplete.id!, 'Completed', charges, pMethod)}
          originalAmount={bookingToComplete.totalAmount}
          currentPaymentMethod={bookingToComplete.paymentMethod || "Cash"}
          isProcessing={processingBookingAction === bookingToComplete.id}
        />
      )}
    </div>
  );
}
