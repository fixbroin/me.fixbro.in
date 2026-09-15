import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// In-memory process-lifetime fallback token if process.env.INTERNAL_API_SECRET is not configured.
// This ensures that unconfigured servers NEVER fall back to a known hardcoded public string.
declare global {
  // eslint-disable-next-line no-var
  var __WECANFIX_RUNTIME_INTERNAL_SECRET: string | undefined;
}

const KNOWN_INSECURE_SECRETS = new Set([
  'wecanfix_internal_secret_j7K9R2pX_2026',
  'fixbro_internal_secret_j7K9R2pX_2026',
  'default_secret',
  'change_in_production'
]);

export function getInternalApiSecret(): string {
  const envSecret = process.env.INTERNAL_API_SECRET;
  if (envSecret && envSecret.trim() && !KNOWN_INSECURE_SECRETS.has(envSecret.trim())) {
    return envSecret.trim();
  }
  if (!globalThis.__WECANFIX_RUNTIME_INTERNAL_SECRET) {
    globalThis.__WECANFIX_RUNTIME_INTERNAL_SECRET = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.__WECANFIX_RUNTIME_INTERNAL_SECRET;
}

export interface RequestUser {
  uid: string;
  email?: string;
  role?: string;
  isInternal: boolean;
}

/**
 * Decodes Authorization header token or checks for x-internal-token.
 */
export async function verifyRequest(req: NextRequest): Promise<RequestUser> {
  // 1. Check internal bypass header (for server-side routes / Next.js server actions)
  const internalToken = req.headers.get('x-internal-token');
  const validSecret = getInternalApiSecret();
  if (internalToken && internalToken === validSecret) {
    return { uid: 'server', role: 'super_admin', isInternal: true };
  }

  const guestUser: RequestUser = { uid: 'guest', role: 'guest', isInternal: false };

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return guestUser;
  }

  const token = authHeader.substring(7);
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Fetch user role from database (check both users and admins collection)
    let role: string | undefined = undefined;
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists) {
      role = userDoc.data()?.role;
    }

    if (!role || (role !== 'super_admin' && role !== 'finance_admin')) {
      const adminDoc = await adminDb.collection('admins').doc(uid).get();
      if (adminDoc.exists) {
        const adminData = adminDoc.data();
        if (adminData?.status === 'active' || adminData?.role) {
          role = adminData.role || 'super_admin';
        }
      }
    }

    return { uid, email, role, isInternal: false };
  } catch (error) {
    console.error("verifyRequest authentication error:", error);
    return guestUser;
  }
}

/**
 * Determines if the authenticated user has administrator privileges.
 */
export function isUserAdmin(user: RequestUser): boolean {
  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "wecanfix.in@gmail.com";
  const userEmail = (user.email || '').toLowerCase();
  return (
    user.isInternal ||
    user.role === 'super_admin' ||
    user.role === 'superadmin' ||
    user.role === 'finance_admin' ||
    user.role === 'admin' ||
    user.role === 'staff' ||
    userEmail === ADMIN_EMAIL.toLowerCase() ||
    userEmail === 'wecanfix.in@gmail.com' ||
    userEmail === 'Wecanfix.in@gmail.com' ||
    false
  );
}

/**
 * List of sensitive configuration keys that must never be exposed to non-administrators.
 */
export const SENSITIVE_CONFIG_KEYS = new Set([
  'stripesecretkey',
  'stripewebhooksecret',
  'razorpaykeysecret',
  'razorpaywebhooksecret',
  'smtppass',
  'smtppassword',
  'smtpuser',
  'smtphost',
  'whatsapptoken',
  'whatsappaccesstoken',
  'whatsappappsecret',
  'whatsappverifytoken',
  'firebaseprivatekey',
  'fcmserverkey',
  'cronsecret',
  'internalapisecret',
  'adminemailpassword'
]);

/**
 * Strips sensitive credentials and private data before returning to non-administrators.
 */
export function sanitizeDocumentData(table: string, data: any, user: RequestUser): any {
  if (!data || typeof data !== 'object') return data;
  if (isUserAdmin(user)) return data;

  // 1. Settings & Config: Strip sensitive payment, email, webhook, and API credentials
  if (table === 'webSettings' || table === 'appConfiguration' || table === 'marketingConfiguration') {
    const sanitized = { ...data };
    for (const key of Object.keys(sanitized)) {
      const lower = key.toLowerCase();
      if (
        SENSITIVE_CONFIG_KEYS.has(lower) ||
        lower.endsWith('secret') ||
        lower.endsWith('secretkey') ||
        lower.endsWith('password') ||
        lower.endsWith('pass')
      ) {
        delete sanitized[key];
      }
    }
    return sanitized;
  }

  // 2. Provider Applications: Strip sensitive KYC documents and bank details for other users
  if (table === 'providerApplications' && data.uid !== user.uid) {
    const {
      bankAccount,
      bankDetails,
      kycDocuments,
      aadhaarNumber,
      panNumber,
      adminReviewNotes,
      signatureUrl,
      ...safeData
    } = data;
    return safeData;
  }

  // 3. User documents: Prevent leaking private authentication or internal notes
  if (table === 'users' && data.uid !== user.uid) {
    const {
      fcmTokens,
      internalNotes,
      adminNotes,
      ...safeUserData
    } = data;
    return safeUserData;
  }

  return data;
}

/**
 * Fields on user profile documents that regular users are NOT allowed to modify.
 */
export const PROTECTED_USER_FIELDS = [
  'role',
  'adminPermissions',
  'isBlocked',
  'providerWalletBalance',
  'walletBalance',
  'balance',
  'commission',
  'commissionRate',
  'rating',
  'reviewCount',
  'totalEarnings',
  'isVerified',
  'status',
  'isSuperAdmin',
  'isActive',
  'marketingStatus'
];

/**
 * Sanitizes incoming user mutation payloads to prevent privilege escalation.
 */
export function sanitizeUserMutationPayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const sanitized = { ...data };
  for (const field of PROTECTED_USER_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

/**
 * Validates mutation requests (addDoc, setDoc, updateDoc, deleteDoc) at the field and table level.
 */
export function validateMutationAccess(
  user: RequestUser,
  action: string,
  path: string,
  targetId?: string,
  payload?: any
): { allowed: boolean; reason?: string; sanitizedData?: any } {
  // Admins & internal server actions have full mutation access
  if (isUserAdmin(user)) {
    return { allowed: true, sanitizedData: payload };
  }

  const parts = path.split('/').filter(Boolean);
  const table = parts[0];
  const docId = targetId || parts[1];

  // 1. Tables where public/guest submission is allowed via addDoc
  const PUBLIC_WRITE_TABLES = [
    'contactUsSubmissions',
    'popupSubmissions',
    'userActivities',
    'outOfZoneRequests',
    'visitorInfoLogs',
    'searchAnalytics',
    'customServiceRequests',
    'adminReviews',
    'userNotifications',
    'chats',
    'chats_messages'
  ];

  if (user.uid === 'guest') {
    if (PUBLIC_WRITE_TABLES.includes(table) && (action === 'addDoc' || action === 'setDoc')) {
      return { allowed: true, sanitizedData: payload };
    }
    if (table === 'providerApplications' && (action === 'addDoc' || action === 'setDoc')) {
      const sanitized = { ...payload };
      if (sanitized.status && sanitized.status !== 'pending_review' && sanitized.status !== 'draft') {
        delete sanitized.status;
      }
      delete sanitized.adminReviewNotes;
      return { allowed: true, sanitizedData: sanitized };
    }
    if (table === 'bookings' && action === 'addDoc') {
      const sanitized = { ...payload };
      sanitized.paymentStatus = 'Pending';
      return { allowed: true, sanitizedData: sanitized };
    }
    if (table === 'bookings' && action === 'updateDoc') {
      // Allow guests to update their booking during payment or review (e.g. isReviewedByCustomer)
      const sanitized = { ...payload };
      delete sanitized.totalAmount;
      delete sanitized.subTotal;
      delete sanitized.discountAmount;
      delete sanitized.visitingCharge;
      delete sanitized.platformFeeTotal;
      if (sanitized.paymentStatus === 'Paid') {
        delete sanitized.paymentStatus;
      }
      return { allowed: true, sanitizedData: sanitized };
    }
    if (table === 'chats' || table === 'chats_messages') {
      return { allowed: true, sanitizedData: payload };
    }
    return { allowed: false, reason: 'Authentication required for this operation.' };
  }

  // 2. Users Collection (Profile updates): Owner only, with privilege escalation stripping
  if (table === 'users') {
    if (action === 'deleteDoc') {
      return { allowed: false, reason: 'Only administrators can delete user accounts.' };
    }
    if (docId !== user.uid) {
      return { allowed: false, reason: 'You can only update your own user profile.' };
    }
    const sanitized = sanitizeUserMutationPayload(payload);
    return { allowed: true, sanitizedData: sanitized };
  }

  // 3. Admins Collection: Non-admins cannot modify admin records
  if (table === 'admins') {
    return { allowed: false, reason: 'Unauthorized access to administrator records.' };
  }

  // 4. Provider Applications: Owner can modify own application, applicant can submit
  if (table === 'providerApplications') {
    if (action === 'deleteDoc') {
      return { allowed: false, reason: 'Only administrators can delete provider applications.' };
    }
    if (docId && docId !== user.uid) {
      return { allowed: false, reason: 'You can only manage your own provider application.' };
    }
    const sanitized = { ...payload };
    // Non-admins can only submit as pending_review or draft
    if (sanitized.status && sanitized.status !== 'pending_review' && sanitized.status !== 'draft') {
      delete sanitized.status;
    }
    delete sanitized.adminReviewNotes;
    return { allowed: true, sanitizedData: sanitized };
  }

  // 5. Carts: Owner only
  if (table === 'userCarts') {
    if (docId && docId !== user.uid) {
      return { allowed: false, reason: 'You can only modify your own cart.' };
    }
    return { allowed: true, sanitizedData: payload };
  }

  // 6. Bookings:
  // - Non-admins CANNOT delete bookings
  // - Non-admins CANNOT modify pricing, discounts, or directly flip paymentStatus to Paid
  if (table === 'bookings') {
    if (action === 'deleteDoc') {
      return { allowed: false, reason: 'Only administrators can delete bookings.' };
    }
    if (action === 'addDoc') {
      const sanitized = { ...payload };
      sanitized.paymentStatus = 'Pending';
      return { allowed: true, sanitizedData: sanitized };
    }
    if (action === 'updateDoc' || action === 'setDoc') {
      const sanitized = { ...payload };
      // Prevent client-side price tampering or unauthorized status override
      delete sanitized.totalAmount;
      delete sanitized.subTotal;
      delete sanitized.discountAmount;
      delete sanitized.visitingCharge;
      delete sanitized.platformFeeTotal;
      if (sanitized.paymentStatus === 'Paid') {
        delete sanitized.paymentStatus;
      }
      return { allowed: true, sanitizedData: sanitized };
    }
    return { allowed: true, sanitizedData: payload };
  }

  // 7. Withdrawals:
  // - Non-admins can only submit a pending request for themselves
  // - Non-admins CANNOT approve, modify status, or delete withdrawal requests
  if (table === 'withdrawalRequests') {
    if (action === 'deleteDoc') {
      return { allowed: false, reason: 'Only administrators can delete withdrawal requests.' };
    }
    if (action === 'addDoc') {
      const sanitized = { ...payload };
      sanitized.providerId = user.uid;
      sanitized.status = 'pending';
      return { allowed: true, sanitizedData: sanitized };
    }
    return { allowed: false, reason: 'Only administrators can update withdrawal requests.' };
  }

  // 8. Provider Wallet Transactions: ONLY admins or internal server can record transactions
  if (table === 'providerWalletTransactions') {
    return { allowed: false, reason: 'Wallet transactions can only be created by system processes.' };
  }

  // 9. Quotations & Invoices:
  if (table === 'quotations' || table === 'invoices') {
    if (action === 'deleteDoc') {
      return { allowed: false, reason: 'Only administrators can delete invoices or quotations.' };
    }
    return { allowed: true, sanitizedData: payload };
  }

  // 10. Provider Leaves:
  if (table === 'leaves') {
    if (payload && payload.providerId && payload.providerId !== user.uid) {
      return { allowed: false, reason: 'You can only manage your own leaves.' };
    }
    return { allowed: true, sanitizedData: payload };
  }

  // 11. User Notifications
  if (table === 'userNotifications') {
    return { allowed: true, sanitizedData: payload };
  }

  // 12. Chats
  if (table === 'chats' || table === 'chats_messages') {
    return { allowed: true, sanitizedData: payload };
  }

  // 13. Customer Reviews: Authenticated users & guests can submit reviews
  if (table === 'adminReviews') {
    if (action === 'deleteDoc') {
      return { allowed: false, reason: 'Only administrators can delete reviews.' };
    }
    if (action === 'addDoc' || action === 'setDoc') {
      return { allowed: true, sanitizedData: payload };
    }
    return { allowed: false, reason: 'Only administrators can modify existing reviews.' };
  }

  // 14. Custom Service Requests
  if (table === 'customServiceRequests') {
    if (action === 'deleteDoc') {
      return { allowed: false, reason: 'Only administrators can delete custom service requests.' };
    }
    if (action === 'addDoc' || action === 'setDoc') {
      return { allowed: true, sanitizedData: payload };
    }
    return { allowed: false, reason: 'Only administrators can modify custom service requests.' };
  }

  // 15. Public submission tables
  if (PUBLIC_WRITE_TABLES.includes(table)) {
    if (action === 'addDoc' || action === 'setDoc') {
      return { allowed: true, sanitizedData: payload };
    }
    return { allowed: false, reason: 'Only adding entries is permitted for this table.' };
  }

  return { allowed: false, reason: `Forbidden: No write access to "${path}".` };
}

/**
 * Firestore-style database security rules.
 */
export function validateAccess(user: RequestUser, path: string, action: 'read' | 'write'): boolean {
  // 1. Admins have absolute read & write access to everything
  if (isUserAdmin(user)) {
    return true;
  }

  const parts = path.split('/').filter(Boolean);
  const table = parts[0];
  const docId = parts[1];

  // Helper: check if doc ID matches user's UID
  const isOwner = docId === user.uid;

  // 2. Public Static Content (Readable by all, writable only by Admin)
  const PUBLIC_READ_TABLES = [
    'adminCategories',
    'adminSubCategories',
    'adminServices',
    'adminSlideshows',
    'webSettings',
    'appConfiguration',
    'contentPages',
    'adminFAQs',
    'taxes',
    'adminPopups',
    'blogPosts',
    'cities',
    'areas',
    'pinCodeAreaMappings',
    'serviceZones',
    'adminPromoCodes',
    'adminCoupons',
    'providerControlOptions',
    'timeSlotCategoryLimits',
    'services',
    'seoSettings',
    'cityCategorySeoSettings',
    'areaCategorySeoSettings',
    'areaServiceSeoSettings',
    'adminTaxes'
  ];

  if (PUBLIC_READ_TABLES.includes(table)) {
    return action === 'read';
  }

  // 3. User Accounts (Owner only, or query-level filtered getDocs, or allowed if authenticated to view provider/public user info)
  if (table === 'users') {
    if (action === 'read') return user.uid !== 'guest';
    return isOwner;
  }

  // 4. Admins table (Users can read/check their own admin doc; admin writes)
  if (table === 'admins') {
    return action === 'read' && isOwner;
  }

  // 5. Provider Applications (Public read for active/zone mapping, write allowed for applications)
  if (table === 'providerApplications') {
    if (action === 'read') return true;
    return true;
  }

  // 5. Carts (Owner only)
  if (table === 'userCarts') {
    return isOwner;
  }

  // 6. Contact, Popup, Custom Service & Analytics Logs (Write allowed for public/guests/users)
  if ([
    'contactUsSubmissions',
    'popupSubmissions',
    'userActivities',
    'outOfZoneRequests',
    'visitorInfoLogs',
    'searchAnalytics',
    'customServiceRequests'
  ].includes(table)) {
    return action === 'write';
  }

  // 7. Chats & Chat Messages (Allowed for user support)
  if (table === 'chats' || table === 'chats_messages') {
    return true;
  }

  // 8. Bookings (Public read for invoice/confirmation lookup; write permitted with mutation validation)
  if (table === 'bookings') {
    return true;
  }

  // 9. User Notifications
  if (table === 'userNotifications') {
    return true;
  }

  // 10. Withdrawals & Quotations & Invoices & Referrals
  if (['withdrawalRequests', 'quotations', 'invoices', 'referrals', 'leaves', 'providerWalletTransactions', 'providerComplaints'].includes(table)) {
    if (action === 'read') return user.uid !== 'guest';
    return user.uid !== 'guest';
  }

  // 11. Customer Reviews (Public read, write allowed for customers)
  if (table === 'adminReviews') {
    if (action === 'read') return true;
    return action === 'write';
  }

  // Block everything else by default
  return false;
}
