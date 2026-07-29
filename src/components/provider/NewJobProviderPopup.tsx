
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { Briefcase, ListOrdered } from "lucide-react";

interface NewJobProviderPopupProps {
  isOpen: boolean;
  bookingDocId: string;
  bookingHumanId: string;
  onClose: (markNotificationAsRead?: boolean) => void;
}

export default function NewJobProviderPopup({
  isOpen,
  bookingDocId,
  bookingHumanId,
  onClose,
}: NewJobProviderPopupProps) {
  const router = useRouter();
  const { showLoading } = useLoading();

  const handleViewJob = () => {
    showLoading();
    // Path for provider booking details
    router.push(`/provider/booking/${bookingDocId}`);
    onClose(true); // Mark as read and close
  };

  const handleClosePopup = () => {
    onClose(false); // Just close, don't mark as read yet
  };

  if (!isOpen) {
    return null;
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(false); }}>
      <AlertDialogContent 
        className="max-w-md"
      >
        <AlertDialogHeader>
          <div className="flex items-center justify-center mb-3">
            <Briefcase className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <AlertDialogTitle className="text-center text-xl font-headline">
            New Job Assigned!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-base text-muted-foreground pt-1">
            Booking ID: <span className="font-semibold text-foreground">{bookingHumanId}</span>
            <br />
            A new job has been assigned to you. Please check the details.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={handleClosePopup} className="w-full sm:w-auto">Close</AlertDialogCancel>
          <AlertDialogAction onClick={handleViewJob} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
             <ListOrdered className="mr-2 h-4 w-4" /> View Job Details
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
