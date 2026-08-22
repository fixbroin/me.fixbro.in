'use server';

import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';
import { revalidatePath } from 'next/cache';
import { getPushTemplate } from '@/app/actions/pushSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

// MySQL database imports
import { db } from '@/lib/mysqlDb';
import { doc, getDoc, getDocs, updateDoc, addDoc, collection, query, where, orderBy, limit, Timestamp } from '@/lib/mysqlDb';

export interface WalletProviderSettings {
  minDepositAmount: number;
  maxDepositAmount: number;
  depositBonusPercentage: number;
  minBalanceForJobs: number;
}

export interface WalletTransaction {
  id: string;
  providerId: string;
  amount: number;
  type: 'deposit' | 'commission_deduction' | 'commission_refund' | 'manual_adjustment';
  bookingId?: string | null;
  description: string;
  timestamp: number;
  bonusAmount?: number;
}

const DEFAULT_SETTINGS: WalletProviderSettings = {
  minDepositAmount: 500,
  maxDepositAmount: 10000,
  depositBonusPercentage: 0,
  minBalanceForJobs: 100,
};

// 1. Fetch wallet settings (MySQL)
export async function getProviderWalletSettingsAction(): Promise<WalletProviderSettings> {
  try {
    const settingsDoc = await getDoc(doc(db, 'appConfiguration', 'wallet_provider'));
    if (settingsDoc.exists()) {
      return { ...DEFAULT_SETTINGS, ...settingsDoc.data() } as WalletProviderSettings;
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error fetching wallet settings:", error);
    return DEFAULT_SETTINGS;
  }
}

// 2. Save wallet settings (MySQL)
export async function saveProviderWalletSettingsAction(settings: WalletProviderSettings) {
  try {
    const docRef = doc(db, 'appConfiguration', 'wallet_provider');
    // Set settings
    const exists = (await getDoc(docRef)).exists();
    if (exists) {
      await updateDoc(docRef, {
        ...settings,
        updatedAt: Timestamp.now()
      });
    } else {
      // Use addDoc or setDoc structure
      await updateDoc(docRef, {
        ...settings,
        updatedAt: Timestamp.now()
      });
    }
    return { success: true, message: "Wallet settings saved successfully." };
  } catch (error: any) {
    console.error("Error saving wallet settings:", error);
    return { success: false, message: error.message || "Failed to save settings." };
  }
}

// 3. Get provider wallet details (MySQL)
export async function getProviderWalletDetailsAction(providerId: string) {
  try {
    const userDoc = await getDoc(doc(db, 'users', providerId));
    const balance = userDoc.exists() ? (userDoc.data()?.providerWalletBalance || 0) : 0;

    const txSnap = await getDocs(
      query(
        collection(db, 'providerWalletTransactions'),
        where('providerId', '==', providerId),
        orderBy('timestamp', 'desc'),
        limit(50)
      )
    );

    const transactions: WalletTransaction[] = [];
    txSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      transactions.push({
        id: docSnap.id,
        providerId: data.providerId,
        amount: data.amount,
        type: data.type,
        bookingId: data.bookingId || null,
        description: data.description,
        timestamp: data.timestamp?.toMillis() || Date.now(),
        bonusAmount: data.bonusAmount,
      });
    });

    return { balance, transactions };
  } catch (error) {
    console.error("Error fetching provider wallet details:", error);
    return { balance: 0, transactions: [] };
  }
}

// 4. Deposit funds via verified Razorpay checkout (MySQL)
export async function depositProviderWalletAction(
  providerId: string,
  amount: number,
  paymentDetails: { razorpay_order_id: string; razorpay_payment_id: string }
) {
  try {
    const settings = await getProviderWalletSettingsAction();
    const bonusPercentage = settings.depositBonusPercentage || 0;
    const bonusAmount = bonusPercentage > 0 ? (amount * bonusPercentage) / 100 : 0;
    const finalCredit = amount + bonusAmount;

    // Fetch user details from MySQL
    const userDocRef = doc(db, 'users', providerId);
    const userSnap = await getDoc(userDocRef);
    const currentBalance = userSnap.exists() ? (userSnap.data()?.providerWalletBalance || 0) : 0;
    const providerName = userSnap.exists() ? (userSnap.data()?.displayName || 'Provider') : 'Provider';
    const finalBalance = currentBalance + finalCredit;

    // Update MySQL user balance
    await updateDoc(userDocRef, {
      providerWalletBalance: finalBalance,
    });

    // Write ledger in MySQL
    await addDoc(collection(db, 'providerWalletTransactions'), {
      providerId,
      amount,
      type: 'deposit',
      description: `Prepaid wallet deposit via Razorpay${bonusPercentage > 0 ? ` (+${bonusPercentage}% bonus)` : ''}`,
      timestamp: Timestamp.now(),
      bonusAmount: bonusAmount || null,
      razorpay_order_id: paymentDetails.razorpay_order_id,
      razorpay_payment_id: paymentDetails.razorpay_payment_id,
    });

    // Dispatch push to Provider
    await sendServerPushNotification({
      userId: providerId,
      title: "Wallet Deposited!",
      body: `Successfully added ₹${finalCredit.toFixed(2)} to your prepaid wallet.`,
      href: '/provider/wallet',
      type: 'provider_wallet_deposit',
      variables: {
        amount: finalCredit.toFixed(2),
        balance: finalBalance.toFixed(2),
        currencySymbol: '₹'
      }
    }).catch(e => console.error("Error sending provider deposit push:", e));

    // Dispatch push to Admins
    try {
      const adminsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
      if (!adminsSnap.empty) {
        const promises = adminsSnap.docs.map(adminDoc => 
          sendServerPushNotification({
            userId: adminDoc.id,
            title: "Provider Wallet Deposit",
            body: `Provider ${providerName} added ₹${finalCredit.toFixed(2)} to their wallet.`,
            href: '/admin/provider-controls?tab=wallet_complaints',
            type: 'admin_provider_deposit_alert',
            variables: {
              providerName,
              amount: finalCredit.toFixed(2),
              balance: finalBalance.toFixed(2),
              currencySymbol: '₹'
            }
          })
        );
        await Promise.allSettled(promises);
      }
    } catch (e) {
      console.error("Error sending admin deposit alert push:", e);
    }

    revalidatePath('/provider/wallet');
    return { success: true, message: `Successfully deposited ₹${finalCredit.toFixed(2)} to your wallet.` };
  } catch (error: any) {
    console.error("Error depositing to provider wallet:", error);
    return { success: false, message: error.message || "Deposit transaction failed." };
  }
}

// 5. Manual wallet adjustment / refund (Admin) (MySQL)
export async function adjustProviderWalletAction(
  providerId: string,
  amount: number,
  type: 'deposit' | 'commission_deduction' | 'commission_refund' | 'manual_adjustment',
  description: string,
  bookingId?: string
) {
  try {
    const userDocRef = doc(db, 'users', providerId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      throw new Error("Provider user profile not found.");
    }
    
    const currentBalance = userSnap.data()?.providerWalletBalance || 0;
    const newBalance = currentBalance + amount;

    // Update MySQL user balance
    await updateDoc(userDocRef, { providerWalletBalance: newBalance });

    // Write ledger to MySQL
    await addDoc(collection(db, 'providerWalletTransactions'), {
      providerId,
      amount,
      type,
      bookingId: bookingId || null,
      description,
      timestamp: Timestamp.now(),
    });

    // Write in-app notification to MySQL
    await addDoc(collection(db, 'userNotifications'), {
      userId: providerId,
      title: amount >= 0 ? "Prepaid Wallet Credited" : "Prepaid Wallet Debited",
      message: `Your prepaid wallet has been adjusted by ${amount >= 0 ? '+' : ''}₹${amount.toFixed(2)}. Description: ${description}`,
      type: amount >= 0 ? 'success' : 'info',
      href: '/provider/wallet',
      read: false,
      createdAt: Timestamp.now(),
    });

    // Send push notification to the provider
    await sendServerPushNotification({
      userId: providerId,
      title: amount >= 0 ? "Wallet Adjusted!" : "Wallet Adjusted!",
      body: `Your prepaid wallet has been adjusted by ₹${amount.toFixed(2)}.`,
      href: '/provider/wallet',
      type: 'provider_wallet_refund',
      variables: {
        amount: amount.toFixed(2),
        reason: description,
        currencySymbol: '₹'
      }
    }).catch(e => console.error("Error sending manual adjustment push alert:", e));

    revalidatePath('/provider/wallet');
    return { success: true, message: "Wallet adjusted successfully." };
  } catch (error: any) {
    console.error("Error in adjustProviderWalletAction:", error);
    return { success: false, message: error.message || "Failed to adjust wallet." };
  }
}

// Helper to calculate provider commission fee
const calculateProviderFee = (bookingAmount: number, feeType?: string, feeValue?: number): number => {
  if (!feeType || !feeValue || feeValue <= 0) return 0;
  if (feeType === 'fixed') return feeValue;
  if (feeType === 'percentage') return (bookingAmount * feeValue) / 100;
  return 0;
};

// Check if payment method is cash
const isCashPayment = (method?: string): boolean => {
  const m = (method || '').toLowerCase();
  return m.includes('cash') || m.includes('cod') || m.includes('after service');
};

// 6. Central server action to handle provider status updates with wallet validation (MySQL)
export async function updateBookingStatusByProviderAction(
  bookingId: string,
  providerId: string,
  newStatus: string,
  additionalCharges?: { name: string; amount: number }[],
  finalizedPaymentMethod?: string
) {
  try {
    const bookingDocRef = doc(db, 'bookings', bookingId);
    const providerUserRef = doc(db, 'users', providerId);

    const bookingSnap = await getDoc(bookingDocRef);
    if (!bookingSnap.exists()) {
      throw new Error("Booking not found.");
    }
    const bookingData = bookingSnap.data() as any;

    const providerSnap = await getDoc(providerUserRef);
    if (!providerSnap.exists()) {
      throw new Error("Provider user document not found.");
    }
    const providerData = providerSnap.data() || {};

    const currentStatus = bookingData.status;
    const updateData: any = { 
      status: newStatus,
      updatedAt: Timestamp.now(),
    };

    // 1. Acceptance Checks & Wallet Deductions
    if (newStatus === 'ProviderAccepted') {
      const paymentMethod = finalizedPaymentMethod || bookingData.paymentMethod || 'Cash';
      
      if (isCashPayment(paymentMethod)) {
        // Load settings
        const settings = await getProviderWalletSettingsAction();
        const currentWalletBalance = providerData.providerWalletBalance || 0;

        if (currentWalletBalance < settings.minBalanceForJobs) {
          throw new Error(`Insufficient wallet balance. You must maintain at least ₹${settings.minBalanceForJobs.toFixed(2)} in your prepaid wallet to accept cash jobs. Please top up your wallet.`);
        }

        // Calculate commission
        const configSnap = await getDoc(doc(db, 'webSettings', 'applicationConfig'));
        const appConfig = configSnap.exists() ? configSnap.data() as any : {};
        const commission = calculateProviderFee(bookingData.totalAmount || 0, appConfig.providerFeeType, appConfig.providerFeeValue);

        if (commission > 0) {
          // Deduct from wallet in MySQL
          await updateDoc(providerUserRef, { 
            providerWalletBalance: currentWalletBalance - commission 
          });

          // Write deduction ledger log in MySQL
          await addDoc(collection(db, 'providerWalletTransactions'), {
            providerId,
            amount: -commission,
            type: 'commission_deduction',
            bookingId,
            description: `Commission auto-deducted for accepting cash booking (ID: ${bookingData.bookingId || bookingId})`,
            timestamp: Timestamp.now(),
          });

          updateData.commissionPaidFromWallet = true;
          updateData.walletCommissionAmount = commission;
        }
      }
    }

    // 2. Service completion payload enrichment
    if (newStatus === "Completed") {
      if (currentStatus !== "Completed") {
        updateData.isReviewedByCustomer = false;
      }
      if (additionalCharges && additionalCharges.length > 0) {
        updateData.additionalCharges = additionalCharges;
        const totalCharges = additionalCharges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
        updateData.totalAmount = (bookingData.totalAmount || 0) + totalCharges;
      }
      if (finalizedPaymentMethod) {
        updateData.paymentMethod = finalizedPaymentMethod;
      }
    }

    await updateDoc(bookingDocRef, updateData);
    return { success: true };
  } catch (error: any) {
    console.error("Error in updateBookingStatusByProviderAction:", error);
    return { success: false, message: error.message || "Failed to update booking status." };
  }
}

export interface WalletComplaint {
  id: string;
  providerId: string;
  providerName: string;
  bookingId: string;
  bookingHumanId: string;
  message: string;
  amount: number;
  status: 'pending' | 'resolved';
  createdAt: number;
  resolvedAt?: number;
  resolutionNotes?: string;
}

// 7. Submit a new wallet complaint (Provider) (MySQL)
export async function submitWalletComplaintAction(
  providerId: string,
  bookingId: string,
  message: string,
  amount: number
) {
  try {
    const providerSnap = await getDoc(doc(db, 'users', providerId));
    const providerName = providerSnap.exists() ? (providerSnap.data()?.displayName || 'Provider') : 'Provider';

    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    const bookingHumanId = bookingSnap.exists() ? (bookingSnap.data()?.bookingId || bookingId) : bookingId;

    // Check if complaint already exists for this booking in MySQL
    const existing = await getDocs(
      query(
        collection(db, 'providerComplaints'),
        where('providerId', '==', providerId),
        where('bookingId', '==', bookingId),
        limit(1)
      )
    );

    if (!existing.empty) {
      return { success: false, message: "A complaint has already been submitted for this booking." };
    }

    // Add complaint document to MySQL
    await addDoc(collection(db, 'providerComplaints'), {
      providerId,
      providerName,
      bookingId,
      bookingHumanId,
      message,
      amount,
      status: 'pending',
      createdAt: Timestamp.now(),
    });

    // Notify Admins in MySQL
    const adminsSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
    if (!adminsSnapshot.empty) {
      const promises = adminsSnapshot.docs.map(async (adminDoc) => {
        // Write notification to MySQL
        await addDoc(collection(db, 'userNotifications'), {
          userId: adminDoc.id,
          title: "New Wallet Complaint",
          message: `Provider ${providerName} submitted a dispute for booking #${bookingHumanId}.`,
          type: 'admin_alert',
          href: '/admin/provider-controls?tab=wallet_complaints',
          read: false,
          createdAt: Timestamp.now(),
        });
      });
      await Promise.allSettled(promises);

      // Trigger push alerts to admins asynchronously
      try {
        const pushPromises = adminsSnapshot.docs.map(adminDoc => 
          sendServerPushNotification({
            userId: adminDoc.id,
            title: "New Wallet Dispute Filed",
            body: `Provider ${providerName} filed a dispute for booking #${bookingHumanId}.`,
            href: '/admin/provider-controls?tab=wallet_complaints',
            type: 'admin_wallet_complaint_alert',
            variables: {
              providerName,
              bookingHumanId,
              amount: amount.toFixed(2),
              currencySymbol: '₹'
            }
          })
        );
        await Promise.allSettled(pushPromises);
      } catch (err) {
        console.error("Error triggering admin dispute push notification:", err);
      }
    }

    return { success: true, message: "Complaint submitted successfully to admin." };
  } catch (error: any) {
    console.error("Error submitting wallet complaint:", error);
    return { success: false, message: error.message || "Failed to submit complaint." };
  }
}

// 8. Fetch pending wallet complaints (Admin) (MySQL)
export async function getPendingWalletComplaintsAction(): Promise<WalletComplaint[]> {
  try {
    const snap = await getDocs(query(collection(db, 'providerComplaints'), orderBy('createdAt', 'desc')));

    const complaints: WalletComplaint[] = [];
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      complaints.push({
        id: docSnap.id,
        providerId: data.providerId,
        providerName: data.providerName,
        bookingId: data.bookingId,
        bookingHumanId: data.bookingHumanId || data.bookingId,
        message: data.message,
        amount: data.amount || 0,
        status: data.status || 'pending',
        createdAt: data.createdAt?.toMillis() || Date.now(),
        resolvedAt: data.resolvedAt?.toMillis(),
        resolutionNotes: data.resolutionNotes,
      });
    });

    return complaints;
  } catch (error) {
    console.error("Error loading wallet complaints:", error);
    return [];
  }
}

// 9. Resolve wallet complaint (Admin manually refunds or dismisses) (MySQL)
export async function resolveWalletComplaintAction(
  complaintId: string,
  approveRefund: boolean,
  refundAmount: number,
  resolutionNotes: string
) {
  try {
    const complaintRef = doc(db, 'providerComplaints', complaintId);
    const compSnap = await getDoc(complaintRef);
    if (!compSnap.exists()) {
      throw new Error("Complaint record not found.");
    }
    const compData = compSnap.data() as any;
    if (compData.status === 'resolved') {
      throw new Error("This complaint has already been resolved.");
    }

    const providerId = compData.providerId;
    const providerUserRef = doc(db, 'users', providerId);

    if (approveRefund) {
      const pSnap = await getDoc(providerUserRef);
      if (!pSnap.exists()) {
        throw new Error("Provider profile not found.");
      }
      
      const currentWalletBalance = pSnap.data()?.providerWalletBalance || 0;
      const newBalance = currentWalletBalance + refundAmount;
      
      // 1. Credit provider wallet in MySQL
      await updateDoc(providerUserRef, { providerWalletBalance: newBalance });

      // 2. Add refund ledger item in MySQL
      await addDoc(collection(db, 'providerWalletTransactions'), {
        providerId,
        amount: refundAmount,
        type: 'commission_refund',
        bookingId: compData.bookingId,
        description: `Dispute Refund: ${resolutionNotes}`,
        timestamp: Timestamp.now(),
      });

      // 3. Mark booking as refunded in MySQL
      const bookingRef = doc(db, 'bookings', compData.bookingId);
      await updateDoc(bookingRef, { commissionRefunded: true });

      // 4. Send approval notification in MySQL
      await addDoc(collection(db, 'userNotifications'), {
        userId: providerId,
        title: "Wallet Dispute Approved",
        message: `Your dispute for booking #${compData.bookingHumanId} was approved. ₹${refundAmount.toFixed(2)} refunded. Notes: ${resolutionNotes}`,
        type: 'success',
        href: '/provider/wallet',
        read: false,
        createdAt: Timestamp.now(),
      });
    } else {
      // Send rejection notification in MySQL
      await addDoc(collection(db, 'userNotifications'), {
        userId: compData.providerId,
        title: "Wallet Dispute Rejected",
        message: `Your dispute for booking #${compData.bookingHumanId} was closed. Notes: ${resolutionNotes}`,
        type: 'info',
        href: '/provider/wallet',
        read: false,
        createdAt: Timestamp.now(),
      });
    }

    // Mark complaint as resolved in MySQL
    await updateDoc(complaintRef, {
      status: 'resolved',
      resolutionNotes,
      resolvedAt: Timestamp.now(),
    });

    // Send push notification to the provider
    try {
      if (approveRefund) {
        await sendServerPushNotification({
          userId: providerId,
          title: "Wallet Adjusted!",
          body: `Your prepaid wallet has been credited with ₹${refundAmount.toFixed(2)}.`,
          href: '/provider/wallet',
          type: 'provider_wallet_refund',
          variables: {
            amount: refundAmount.toFixed(2),
            reason: `Dispute Approved: ${resolutionNotes}`,
            currencySymbol: '₹'
          }
        });
      } else {
        await sendServerPushNotification({
          userId: providerId,
          title: "Wallet Dispute Closed",
          body: `Your dispute for booking #${compData.bookingHumanId} was resolved without refund.`,
          href: '/provider/wallet',
          type: 'withdrawal_status',
          variables: {
            status: 'Closed',
            amount: refundAmount.toFixed(2)
          }
        });
      }
    } catch (pushErr) {
      console.error("Error triggering resolve dispute push alert:", pushErr);
    }

    revalidatePath('/provider/wallet');
    return { success: true, message: approveRefund ? "Dispute approved and refunded." : "Dispute closed without refund." };
  } catch (error: any) {
    console.error("Error resolving wallet complaint:", error);
    return { success: false, message: error.message || "Failed to resolve complaint." };
  }
}

// 10. Server-side helper to send push notifications directly via admin.messaging()
export async function sendServerPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  href?: string;
  icon?: string;
  sound?: string;
  type?: string;
  variables?: Record<string, string | number | undefined>;
}) {
  try {
    const { userId, title, body, href, icon, sound, type: customType, variables } = params;

    let finalTitle = title;
    let finalBody = body;

    // Check if push notification category is enabled
    const pushType = customType || 'other';
    if (pushType !== 'other') {
      const template = await getPushTemplate(pushType);
      if (!template.isEnabled) {
        console.log(`Push notification type "${pushType}" is disabled in settings. Skipping dispatch.`);
        return { success: true, message: 'Push notification is disabled.' };
      }

      // Replace placeholders
      if (template.subject && template.body) {
        const mergedVariables = {
          title,
          body,
          ...(variables || {})
        };
        finalTitle = replacePlaceholders(template.subject, mergedVariables);
        finalBody = replacePlaceholders(template.body, mergedVariables);
      }
    }

    // Get user's FCM tokens from Firestore (which has tokens)
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { error: 'User not found' };
    }

    const userData = userDoc.data();
    const fcmTokensObj = userData?.fcmTokens || {};
    const tokens = Object.keys(fcmTokensObj);

    if (tokens.length === 0) {
      return { error: 'No FCM tokens found' };
    }

    // Send push
    const messaging = admin.messaging();
    const messagePayload = {
      notification: {
        title: finalTitle,
        body: finalBody,
      },
      data: {
        click_action: href || '/',
        icon: icon || '/android-chrome-192x192.png',
        sound: sound || 'default',
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title: finalTitle,
          body: finalBody,
          icon: icon || '/android-chrome-192x192.png',
          click_action: href || '/',
          requireInteraction: sound === 'order',
        }
      }
    };

    const response = await messaging.sendEachForMulticast({
      tokens,
      ...messagePayload,
    });

    return { success: true, response };
  } catch (error) {
    console.error("sendServerPushNotification error:", error);
    return { error };
  }
}
