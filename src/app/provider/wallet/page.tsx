"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Wallet, ArrowUpRight, ArrowDownLeft, Plus, CheckCircle2, History, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  getProviderWalletDetailsAction, 
  getProviderWalletSettingsAction,
  depositProviderWalletAction,
  submitWalletComplaintAction,
  WalletTransaction,
  WalletProviderSettings
} from '@/app/actions/providerWalletActions';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function ProviderWalletPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const { toast } = useToast();
  const symbol = appConfig?.currencySymbol || "₹";

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [walletSettings, setWalletSettings] = useState<WalletProviderSettings | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState('');
  const [isProcessingDeposit, setIsProcessingDeposit] = useState(false);

  // Dispute / Complaint State
  const [selectedTxForComplaint, setSelectedTxForComplaint] = useState<WalletTransaction | null>(null);
  const [complaintMessage, setComplaintMessage] = useState('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);

  const loadWalletDetails = useCallback(async () => {
    if (!providerUser?.uid) return;
    setIsLoadingDetails(true);
    try {
      const details = await getProviderWalletDetailsAction(providerUser.uid);
      setWalletBalance(details.balance);
      setTransactions(details.transactions);

      const settings = await getProviderWalletSettingsAction();
      setWalletSettings(settings);
    } catch (error) {
      console.error("Error loading wallet details:", error);
      toast({ title: "Error", description: "Failed to load wallet data.", variant: "destructive" });
    } finally {
      setIsLoadingDetails(false);
    }
  }, [providerUser?.uid, toast]);

  useEffect(() => {
    if (providerUser?.uid) {
      loadWalletDetails();
    }
  }, [providerUser?.uid, loadWalletDetails]);

  const loadRazorpayScript = () => new Promise((resolve) => { 
    if (window.Razorpay) { resolve(true); return; } 
    const script = document.createElement('script'); 
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'; 
    script.onload = () => resolve(true); 
    script.onerror = () => resolve(false); 
    document.body.appendChild(script); 
  });

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerUser?.uid || !walletSettings) return;

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid deposit amount.", variant: "destructive" });
      return;
    }

    if (amount < walletSettings.minDepositAmount) {
      toast({ title: "Amount Below Minimum", description: `Minimum deposit allowed is ${symbol}${walletSettings.minDepositAmount}.`, variant: "destructive" });
      return;
    }

    if (amount > walletSettings.maxDepositAmount) {
      toast({ title: "Amount Exceeds Maximum", description: `Maximum deposit allowed is ${symbol}${walletSettings.maxDepositAmount}.`, variant: "destructive" });
      return;
    }

    setIsProcessingDeposit(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast({ title: "Error", description: "Failed to load payment gateway checkout.", variant: "destructive" });
        setIsProcessingDeposit(false);
        return;
      }

      // 1. Create Razorpay order on server
      const amountInPaise = Math.round(amount * 100);
      const res = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountInPaise, currency: appConfig?.currencyCode || 'INR' }),
      });

      const orderData = await res.json();
      if (!res.ok || !orderData.success) {
        throw new Error(orderData.error || 'Failed to initialize payment order.');
      }

      // 2. Open Razorpay checkout
      const options = {
        key: appConfig.razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "FixBro",
        description: "Provider Prepaid Wallet Top-up",
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            // Verify payment on the server
            const verifyRes = await fetch('/api/razorpay/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              // Commit deposit credit action
              const depositResult = await depositProviderWalletAction(
                providerUser.uid,
                amount,
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                }
              );

              if (depositResult.success) {
                toast({ title: "Deposit Successful", description: depositResult.message });
                setDepositAmount('');
                loadWalletDetails();
              } else {
                toast({ title: "Credit Error", description: depositResult.message, variant: "destructive" });
              }
            } else {
              toast({ title: "Payment Verification Failed", description: verifyData.error || "Payment signature invalid.", variant: "destructive" });
            }
          } catch (verifyError: any) {
            toast({ title: "Verification Error", description: verifyError.message || "Failed to verify transaction.", variant: "destructive" });
          } finally {
            setIsProcessingDeposit(false);
          }
        },
        prefill: {
          name: providerUser.displayName || '',
          email: providerUser.email || '',
        },
        theme: {
          color: "#0d9488", // primary teal theme
        },
        modal: {
          ondismiss: function () {
            setIsProcessingDeposit(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (err: any) {
      console.error("Razorpay workflow failed:", err);
      toast({ title: "Checkout Error", description: err.message || "Could not launch Razorpay gateway.", variant: "destructive" });
      setIsProcessingDeposit(false);
    }
  };

  const handleQuickAdd = (value: number) => {
    setDepositAmount(String(value));
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionBadge = (type: WalletTransaction['type']) => {
    const configs: Record<WalletTransaction['type'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      deposit: { label: 'Deposit', variant: 'default' },
      commission_deduction: { label: 'Fee Deducted', variant: 'destructive' },
      commission_refund: { label: 'Fee Refund', variant: 'outline' },
      manual_adjustment: { label: 'Adjustment', variant: 'secondary' },
    };
    const c = configs[type] || { label: type, variant: 'outline' };
    return <Badge variant={c.variant} className="capitalize">{c.label}</Badge>;
  };

  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerUser?.uid || !selectedTxForComplaint) return;

    if (!complaintMessage.trim()) {
      toast({ title: "Message Required", description: "Please enter a message for the admin.", variant: "destructive" });
      return;
    }

    setIsSubmittingComplaint(true);
    try {
      const result = await submitWalletComplaintAction(
        providerUser.uid,
        selectedTxForComplaint.bookingId!,
        complaintMessage.trim(),
        Math.abs(selectedTxForComplaint.amount)
      );

      if (result.success) {
        toast({ title: "Dispute Filed", description: result.message });
        setComplaintMessage('');
        setSelectedTxForComplaint(null);
      } else {
        toast({ title: "Submission Failed", description: result.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to submit dispute.", variant: "destructive" });
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  if (authIsLoading || isLoadingAppConfig || isLoadingDetails) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading Wallet details...</span>
      </div>
    );
  }

  const isLowBalance = walletSettings ? (walletBalance < walletSettings.minBalanceForJobs) : false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Provider Wallet
          </CardTitle>
          <CardDescription>
            Manage your prepaid funds for booking service commission fees.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Wallet Balance Card & Deposit Form */}
        <div className="md:col-span-1 space-y-6">
          <Card className={cn(
            "text-white shadow-lg overflow-hidden relative",
            isLowBalance 
              ? "bg-gradient-to-br from-rose-500 to-red-600" 
              : "bg-gradient-to-br from-teal-500 to-emerald-600"
          )}>
            <CardHeader className="pb-2">
              <CardDescription className="text-white/80 font-bold uppercase tracking-wider text-[10px]">Prepaid Balance</CardDescription>
              <CardTitle className="text-4xl font-extrabold font-mono pt-1">
                {symbol}{walletBalance.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 pb-6">
              {isLowBalance ? (
                <div className="flex items-start gap-2 bg-black/15 p-3 rounded-xl border border-white/10 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Balance Low!</span>
                    Wallet is below the {symbol}{walletSettings?.minBalanceForJobs} threshold. Deposit funds to continue receiving cash jobs.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-black/15 px-3 py-2 rounded-xl text-xs font-semibold w-fit border border-white/10">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Account Active & Booking Ready
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Money to Wallet</CardTitle>
              <CardDescription>
                Top up your wallet to ensure you have enough balance to receive new service requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {walletSettings && (
                <form onSubmit={handleDepositSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-600">Enter Amount (₹)</span>
                      <span className="text-muted-foreground font-mono">Min: {walletSettings.minDepositAmount} | Max: {walletSettings.maxDepositAmount}</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-muted-foreground font-mono">₹</span>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        className="pl-8"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        disabled={isProcessingDeposit}
                        required
                      />
                    </div>
                    {walletSettings.depositBonusPercentage > 0 && (
                      <p className="text-[11px] text-emerald-600 font-bold">
                        🎁 Special Offer: Get a {walletSettings.depositBonusPercentage}% bonus credited automatically!
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[500, 1000, 2000, 5000].map(val => (
                      <Button
                        key={val}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAdd(val)}
                        disabled={isProcessingDeposit}
                        className="text-xs h-8"
                      >
                        +{symbol}{val}
                      </Button>
                    ))}
                  </div>

                  <Button
                    type="submit"
                    className="w-full mt-2 h-11"
                    disabled={isProcessingDeposit}
                  >
                    {isProcessingDeposit ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    Add Money via Razorpay
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Transaction History */}
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader className="border-b pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Wallet History & Transactions
                </CardTitle>
                <CardDescription>
                  Chronological ledger of wallet deposits, commissions, and adjustments.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <Wallet className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p>No wallet transactions found.</p>
                  <p className="text-xs">Once you top up or accept bookings, they will reflect here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="pl-6">Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right pr-6">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map(tx => {
                        const isCredit = tx.amount >= 0;
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="pl-6 text-xs font-mono whitespace-nowrap">
                              {formatDate(tx.timestamp)}
                            </TableCell>
                            <TableCell>{getTransactionBadge(tx.type)}</TableCell>
                            <TableCell className="max-w-xs truncate text-xs font-medium" title={tx.description}>
                              {tx.description}
                              {tx.bookingId && (
                                <span className="block text-[10px] text-muted-foreground font-mono">
                                  Ref: #{tx.bookingId}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className={cn(
                              "text-right font-bold whitespace-nowrap font-mono",
                              isCredit ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {isCredit ? '+' : ''}{symbol}{tx.amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              {tx.type === 'commission_deduction' && tx.bookingId && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-bold border border-amber-200/50 rounded-lg px-2"
                                  onClick={() => { setSelectedTxForComplaint(tx); setComplaintMessage(''); }}
                                >
                                  Dispute Fee
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Wallet Dispute Complaint Modal */}
      {selectedTxForComplaint && (
        <Dialog open={!!selectedTxForComplaint} onOpenChange={(open) => !open && setSelectedTxForComplaint(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Dispute Commission Fee
              </DialogTitle>
              <DialogDescription>
                File a dispute to request a manual refund from the admin for this commission charge.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleComplaintSubmit} className="space-y-4 py-2">
              <div className="space-y-1 text-xs">
                <p><strong>Booking ID:</strong> #{selectedTxForComplaint.bookingId}</p>
                <p><strong>Deducted Fee:</strong> {symbol}{Math.abs(selectedTxForComplaint.amount).toFixed(2)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="complaint-msg">Why should this fee be refunded?</Label>
                <Textarea
                  id="complaint-msg"
                  placeholder="Explain what happened (e.g., customer cancelled on-site, cash was not collected)..."
                  value={complaintMessage}
                  onChange={(e) => setComplaintMessage(e.target.value)}
                  disabled={isSubmittingComplaint}
                  rows={4}
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedTxForComplaint(null)} disabled={isSubmittingComplaint}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingComplaint}>
                  {isSubmittingComplaint && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Dispute
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
