
import type { FirestoreService } from "@/types/firestore";

export const generateBookingId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FB-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(chars.length * Math.random()));
  }
  return result;
};

export const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive: boolean, taxPercent: number): number => {
    if (!isTaxInclusive || taxPercent <= 0) return displayedPrice;
    return (displayedPrice * 100) / (100 + taxPercent);
};

export const getPriceForNthUnit = (service: FirestoreService, n: number): number => {
  if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0 || n <= 0) {
    return service.discountedPrice ?? service.price;
  }
  const sortedVariants = [...service.priceVariants].sort((a, b) => a.fromQuantity - b.fromQuantity);
  const applicableTier = sortedVariants.find(tier => {
    const start = tier.fromQuantity;
    const end = tier.toQuantity ?? Infinity;
    return n >= start && n <= end;
  });
  if (applicableTier) return applicableTier.price;
  const lastApplicableTier = sortedVariants.slice().reverse().find(tier => n >= tier.fromQuantity);
  if (lastApplicableTier) return lastApplicableTier.price;
  return service.discountedPrice ?? service.price;
};

export const calculateIncrementalTotalPriceForItem = (service: FirestoreService, quantity: number): number => {
    if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0) {
        const unitPrice = service.discountedPrice ?? service.price;
        return unitPrice * quantity;
    }
    let total = 0;
    for (let i = 1; i <= quantity; i++) {
        total += getPriceForNthUnit(service, i);
    }
    return total;
};

/**
 * Safely parses the scheduled date and time slot of a booking into epoch milliseconds.
 * Returns exact timestamp representing the scheduled date & time slot.
 * Falls back to `createdAt` timestamp if scheduled date is missing or invalid.
 */
export const getBookingScheduledTimestampMillis = (b: any): number => {
  if (!b) return 0;

  const dateStr = b.scheduledDate || b.bookingDate;
  const timeStr = b.scheduledTimeSlot || b.bookingTime;

  if (dateStr && typeof dateStr === 'string') {
    try {
      const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      let yyyy = 0, mm = 0, dd = 0;

      const delimiter = cleanDate.includes('-') ? '-' : (cleanDate.includes('/') ? '/' : null);
      if (delimiter) {
        const parts = cleanDate.split(delimiter);
        if (parts.length === 3) {
          const p0 = parseInt(parts[0], 10);
          const p1 = parseInt(parts[1], 10);
          const p2 = parseInt(parts[2], 10);

          if (parts[0].length === 4) {
            // Format: YYYY-MM-DD or YYYY/MM/DD
            yyyy = p0;
            mm = p1;
            dd = p2;
          } else if (parts[2].length === 4) {
            // Format: DD-MM-YYYY or DD/MM/YYYY
            dd = p0;
            mm = p1;
            yyyy = p2;
          }
        }
      }

      if (yyyy > 0 && mm > 0 && dd > 0) {
        let timeHours = 12;
        let timeMinutes = 0;
        if (timeStr && typeof timeStr === 'string') {
          const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
          if (match) {
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const ampm = match[3]?.toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            timeHours = h;
            timeMinutes = m;
          }
        }
        return new Date(yyyy, mm - 1, dd, timeHours, timeMinutes).getTime();
      }
    } catch (e) {}
  }

  if (b.createdAt) {
    if (typeof b.createdAt.toMillis === 'function') return b.createdAt.toMillis();
    if (typeof b.createdAt.seconds === 'number') return b.createdAt.seconds * 1000;
    if (typeof b.createdAt._seconds === 'number') return b.createdAt._seconds * 1000;
    if (b.createdAt instanceof Date) return b.createdAt.getTime();
    if (typeof b.createdAt === 'string') {
      const d = new Date(b.createdAt);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }

  return 0;
};
