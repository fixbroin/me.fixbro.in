"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquareWarning, Check, X, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { 
  getPendingWalletComplaintsAction, 
  resolveWalletComplaintAction, 
  WalletComplaint 
} from "@/app/actions/providerWalletActions";
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

export default function WalletComplaintsTab() {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";

  const [complaints, setComplaints] = useState<WalletComplaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Resolution Dialog State
  const [selectedComplaint, setSelectedComplaint] = useState<WalletComplaint | null>(null);
  const [resolveType, setResolveType] = useState<'approve' | 'reject'>('approve');
  const [notes, setNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const loadComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPendingWalletComplaintsAction();
      setComplaints(data);
    } catch (error) {
      console.error("Error loading complaints:", error);
      toast({ title: "Error", description: "Failed to load wallet disputes.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  const openResolution = (complaint: WalletComplaint, type: 'approve' | 'reject') => {
    setSelectedComplaint(complaint);
    setResolveType(type);
    setNotes(type === 'approve' 
      ? `Refund of ${symbol}${complaint.amount} approved for booking #${complaint.bookingHumanId}.` 
      : `Dispute closed. Commission charge stands for booking #${complaint.bookingHumanId}.`
    );
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;

    if (!notes.trim()) {
      toast({ title: "Notes Required", description: "Please explain the resolution details.", variant: "destructive" });
      return;
    }

    setIsResolving(true);
    try {
      const isApprove = resolveType === 'approve';
      const result = await resolveWalletComplaintAction(
        selectedComplaint.id,
        isApprove,
        selectedComplaint.amount,
        notes.trim()
      );

      if (result.success) {
        toast({ title: "Dispute Resolved", description: result.message });
        setSelectedComplaint(null);
        loadComplaints();
      } else {
        toast({ title: "Resolution Failed", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit resolution.", variant: "destructive" });
    } finally {
      setIsResolving(false);
    }
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Provider Disputes & Wallet Complaints</CardTitle>
          <CardDescription>Loading dispute messages...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-amber-500" />
            Provider Wallet Disputes
          </CardTitle>
          <CardDescription>
            Review and manually resolve commission fee refund disputes filed by service providers for cancelled or rejected bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {complaints.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquareWarning className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
              <p>No wallet disputes filed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Filed Date</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Dispute Message</TableHead>
                    <TableHead>Fee Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complaints.map(comp => (
                    <TableRow key={comp.id}>
                      <TableCell className="pl-6 text-xs font-mono whitespace-nowrap">
                        {formatDate(comp.createdAt)}
                      </TableCell>
                      <TableCell className="font-bold text-sm">
                        {comp.providerName}
                        <span className="block text-[10px] text-muted-foreground font-mono">ID: {comp.providerId.substring(0, 8)}...</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-primary font-bold">
                        #{comp.bookingHumanId}
                      </TableCell>
                      <TableCell className="max-w-xs text-xs font-medium text-slate-700 whitespace-pre-wrap">
                        {comp.message}
                      </TableCell>
                      <TableCell className="font-bold font-mono text-rose-600">
                        {symbol}{comp.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={comp.status === 'resolved' ? 'outline' : 'default'} className={comp.status === 'resolved' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'bg-amber-500'}>
                          {comp.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {comp.status === 'pending' ? (
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 border-green-200 text-green-700 bg-green-50 hover:bg-green-100 flex items-center gap-1 font-bold text-xs"
                              onClick={() => openResolution(comp, 'approve')}
                            >
                              <Check className="h-3.5 w-3.5" /> Approve Refund
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 flex items-center gap-1 font-bold text-xs"
                              onClick={() => openResolution(comp, 'reject')}
                            >
                              <X className="h-3.5 w-3.5" /> Close Dispute
                            </Button>
                          </div>
                        ) : (
                          <div className="text-left text-[11px] text-muted-foreground border-l-2 pl-2">
                            <span className="font-bold block text-slate-600">Resolved:</span>
                            {comp.resolutionNotes}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolution Confirmation Modal */}
      {selectedComplaint && (
        <Dialog open={!!selectedComplaint} onOpenChange={(open) => !open && setSelectedComplaint(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className={resolveType === 'approve' ? "text-emerald-500 h-5 w-5" : "text-rose-500 h-5 w-5"} />
                {resolveType === 'approve' ? 'Approve & Refund' : 'Reject Wallet Dispute'}
              </DialogTitle>
              <DialogDescription>
                Confirm resolution for provider <strong>{selectedComplaint.providerName}</strong> dispute on booking <strong>#{selectedComplaint.bookingHumanId}</strong>.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleResolveSubmit} className="space-y-4 py-2">
              {resolveType === 'approve' && (
                <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-xl border border-emerald-200 font-medium">
                  Saving this resolution will credit <strong>{symbol}{selectedComplaint.amount.toFixed(2)}</strong> back to the provider's wallet balance.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="resolution-notes">Resolution Notes / Explanation</Label>
                <Textarea
                  id="resolution-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isResolving}
                  rows={3}
                  required
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setSelectedComplaint(null)} disabled={isResolving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isResolving} variant={resolveType === 'approve' ? 'default' : 'destructive'}>
                  {isResolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Resolution
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
