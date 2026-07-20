# Time Slot and Leaves Implementation Log

This document lists all the files modified and created to support the multiple timing intervals per day and leaves/holidays configuration feature.

---

### 1. `src/types/firestore.ts`
* **Changes**:
  * Added the `TimeInterval` interface representing dynamic timing windows (with `startTime`, `endTime`, and `slotIntervalMinutes`).
  * Added the `LeaveRequest` interface representing scheduled leaves and holidays (with fields for `startDate`, `endDate`, `leaveType`, `startTime`, `endTime`, and `reason`).
  * Extended the `DayAvailability` interface to hold an optional array of `intervals?: TimeInterval[]`.

---

### 2. `src/config/appDefaults.ts`
* **Changes**:
  * Updated the default settings template to initialize each weekday with an `intervals` array containing the day's standard working hours. This guarantees backward compatibility and prevents null reference errors on fresh installations.

---

### 3. `src/app/admin/settings/page.tsx`
* **Changes**:
  * **Time Slots Tab**: Refactored the UI to support adding and deleting multiple time slots per day (using dynamic `Plus` and `Trash2` icons) instead of a single range.
  * **Leaves & Holidays Tab**: Added a dedicated settings tab to display all holidays, add leaves (using a Dialog picker for type selection: Full-Day vs. Custom Hours), edit leaves in-place, and delete configured leaves.
  * **Data Migration on Load**: When loading settings from Firestore, if a day does not have an `intervals` array, the system automatically builds one using the day's legacy `startTime`/`endTime` values.
  * **In-Place Leave Editing**: Added `editingLeaveId` state to prepopulate the leave dialog, permitting admins to modify existing holidays and update them directly in Firestore.

---

### 4. `src/app/api/checkout/available-slots/route.ts`
* **Changes**:
  * **Interval and Leaves Math**: Implemented `getDayActiveIntervals` and `subtractInterval` to compile all active working windows for any date and subtract any custom hours blocked by partial leaves.
  * **Path Progression**: Rewrote `calculateEndDateTime` and `simulateProgression` to step bookings sequentially through multiple daily intervals (automatically jumping over gap times and breaks).
  * **Multi-Day Service Restriction**: Adapted to multi-interval days by summing all working minutes in active intervals. If duration exceeds the day's total capacity, the service is locked to start only at the first slot of the first interval.
  * **Long Service Restriction (6-hour Fix)**: Adapted to multi-interval days by summing the remaining minutes in the current interval plus all subsequent intervals today. If the total remaining working time today is less than the service duration, the slot is skipped.

---

### 5. `src/app/api/checkout/leaves/route.ts` [NEW FILE]
* **Changes**:
  * Created a secure, dynamic server-side GET API route that reads the `leaves` collection via the Firebase Admin SDK. This prevents guest checkout users from facing client-side Firebase permission errors.

---

### 6. `src/components/checkout/ScheduleSelection.tsx`
* **Changes**:
  * **Bypassed Permission Rules**: Replaced client-side Firestore calls with requests to the new `/api/checkout/leaves` API.
  * **Calendar Modifiers**: Applied custom highlights to the calendar (dashed red for holidays, dashed amber for partial-day leaves).
  * **Selectable Holiday Dates**: Kept holiday dates clickable so that when selected, the custom warning banner with the holiday reason is displayed, rather than disabling them completely.
  * **Estimated Completion Date**: Restored the date string display so that it outputs both date and time (e.g., `Ends on Sat, 27 Jun at 07:00 PM`).
  * **Includes Gaps / Holidays Breakdown**: Added a detailed section below estimated completion that lists any holidays, leaves, or shop breaks falling within the booking progression timeline.
  * **Passes Breaks List**: Pass the array of computed gaps/holidays to the parent component via the `onSelect` callback.

---

### 7. `src/app/checkout/page.tsx`
* **Changes**:
  * Saved the computed gaps, holidays, and leaves list (`interveningBreaks`) directly to `localStorage` (`fixbroInterveningBreaks`) when the schedule is selected.

---

### 8. `src/app/checkout/thank-you/page.tsx`
* **Changes**:
  * Reads the list of breaks from `localStorage` and saves it directly to the booking document under the new `interveningBreaks` field in Firestore bookings.
  * Displays the **"Includes Gaps / Holidays"** timeline details inside the booking success summary.

---

### 9. `src/app/my-bookings/page.tsx`
* **Changes**:
  * Displays the list of gaps, holidays, or leaves inside the booking cards under the Estimated Completion details, helping customers verify the schedule details at any time.

---

### 10. `src/app/contact-us/page.tsx`
* **Changes**:
  * Loaded app settings weekly availability and all active/upcoming leaves directly from Firestore.
  * Rendered a new **"Working Hours & Holidays"** section dynamically:
    * Left side shows weekdays along with their multiple configured timing intervals (or `Closed`).
    * Right side lists upcoming holidays/leaves, highlighting dates, blockout type, custom times, and reasons.

---

### 11. Multi-day Booking Day-by-Day Timeline Breakdown
* **Changes across files**:
  * **`src/app/api/checkout/available-slots/route.ts`**: Implemented `calculateDailyTimeline` to simulate work progression day-by-day and return a `dailyTimeline` array inside each available time slot object.
  * **`src/components/checkout/ScheduleSelection.tsx`**: Renders a **"Day-by-Day Work Schedule"** list (only if the booking spans across multiple days) underneath the slot card in the selection modal.
  * **`src/app/checkout/page.tsx`**: Saves the selected schedule's daily timeline to `localStorage` (`fixbroDailyTimeline`).
  * **`src/app/checkout/thank-you/page.tsx`**: Loads the daily timeline from `localStorage` and saves it to the Firestore booking document. Renders the day-by-day timeline inside the confirmation summary.
  * **`src/app/my-bookings/page.tsx`**: Reads `dailyTimeline` from the booking document and renders the timeline within the customer's historical booking card summary.

---

### 12. Conditional Tax Display (Zero-Tax Rule)
* **Changes across files**:
  * **`src/components/checkout/payment/PaymentSummary.tsx`**: Hides the checkout "Tax" summary row if `taxAmount === 0`.
  * **`src/app/checkout/thank-you/page.tsx`**: Hides the "Total Tax" row in the success card if `taxAmount === 0`.
  * **`src/lib/invoiceGenerator.ts`**: Hides the `Total Tax` row in the admin and email PDF invoices if `booking.taxAmount === 0`.
  * **`src/lib/InvoicePdfForDownload.ts`**: Hides the `Total Tax` row in the customer-downloaded PDF invoices if `booking.taxAmount === 0`.

---

### 13. Scheduler Slots Grid Card container
* **Changes**:
  * **`src/components/checkout/ScheduleSelection.tsx`**: Wrapped the time slots buttons grid in a visual container card (`p-4 bg-primary/[0.03] dark:bg-muted/10 border border-primary/10 rounded-2xl`) so that the individual slots sit on a defined light background with colored borders, elevating the UI design premium feel.

---

### 14. Admin & Provider Booking Detail Schedule Display
* **Changes**:
  * **`src/components/admin/BookingDetailsModalContent.tsx`**: Displays the **"Day-by-Day Work Schedule"** and **"Includes Gaps / Holidays"** timeline details inside the admin booking detail modal.
  * **`src/app/provider/booking/[bookingId]/page.tsx`**: Displays the **"Day-by-Day Work Schedule"** and **"Includes Gaps / Holidays"** timelines inside the provider booking details page.

---

### 15. Scheduler Default Date Selection (Auto-select Today)
* **Changes**:
  * **`src/components/checkout/ScheduleSelection.tsx`**: Automatically selects the current date (today) in the calendar on load (if no date was previously selected), triggering slot loading immediately for today.

---

### 16. Available Slots API Performance Optimization
* **Changes**:
  * **`src/app/api/checkout/available-slots/route.ts`**: Optimized from reading all services, subcategories, and limits, to targeted reads using `adminDb.getAll(...)` for only the specific services in the cart and bookings active in the date range. Added an in-memory cache for `applicationConfig` to avoid repeated database lookups.
  * **How to change config cache timing**: In `src/app/api/checkout/available-slots/route.ts`, locate the variable `CACHE_TTL_MS` (currently set to `15 * 60 * 1000` / 15 minutes). You can modify this value (in milliseconds) to adjust how long settings are cached in memory (e.g. `60 * 1000` for 1 minute).
