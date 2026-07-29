
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, DollarSign, PackageSearch, HandCoins, Banknote, AlertTriangle, RefreshCw } from "lucide-react";
import type { FirestoreBooking, ProviderFeeType, FirestoreUser, WithdrawalRequest } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs, Timestamp } from '@/lib/mysqlDb';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { runTransaction, updateDoc } from '@/lib/mysqlDb';

const calculateProviderFee = (bookingAmount: number, feeType?: ProviderFeeType, feeValue?: number): number => {
    if (!feeType || !feeValue || feeValue <= 0) return 0;
    if (feeType === 'fixed') return feeValue;
    if (feeType === 'percentage') return (bookingAmount * feeValue) / 100;
    return 0;
};

const isCashPayment = (method: string) => method === 'Pay After Service' || method === 'Cash on Delivery';

export default function ProviderEarningsPage() {
  const { user: providerUser, firestoreUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  // EARNINGS DATA: Now read 100% from the User document (monthlyStats)
  // This achieves "One Read" per page visit.
  const earningsData = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Default to zero if stats don't exist yet
    const stats = (firestoreUser?.monthlyStats?.monthKey === monthKey) 
        ? firestoreUser.monthlyStats 
        : { gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0 };

    const currentBalance = firestoreUser?.withdrawableBalance || 0;
    
    // Carry Forward = Current Balance - (This month's net activity)
    // Net Activity = (Online Net) - (Cash Commission) - (Withdrawals)
    const netActivityThisMonth = stats.onlineNet - stats.cashCommission - stats.withdrawals;
    const balanceCarriedForward = currentBalance - netActivityThisMonth;

    return {
        monthlyGrossEarnings: stats.gross,
        monthlyAdminCommission: stats.commission,
        monthlyNetEarnings: stats.gross - stats.commission,
        monthlyCashCollected: stats.cashCollected,
        monthlyWithdrawals: stats.withdrawals,
        monthlyCashCommission: stats.cashCommission,
        monthlyOnlineNet: stats.onlineNet,
        balanceCarriedForward,
        lifetimePaidOut: firestoreUser?.totalPaidOut || 0,
        withdrawableBalance: currentBalance,
        monthName: now.toLocaleString('default', { month: 'long', year: 'numeric' })
    };
  }, [firestoreUser]);

  const handleSyncBalance = async () => {
    if (!providerUser?.uid) return;
    
    setIsSyncing(true);
    try {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

        const bookingsQuery = query(collection(db, "bookings"), where("providerId", "==", providerUser.uid), where("status", "==", "Completed"));
        const withdrawalsQuery = query(collection(db, "withdrawalRequests"), where("providerId", "==", providerUser.uid));
        
        const [bookingsSnap, withdrawalsSnap] = await Promise.all([getDocs(bookingsQuery), getDocs(withdrawalsQuery)]);
        
        let totalNetEarnings = 0;
        let totalCashCollected = 0;
        const totalLifetimePaidOut = 0;

        // Stats for THIS month specifically
        const mStats = { monthKey, gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0 };
        
        bookingsSnap.docs.forEach(d => {
            const b = d.data() as FirestoreBooking;
            const commission = calculateProviderFee(b.totalAmount, appConfig.providerFeeType, appConfig.providerFeeValue);
            const isCash = isCashPayment(b.paymentMethod);
            const bDate = b.scheduledDate || "";

            // All-time calculation
            totalNetEarnings += (b.totalAmount - commission);
            if (isCash) totalCashCollected += b.totalAmount;

            // Monthly calculation (if date is this month)
            if (bDate >= startOfMonthStr) {
                mStats.gross += b.totalAmount;
                mStats.commission += commission;
                if (isCash) {
                    mStats.cashCollected += b.totalAmount;
                    mStats.cashCommission += commission;
                } else {
                    mStats.onlineNet += (b.totalAmount - commission);
                }
            }
        });

        const withdrawalHistory = withdrawalsSnap.docs.map(d => d.data() as WithdrawalRequest);
        
        const visibleCompletedPayouts = withdrawalHistory
            .filter(req => req.status === 'completed')
            .reduce((sum, req) => sum + req.amount, 0);

        // SMART SYNC: 
        // We compare what's in the profile vs what's visible in history.
        // If profile is higher (because records were deleted), we keep the profile value.
        const storedTotalPaidOut = firestoreUser?.totalPaidOut || 0;
        const finalTotalPaidOut = Math.max(storedTotalPaidOut, visibleCompletedPayouts);

        const currentPendingAmount = withdrawalHistory
            .filter(req => ['processing', 'approved', 'pending'].includes(req.status))
            .reduce((sum, req) => sum + req.amount, 0);

        const realBalance = totalNetEarnings - totalCashCollected - finalTotalPaidOut - currentPendingAmount;

        const userRef = doc(db, "users", providerUser.uid);
        await updateDoc(userRef, { 
            withdrawableBalance: Math.max(0, realBalance),
            totalPaidOut: finalTotalPaidOut,
            monthlyStats: mStats
        });
        
        toast({ title: "Success", description: "Earnings and balance updated." });
    } catch (error) {
        console.error("Sync error:", error);
        toast({ title: "Update Failed", variant: "destructive" });
    } finally {
        setIsSyncing(false);
    }
  };

  if (authIsLoading || isLoadingAppConfig || !firestoreUser) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl flex items-center"><DollarSign className="mr-2 h-6 w-6 text-primary"/>My Earnings</CardTitle>
              <CardDescription>Performance summary for {earningsData.monthName}.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                 <Button variant="ghost" size="sm" className="h-8 text-[10px] text-muted-foreground" onClick={handleSyncBalance} disabled={isSyncing}>
                    {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <RefreshCw className="h-3 w-3 mr-1"/>} Sync Balance
                </Button>
                <Badge variant="outline" className="px-3 py-1 bg-primary/5 text-primary border-primary/20 font-bold uppercase tracking-tighter">
                {earningsData.monthName}
                </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Month Gross</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.monthlyGrossEarnings.toFixed(2)}</p></CardContent>
          </Card>
          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Month Admin Fee</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{earningsData.monthlyAdminCommission.toFixed(2)}</p></CardContent>
          </Card>
          <Card className="bg-green-500/5 border-green-500/20">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Month Net Earnings</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-green-600">₹{earningsData.monthlyNetEarnings.toFixed(2)}</p></CardContent>
          </Card>
          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Wallet Balance</CardTitle></CardHeader>
            <CardContent>
                <p className="text-2xl font-bold text-blue-600">₹{earningsData.withdrawableBalance.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Available to Withdraw</p>
            </CardContent>
             <CardFooter className="pt-0"><Link href="/provider/withdrawal" className="w-full"><Button size="sm" variant="outline" className="w-full h-8 text-xs">Withdraw</Button></Link></CardFooter>
          </Card>
        </CardContent>

        <CardContent className="pt-6">
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <HandCoins className="h-4 w-4" /> Monthly Wallet Breakdown
                </h3>
                
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center py-1 border-b border-dashed">
                        <span>Balance Carried Forward <span className="text-[10px] text-muted-foreground ml-1">(Previous months)</span></span>
                        <span className="font-semibold text-blue-600">₹{earningsData.balanceCarriedForward.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-dashed text-green-600">
                        <span>Online Jobs Earnings <span className="text-[10px] text-muted-foreground ml-1">(Your share after fee)</span></span>
                        <span className="font-semibold">+ ₹{earningsData.monthlyOnlineNet.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-dashed text-destructive">
                        <span>Admin Fees for Cash Jobs <span className="text-[10px] text-muted-foreground ml-1">(Deducted from wallet)</span></span>
                        <span className="font-semibold">- ₹{earningsData.monthlyCashCommission.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-dashed text-destructive">
                        <span>Payouts requested this month</span>
                        <span className="font-semibold">- ₹{earningsData.monthlyWithdrawals.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center pt-2 font-bold text-base">
                        <span>Total Available in Wallet</span>
                        <span className="text-blue-600">₹{earningsData.withdrawableBalance.toFixed(2)}</span>
                    </div>
                </div>

                <div className="bg-primary/5 rounded-lg p-3 border border-primary/20 space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold text-primary uppercase">
                        <span>Lifetime Total Paid Out</span>
                        <span>₹{earningsData.lifetimePaidOut.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                        * This is your permanent record of all money successfully sent to your bank/UPI.
                    </p>
                </div>

                <div className="mt-4 pt-4 border-t border-muted-foreground/20 bg-primary/5 -mx-4 px-4 rounded-b-xl">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground uppercase font-bold">Total Cash Collected by You:</span>
                        <span className="font-black text-primary text-sm">₹{earningsData.monthlyCashCollected.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                        * Note: This cash is already with you. Only the Admin Fee was deducted from your wallet balance.
                    </p>
                </div>
            </div>
        </CardContent>

         <CardFooter className="flex-col items-stretch gap-4 border-t pt-6">
            {earningsData.withdrawableBalance < 0 ? (
                <Alert variant="destructive" className="rounded-xl border-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="font-bold">Settlement Due to Admin</AlertTitle>
                    <AlertDescription>
                        Your wallet balance is negative. Please settle your dues with the admin.
                    </AlertDescription>
                </Alert>
            ) : (
                 <Alert className="bg-green-50 border-green-200 rounded-xl">
                    <HandCoins className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 font-bold">Wallet Status</AlertTitle>
                    <AlertDescription className="text-green-700">
                        You have <span className="font-bold text-lg">₹{earningsData.withdrawableBalance.toFixed(2)}</span> ready to withdraw.
                    </AlertDescription>
                </Alert>
            )}
        </CardFooter>
      </Card>
    </div>
  );
}
