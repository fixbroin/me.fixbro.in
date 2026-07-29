"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageSearch, Check, X, MoreHorizontal, AlertTriangle, Eye, Trash2 } from "lucide-react";
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, runTransaction, getDoc, addDoc, deleteDoc, where, getDocs } from '@/lib/mysqlDb';
import type { WithdrawalRequest, WithdrawalStatus, FirestoreNotification, FirestoreUser, ProviderApplication } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Banknote, RefreshCw } from "lucide-react";
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDescriptionComponent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription as DialogDescriptionComponent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { getTimestampMillis } from '@/lib/utils';

const formatDate = (timestamp?: any) => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return new Date(millis).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getStatusBadgeVariant = (status: WithdrawalStatus) => {
    switch(status) {
      case 'pending': return 'secondary';
      case 'approved': return 'default';
      case 'processing': return 'default';
      case 'completed': return 'default';
      case 'rejected': return 'destructive';
      case 're_submit': return 'destructive';
      default: return 'outline';
    }
};

const getStatusBadgeClass = (status: WithdrawalStatus) => {
     switch(status) {
      case 'approved':
      case 'completed':
        return 'bg-green-500 hover:bg-green-600';
      case 'processing':
         return 'bg-blue-500 hover:bg-blue-600';
      case 're_submit':
         return 'bg-yellow-500 hover:bg-yellow-600';
      default: return '';
    }
};

const DetailItem = ({ label, value }: { label: string, value?: string | null }) => (
    <div className="grid grid-cols-3 gap-2">
        <p className="text-sm text-muted-foreground col-span-1">{label}</p>
        <p className="text-sm font-semibold col-span-2">{value || 'N/A'}</p>
    </div>
);

export default function ProviderWithdrawalsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [providers, setProviders] = useState<FirestoreUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [requestToActOn, setRequestToActOn] = useState<WithdrawalRequest | null>(null);
  const [actionType, setActionType] = useState<'rejected' | 're_submit' | null>(null);

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState<WithdrawalRequest | null>(null);

  const loadProviders = async () => {
    setIsLoadingProviders(true);
    try {
        // 1. Fetch only approved provider applications (Very efficient)
        const appsQuery = query(collection(db, "providerApplications"), where("status", "==", "approved"));
        const appsSnapshot = await getDocs(appsQuery);
        const approvedApps = appsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProviderApplication));
        
        if (approvedApps.length === 0) {
            setProviders([]);
            return;
        }

        // 2. Fetch only the specific users who are providers (Targeted reads)
        // Firestore 'in' query supports max 30 items at a time
        const userIds = [...new Set(approvedApps.map(app => app.userId))];
        const providerList: FirestoreUser[] = [];
        const usersRef = collection(db, "users");

        // Split userIds into chunks of 30
        for (let i = 0; i < userIds.length; i += 30) {
            const chunk = userIds.slice(i, i + 30);
            const q = query(usersRef, where("__name__", "in", chunk));
            const userSnap = await getDocs(q);
            
            userSnap.docs.forEach(docSnap => {
                const userData = docSnap.data() as FirestoreUser;
                const appData = approvedApps.find(a => a.userId === docSnap.id);
                providerList.push({
                    ...userData,
                    uid: docSnap.id,
                    displayName: appData?.fullName || userData.displayName || "Unknown",
                    email: appData?.email || userData.email || "N/A"
                });
            });
        }

        // Sort by balance (highest first)
        setProviders(providerList.sort((a, b) => (b.withdrawableBalance || 0) - (a.withdrawableBalance || 0)));
    } catch (error) {
        console.error("Error loading providers:", error);
        toast({ title: "Error", description: "Could not load provider balances.", variant: "destructive" });
    } finally {
        setIsLoadingProviders(false);
    }
  };


  useEffect(() => {
    setIsLoading(true);
    const requestsRef = collection(db, "withdrawalRequests");
    const q = query(requestsRef, orderBy("requestedAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allRequests = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WithdrawalRequest));
      setRequests(allRequests.filter(req => req.providerId !== 'referral_system'));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching withdrawal requests:", error);
      toast({ title: "Error", description: "Could not load requests.", variant: "destructive" });
      setIsLoading(false);
    });
    
    loadProviders();
    return () => unsubscribe();
  }, [toast]);
  
  const handleViewDetails = (request: WithdrawalRequest) => {
    setSelectedRequestForDetails(request);
    setDetailsModalOpen(true);
  };

  const openRejectionDialog = (request: WithdrawalRequest, action: 'rejected' | 're_submit') => {
    setRequestToActOn(request);
    setActionType(action);
    setRejectionReason(action === 're_submit' ? request.adminNotes || '' : '');
    setShowRejectionDialog(true);
  };

  const handleUpdateStatus = async (request: WithdrawalRequest, newStatus: WithdrawalStatus, reason?: string) => {
    if (!request.id) return;
    setIsUpdating(request.id);
    const userDocRef = doc(db, "users", request.providerId);
    const requestDocRef = doc(db, "withdrawalRequests", request.id);

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) throw new Error("Provider user not found.");

        const updatePayload: Partial<WithdrawalRequest> = { status: newStatus, processedAt: Timestamp.now() };
        let userUpdatePayload: Partial<{[key: string]: any}> = {};
        let notificationMessage = `Your withdrawal request of ₹${request.amount.toFixed(2)} has been updated to ${newStatus}.`;
        let notificationType: FirestoreNotification['type'] = 'info';

        if (newStatus === 'rejected' || newStatus === 're_submit') {
          updatePayload.adminNotes = reason;
          // Only refund if the amount was previously deducted (which we will now do on request creation or keep it consistent)
          // Actually, let's look at how we want to handle the provider's balance.
          // If we deduct on REQUEST, then we refund on REJECT.
          // If we deduct on COMPLETE, then we don't refund on REJECT.
          
          // Decision: To be consistent with the Referral system (which is safer), 
          // we should deduct from the User doc the moment they REQUEST.
          
          const newWalletBalance = (userDoc.data().withdrawableBalance || 0) + request.amount;
          userUpdatePayload = { withdrawableBalance: newWalletBalance, withdrawalPending: false }; // Refund and unlock
          notificationMessage = `Your withdrawal of ₹${request.amount.toFixed(2)} was ${newStatus === 'rejected' ? 'rejected' : 'sent back for re-submission'}. Reason: ${reason}. The amount has been refunded to your wallet.`;
          notificationType = newStatus === 'rejected' ? 'error' : 'warning';
        } else if (newStatus === 'completed') {
            // Money already deducted on request.
            // ADDED: Track permanent total payouts to make it deletion-safe.
            const currentTotalPaidOut = userDoc.data().totalPaidOut || 0;
            
            // Update monthly stats withdrawals
            const now = new Date();
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const stats = userDoc.data().monthlyStats || { monthKey, gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0 };
            
            // Note: Withdrawals are already added to stats when REQUESTED by provider.
            // If we are completing an OLD request from a previous month, 
            // we don't want to double-count or mess up current month stats.
            // So we only update totalPaidOut here.

            userUpdatePayload = { 
              withdrawalPending: false,
              totalPaidOut: currentTotalPaidOut + request.amount 
            }; 
            notificationMessage = `Your withdrawal of ₹${request.amount.toFixed(2)} has been successfully completed.`;
            notificationType = 'success';
        }
        
        transaction.update(requestDocRef, updatePayload);
        if (Object.keys(userUpdatePayload).length > 0) {
            transaction.update(userDocRef, userUpdatePayload);
        }
        
        const notification: Omit<FirestoreNotification, 'id'> = {
            userId: request.providerId,
            title: `Withdrawal Request ${newStatus.replace(/_/g, ' ')}`,
            message: notificationMessage,
            type: notificationType,
            href: '/provider/withdrawal',
            read: false,
            createdAt: Timestamp.now(),
        };
        transaction.set(doc(collection(db, "userNotifications")), notification);
      });
      
      // Trigger actual Push Notification for the provider
      triggerPushNotification({
        userId: request.providerId,
        title: `Withdrawal Request ${newStatus.replace(/_/g, ' ')}`,
        body: `Your withdrawal of ₹${request.amount.toFixed(2)} has been ${newStatus.replace(/_/g, ' ')}.`,
        href: '/provider/withdrawal'
      });

      toast({ title: "Success", description: `Request status updated to ${newStatus}.` });
      if (newStatus === 'rejected' || newStatus === 're_submit') {
        setShowRejectionDialog(false);
        setRequestToActOn(null);
      }

    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update request.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteRequest = async (request: WithdrawalRequest) => {
    if (!request.id) return;
    setIsUpdating(request.id);
    try {
        await runTransaction(db, async (transaction) => {
            const requestDocRef = doc(db, "withdrawalRequests", request.id!);
            const userDocRef = doc(db, "users", request.providerId);
            
            const reqSnap = await transaction.get(requestDocRef);
            if (!reqSnap.exists()) return;

            // Logic: If the request was 'pending', 'approved', or 'processing', 
            // the money was deducted but NOT yet finalized. Deleting it should REFUND the provider.
            // If it was 'completed', the money is GONE. Deleting the record should NOT refund.
            const status = reqSnap.data().status;
            if (['pending', 'approved', 'processing'].includes(status)) {
                const userSnap = await transaction.get(userDocRef);
                if (userSnap.exists()) {
                    const currentBalance = userSnap.data().withdrawableBalance || 0;
                    transaction.update(userDocRef, { 
                        withdrawableBalance: currentBalance + request.amount,
                        withdrawalPending: false 
                    });
                }
            }

            transaction.delete(requestDocRef);
        });
        toast({title: "Success", description: "Withdrawal request deleted and balance adjusted if necessary."});
    } catch (error) {
        console.error("Delete error:", error);
        toast({title: "Error", description: "Could not delete request.", variant: "destructive"});
    } finally {
        setIsUpdating(null);
    }
  };

  if (isLoading) {
    return <Card><CardContent className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Withdrawal Management</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage payout requests and track provider earnings.</p>
        </div>
      </div>

      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mb-6 h-12 p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="requests" className="rounded-lg font-bold">
            <Banknote className="mr-2 h-4 w-4"/> Payout Requests
          </TabsTrigger>
          <TabsTrigger value="balances" onClick={loadProviders} className="rounded-lg font-bold">
            <Users className="mr-2 h-4 w-4"/> Provider Balances
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal Requests</CardTitle>
              <CardDescription>Process pending payout requests from service providers.</CardDescription>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <div className="text-center py-10">
                  <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No withdrawal requests received yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Details</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {requests.map(req => {
                       const providerProfile = providers.find(p => p.uid === req.providerId);
                       const currentBalance = providerProfile?.withdrawableBalance ?? null;

                       return (
                       <TableRow key={req.id}>
                          <TableCell>
                            <div className="font-medium">{req.providerName}</div>
                            <div className="text-xs text-muted-foreground">{req.providerEmail}</div>
                            {currentBalance !== null && (
                                <div className={cn("text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded w-fit", currentBalance < 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                                    Current Wallet: ₹{currentBalance.toFixed(2)}
                                </div>
                            )}
                          </TableCell>
                          <TableCell className="font-bold">₹{req.amount.toFixed(2)}</TableCell>
                          <TableCell className="capitalize">{req.method.replace('_', ' ')}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => handleViewDetails(req)}>
                              <Eye className="mr-1 h-4 w-4" /> View
                            </Button>
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(req.requestedAt)}</TableCell>
                          <TableCell><Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>{req.status.replace(/_/g, ' ')}</Badge></TableCell>
                          <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                  {req.status === 'pending' && (
                                      <>
                                          <PermissionGuard moduleId="provider_withdrawals" action="write">
                                              <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'approved')} disabled={isUpdating === req.id}>
                                                  <Check className="h-4 w-4" />
                                              </Button>
                                          </PermissionGuard>
                                          <PermissionGuard moduleId="provider_withdrawals" action="write">
                                              <Button variant="outline" size="sm" className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50" onClick={() => openRejectionDialog(req, 're_submit')} disabled={isUpdating === req.id}>
                                                  <AlertTriangle className="h-4 w-4" />
                                              </Button>
                                          </PermissionGuard>
                                          <PermissionGuard moduleId="provider_withdrawals" action="write">
                                              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => openRejectionDialog(req, 'rejected')} disabled={isUpdating === req.id}>
                                                  <X className="h-4 w-4" />
                                              </Button>
                                          </PermissionGuard>
                                      </>
                                  )}
                                  {req.status === 'approved' && (
                                      <PermissionGuard moduleId="provider_withdrawals" action="write">
                                          <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req, 'processing')} disabled={isUpdating === req.id}>
                                              Process
                                          </Button>
                                      </PermissionGuard>
                                  )}
                                  {req.status === 'processing' && (
                                      <PermissionGuard moduleId="provider_withdrawals" action="write">
                                          <Button variant="outline" size="sm" className="text-green-600" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                              Complete
                                          </Button>
                                      </PermissionGuard>
                                  )}

                                  <PermissionGuard moduleId="provider_withdrawals" action="delete">
                                      <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={isUpdating === req.id}>
                                                  <Trash2 className="h-4 w-4" />
                                              </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                              <AlertDialogHeader>
                                                  <AlertDialogTitle>Delete Request?</AlertDialogTitle>
                                                  <AlertDialogDescriptionComponent>Permanently remove this request record. This action will adjust the provider's balance if the request was not yet completed.</AlertDialogDescriptionComponent>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction onClick={() => handleDeleteRequest(req)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                              </AlertDialogFooter>
                                          </AlertDialogContent>
                                      </AlertDialog>
                                  </PermissionGuard>
                              </div>
                          </TableCell>
                       </TableRow>
                    ); })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                    <CardTitle>Provider Earnings Overview</CardTitle>
                    <CardDescription>Current withdrawable balances and lifetime payouts for all providers.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadProviders} disabled={isLoadingProviders}>
                    {isLoadingProviders ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <RefreshCw className="h-4 w-4 mr-2"/>} Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingProviders ? (
                <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : providers.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">No providers found.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Month Gross</TableHead><TableHead>Month Net</TableHead><TableHead>Wallet Balance</TableHead><TableHead>Lifetime Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {providers.map(p => {
                       const now = new Date();
                       const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                       const stats = p.monthlyStats?.monthKey === monthKey ? p.monthlyStats : { gross: 0, commission: 0 };
                       const monthNet = stats.gross - stats.commission;

                       return (
                       <TableRow key={p.uid}>
                          <TableCell><div className="font-medium">{p.displayName}</div><div className="text-xs text-muted-foreground">{p.email}</div></TableCell>
                          <TableCell className="text-xs font-semibold">₹{stats.gross.toFixed(2)}</TableCell>
                          <TableCell className="text-xs font-bold text-green-600">₹{monthNet.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className={cn("text-lg font-bold", (p.withdrawableBalance || 0) < 0 ? "text-destructive" : "text-blue-600")}>
                                ₹{(p.withdrawableBalance || 0).toFixed(2)}
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold text-muted-foreground">₹{(p.totalPaidOut || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            {(p.withdrawableBalance || 0) < 0 ? (
                                <Badge variant="destructive">Settlement Due</Badge>
                            ) : (p.withdrawableBalance || 0) > 0 ? (
                                <Badge variant="default" className="bg-green-500">Owed</Badge>
                            ) : (
                                <Badge variant="outline">Cleared</Badge>
                            )}
                          </TableCell>
                       </TableRow>
                    ); })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <AlertDialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionType === 'rejected' ? 'Reject' : 'Request Re-submission'}</AlertDialogTitle>
            <AlertDialogDescriptionComponent>Please provide a reason. This will be sent to the provider and the amount will be refunded to their wallet.</AlertDialogDescriptionComponent>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="rejection-reason">Reason for {actionType === 'rejected' ? 'Rejection' : 'Re-submission'}</Label>
            <Textarea id="rejection-reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g., Bank details incorrect. Please verify and submit again."/>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(requestToActOn) handleUpdateStatus(requestToActOn, actionType!, rejectionReason)}} disabled={!rejectionReason.trim()} className="bg-destructive hover:bg-destructive/90">Confirm Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Withdrawal Request Details</DialogTitle>
                <DialogDescriptionComponent>
                    Request from: <span className="font-semibold">{selectedRequestForDetails?.providerName}</span>
                </DialogDescriptionComponent>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <DetailItem label="Amount" value={`₹${selectedRequestForDetails?.amount.toFixed(2)}`} />
                <DetailItem label="Method" value={selectedRequestForDetails?.method.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} />
                <Separator />
                <h4 className="font-semibold text-sm">Account Details</h4>
                {selectedRequestForDetails?.method === 'bank_transfer' ? (
                    <>
                        <DetailItem label="Account Holder" value={selectedRequestForDetails.details.accountHolderName} />
                        <DetailItem label="Bank Name" value={selectedRequestForDetails.details.bankName} />
                        <DetailItem label="Account Number" value={selectedRequestForDetails.details.accountNumber} />
                        <DetailItem label="IFSC Code" value={selectedRequestForDetails.details.ifscCode} />
                    </>
                ) : selectedRequestForDetails?.method === 'upi' ? (
                    <DetailItem label="UPI ID" value={selectedRequestForDetails.details.upiId} />
                ) : (
                    <DetailItem label="Email" value={selectedRequestForDetails?.details.email} />
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="secondary">Close</Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}