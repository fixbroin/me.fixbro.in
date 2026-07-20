import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp } from '@/lib/mysqlDb'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely converts various timestamp formats to milliseconds.
 * Handles Firestore Timestamp, serialized plain objects, ISO strings, and Date objects.
 */
export function getTimestampMillis(ts: any): number {
  if (!ts) return 0;
  
  // Real Firestore Timestamp
  if (typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }
  
  // Plain object from JSON/Cache (Firestore-like)
  if (typeof ts === 'object') {
    if (ts.seconds !== undefined) {
      return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000;
    }
    // Admin SDK format (_seconds)
    if (ts._seconds !== undefined) {
      return ts._seconds * 1000 + (ts._nanoseconds || 0) / 1000000;
    }
    // Date object
    if (ts instanceof Date) {
      return ts.getTime();
    }
  }
  
  // ISO String or other date string
  if (typeof ts === 'string') {
    const date = new Date(ts);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  
  // Already a number
  if (typeof ts === 'number') {
    return ts;
  }
  
  return 0;
}

/**
 * Returns a Date object shifted to represent the target timezone's local time.
 * Useful for "now" calculations on servers with different default timezones.
 * It uses a component-based approach which is much more reliable than string parsing.
 */
export function getZonedDate(date?: Date | string | number, timeZone: string = 'Asia/Kolkata'): Date {
  const d = date ? new Date(date) : new Date();
  
  // Extract components in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  }).formatToParts(d);

  const findPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  
  // Create a new Date object using these components as "local" time
  return new Date(
    findPart('year'),
    findPart('month') - 1,
    findPart('day'),
    findPart('hour'),
    findPart('minute'),
    findPart('second')
  );
}

/**
 * Formats a Date to an ISO string (YYYY-MM-DD) in the target timezone.
 * Prevents "yesterday" issues when formatting dates in UTC.
 */
export function formatZonedDateToISO(date?: Date | string | number, timeZone: string = 'Asia/Kolkata'): string {
  try {
    const d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) throw new Error("Invalid date");

    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone, 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
    
    // en-CA format is usually YYYY-MM-DD
    const formatted = formatter.format(d);
    if (formatted.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return formatted;
    }

    // Fallback using parts if en-CA didn't give what we wanted
    const parts = formatter.formatToParts(d);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    
    if (year && month && day) {
        return `${year}-${month}-${day}`;
    }
    
    throw new Error("Formatting failed");
  } catch (e) {
    console.error("formatZonedDateToISO failed:", e);
    // Ultimate fallback to local ISO string part
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Converts a "wall clock" date (created by getZonedDate) back to a real UTC Date object.
 * This is necessary before calling .toISOString() or sending the date to the client.
 */
export function convertWallClockToUTC(wallClockDate: Date, timeZone: string = 'Asia/Kolkata'): Date {
  // Use a component-based diff to find the exact offset in milliseconds
  const testDate = new Date(); // Use current time as a baseline for offset
  const zoned = getZonedDate(testDate, timeZone);
  const offset = zoned.getTime() - testDate.getTime();
  
  return new Date(wallClockDate.getTime() - offset);
}

/**
 * Formats a date string or object for display, respecting the target timezone.
 */
export function formatDateInTimezone(date: Date | string | number | undefined, timeZone: string = 'Asia/Kolkata', options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat('en-IN', { ...options, timeZone }).format(d);
}

/**
 * Formats a time string or object for display, respecting the target timezone.
 */
export function formatTimeInTimezone(date: Date | string | number | undefined, timeZone: string = 'Asia/Kolkata', options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true }): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat('en-IN', { ...options, timeZone }).format(d);
}

/**
 * Converts a raw database date string (YYYY-MM-DD) to Indian format (DD-MM-YYYY)
 */
export function formatScheduledDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return dateStr;
}
