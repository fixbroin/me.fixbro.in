
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, PlayCircle, ExternalLink, Tag, Clock } from "lucide-react";
import type { FirestoreBooking } from '@/types/firestore';
import { Badge } from '@/components/ui/badge';
import { useLoading } from '@/contexts/LoadingContext';
import AppImage from '@/components/ui/AppImage';

interface ProviderJobCardProps {
  job: FirestoreBooking;
  type: 'new' | 'ongoing' | 'completed';
  onAccept?: (bookingId: string) => void;
  onReject?: (bookingId: string) => void;
  onStartWork?: (bookingId: string) => void;
  onCompleteWork?: (bookingId: string) => void;
  isProcessingAction?: boolean;
}

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return dateString; }
};

const getStatusBadgeVariant = (status: FirestoreBooking['status']) => {
    switch (status) {
      case 'Completed': return 'default';
      case 'Confirmed':
      case 'ProviderAccepted':
      case 'InProgressByProvider':
      case 'AssignedToProvider':
        return 'default'; 
      case 'Pending Payment':
      case 'Rescheduled':
      case 'Processing':
        return 'secondary';
      case 'Cancelled':
      case 'ProviderRejected':
        return 'destructive';
      default: return 'outline';
    }
};

const getStatusBadgeClass = (status: FirestoreBooking['status']) => {
    switch (status) {
        case 'Completed': return 'bg-green-500 hover:bg-green-600';
        case 'Confirmed':
        case 'ProviderAccepted':
        case 'AssignedToProvider':
        case 'InProgressByProvider':
            return 'bg-blue-500 hover:bg-blue-600';
        case 'Pending Payment':
        case 'Rescheduled':
            return 'bg-orange-500 hover:bg-orange-600';
        case 'Processing':
            return 'bg-purple-500 hover:bg-purple-600';
        case 'Cancelled':
        case 'ProviderRejected':
            return 'bg-red-600 hover:bg-red-700';
        default: return '';
    }
};

const ProviderJobCard: React.FC<ProviderJobCardProps> = ({
  job,
  type,
  onAccept,
  onReject,
  onStartWork,
  onCompleteWork,
  isProcessingAction
}) => {
  const { showLoading } = useLoading();
  const isJobCompleted = job.status === 'Completed';

  const handleViewDetailsClick = () => {
    showLoading();
  };
  
  const handleWhatsAppClick = (e: React.MouseEvent, mobileNumber: string) => {
    e.stopPropagation();
    const sanitizedPhone = mobileNumber.replace(/\D/g, '');
    const internationalPhone = sanitizedPhone.startsWith('91') ? sanitizedPhone : `91${sanitizedPhone}`;
    const message = encodeURIComponent(`Hi ${job.customerName}, I'm your FixBro provider for booking #${job.bookingId}.`);
    window.open(`https://wa.me/${internationalPhone}?text=${message}`, '_blank');
  };

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">{job.services.map(s => s.name).join(', ')}</CardTitle>
           <Badge variant={getStatusBadgeVariant(job.status)} className={`capitalize text-xs ${getStatusBadgeClass(job.status)}`}>
            {job.status.replace(/([A-Z])/g, ' $1').replace('Provider ', '')}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          ID: {job.bookingId} | Customer: {isJobCompleted ? "[Hidden for Privacy]" : job.customerName}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p><strong>Date:</strong> {formatDateForDisplay(job.scheduledDate)} at {job.scheduledTimeSlot}</p>
        {job.estimatedEndTime && (
          <p className="text-green-600 font-medium">
            <strong>Ends:</strong> {new Date(job.estimatedEndTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(job.estimatedEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
        )}
        <p><strong>Address:</strong> {isJobCompleted ? "[Hidden for Privacy]" : `${job.addressLine1}${job.addressLine2 ? `, ${job.addressLine2}` : ''}, ${job.city}`}</p>
        <div className="flex items-center gap-2">
            <strong>Contact:</strong>
            {isJobCompleted ? (
              <span>[Hidden for Privacy]</span>
            ) : (
              <>
                <a href={`tel:${job.customerPhone}`} className="text-primary hover:underline font-medium">{job.customerPhone}</a>
                {job.customerPhone && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => handleWhatsAppClick(e, job.customerPhone!)}
                    title="Chat on WhatsApp"
                  >
                    <AppImage src="/whatsapp.png" alt="WhatsApp Icon" width={18} height={18} />
                    <span className="sr-only">Chat on WhatsApp</span>
                  </Button>
                )}
              </>
            )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-3">
        <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs" asChild>
          <Link href={`/provider/booking/${job.id}`} onClick={handleViewDetailsClick}>
            <ExternalLink className="mr-1 h-3.5 w-3.5"/>View Details
          </Link>
        </Button>
        {type === 'new' && onAccept && onReject && (
          <>
            <Button size="sm" onClick={() => onReject(job.id!)} variant="destructive" disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <XCircle className="mr-1 h-3.5 w-3.5"/> Reject
            </Button>
            <Button size="sm" onClick={() => onAccept(job.id!)} disabled={isProcessingAction} className="w-full sm:w-auto text-xs">
              {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <CheckCircle className="mr-1 h-3.5 w-3.5"/> Accept
            </Button>
          </>
        )}
        {type === 'ongoing' && job.status === 'ProviderAccepted' && onStartWork && (
          <Button size="sm" onClick={() => onStartWork(job.id!)} disabled={isProcessingAction} className="w-full text-xs">
            {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <PlayCircle className="mr-1 h-3.5 w-3.5"/> Start Work
          </Button>
        )}
        {type === 'ongoing' && job.status === 'InProgressByProvider' && onCompleteWork && (
          <Button size="sm" onClick={() => onCompleteWork(job.id!)} disabled={isProcessingAction} className="w-full text-xs bg-green-600 hover:bg-green-700">
            {isProcessingAction && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/>} <CheckCircle className="mr-1 h-3.5 w-3.5"/> Mark Complete
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default ProviderJobCard;
