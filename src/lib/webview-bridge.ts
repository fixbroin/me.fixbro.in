"use client";

// --- Global Callbacks for Flutter to Trigger ---
if (typeof window !== 'undefined') {
  // Authentication Callbacks
  (window as any).onGoogleSignInSuccess = (data: any) => {
    console.log("Flutter Bridge: onGoogleSignInSuccess received", data?.email);
    window.dispatchEvent(new CustomEvent('nativeGoogleSignIn', { detail: data }));
  };

  (window as any).onGoogleSignInError = (error: string) => {
    console.warn("Flutter Bridge: onGoogleSignInError received", error);
    window.dispatchEvent(new CustomEvent('nativeGoogleSignInError', { detail: { error } }));
  };

  // Payment Callbacks
  let activeRazorpayOptions: any = null;

  (window as any).onNativeRazorpaySuccess = (paymentDetails: any) => {
    console.log("Flutter Bridge: onNativeRazorpaySuccess received", paymentDetails?.razorpay_payment_id);
    window.dispatchEvent(new CustomEvent('nativePaymentSuccess', { detail: paymentDetails }));

    if (activeRazorpayOptions && typeof activeRazorpayOptions.handler === 'function') {
      try {
        activeRazorpayOptions.handler(paymentDetails);
      } catch (e) {
        console.error("Error executing Razorpay success handler:", e);
      }
    }
  };

  (window as any).onNativeRazorpayError = (errorDetails: any) => {
    console.warn("Flutter Bridge: onNativeRazorpayError received", errorDetails);
    window.dispatchEvent(new CustomEvent('nativePaymentError', { detail: errorDetails }));

    if (activeRazorpayOptions && activeRazorpayOptions.modal && typeof activeRazorpayOptions.modal.ondismiss === 'function') {
      try {
        activeRazorpayOptions.modal.ondismiss();
      } catch (e) {
        console.error("Error executing Razorpay dismiss handler:", e);
      }
    }
  };

  // Native Razorpay Proxy for seamless drop-in integration
  (window as any)._setupNativeRazorpayProxy = () => {
    if ((window as any).isFlutterNativeApp) {
      (window as any).Razorpay = function (options: any) {
        activeRazorpayOptions = options;
        return {
          open: () => {
            console.log("Flutter Bridge: Delegating payment to Native Razorpay SDK", options?.order_id);
            postToFlutter({
              action: 'openRazorpay',
              key: options.key,
              amount: options.amount,
              currency: options.currency || 'INR',
              order_id: options.order_id,
              name: options.name || 'WeCanFix',
              description: options.description || 'Service Booking',
              prefill: options.prefill || {},
              theme: options.theme || { color: '#2563EB' },
            });
          },
          on: (event: string, callback: Function) => {
            // Support rzp.on('payment.failed', ...)
            if (event === 'payment.failed') {
              window.addEventListener('nativePaymentError', (e: any) => {
                callback({ error: { description: e.detail?.message || 'Payment cancelled or failed' } });
              }, { once: true });
            }
          }
        };
      };
    }
  };

  // Run proxy setup if Flutter is already ready
  if ((window as any).isFlutterNativeApp) {
    (window as any)._setupNativeRazorpayProxy();
  } else {
    window.addEventListener('flutterNativeReady', () => {
      (window as any)._setupNativeRazorpayProxy();
    });
  }
}

/**
 * Checks if the application is running inside the Flutter WebView container.
 */
export const isWebView = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  if (
    (window as any).isFlutterNativeApp ||
    (window as any).FlutterBridge ||
    (window as any).flutter_inappwebview
  ) {
    try { sessionStorage.setItem('is_flutter_app', 'true'); } catch (e) {}
    return true;
  }

  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('wecanfixapp') || ua.includes('wecanfix') || ua.includes('flutter')) {
    try { sessionStorage.setItem('is_flutter_app', 'true'); } catch (e) {}
    return true;
  }

  try {
    if (sessionStorage.getItem('is_flutter_app') === 'true') return true;
  } catch (e) {}

  return false;
};

/**
 * Detects if the current user session is running inside the Flutter mobile app or a standard web browser.
 */
export const getPlatformSource = (): { source: 'app' | 'web'; platform: string; appVariant?: string } => {
  if (typeof window === 'undefined') {
    return { source: 'web', platform: 'Web (Server)' };
  }

  // 1. Direct Flutter bridge check
  const isFlutter = Boolean(
    (window as any).isFlutterNativeApp ||
    (window as any).FlutterBridge ||
    (window as any).flutter_inappwebview
  );

  const rawVariant = (window as any).flutterAppVariant;

  // 2. User-Agent check (wecanfixapp or Flutter token)
  const ua = (navigator.userAgent || '').toLowerCase();
  const isAppUA = ua.includes('wecanfixapp') || ua.includes('wecanfix') || ua.includes('flutter');

  // 3. Session storage persistence across page redirects
  let isSessionApp = false;
  let sessionVariant: string | null = null;
  try {
    isSessionApp = sessionStorage.getItem('is_flutter_app') === 'true';
    sessionVariant = sessionStorage.getItem('flutter_app_variant');
  } catch (e) {}

  if (isFlutter || isAppUA || isSessionApp) {
    const variant = rawVariant || sessionVariant || 'customer';
    try {
      sessionStorage.setItem('is_flutter_app', 'true');
      sessionStorage.setItem('flutter_app_variant', variant);
    } catch (e) {}

    const variantLabel = variant ? (variant.charAt(0).toUpperCase() + variant.slice(1)) : 'Android';
    return {
      source: 'app',
      platform: `App (${variantLabel})`,
      appVariant: variant,
    };
  }

  // 4. Standard Browser Web detection
  const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/i.test(ua);

  return {
    source: 'web',
    platform: isTablet ? 'Web (Tablet)' : isMobile ? 'Web (Mobile)' : 'Web (Desktop)',
  };
};

/**
 * Safely posts a JSON action payload to the Flutter native bridge.
 */
export const postToFlutter = (data: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  try {
    if ((window as any).FlutterBridge && typeof (window as any).FlutterBridge.postMessage === 'function') {
      (window as any).FlutterBridge.postMessage(JSON.stringify(data));
    } else if ((window as any).flutter_inappwebview && typeof (window as any).flutter_inappwebview.callHandler === 'function') {
      (window as any).flutter_inappwebview.callHandler(data.action, data);
    }
  } catch (e) {
    console.error("Error communicating with Flutter bridge:", e);
  }
};

/**
 * Sends a message to Flutter to trigger the native Google Sign-In sheet.
 */
export const requestNativeGoogleSignIn = () => {
  if (isWebView()) {
    console.log("requestNativeGoogleSignIn: Triggering native Google Sign-In dialog");
    postToFlutter({ action: 'requestGoogleSignIn' });
  } else {
    console.warn("requestNativeGoogleSignIn called, but not in a WebView environment.");
  }
};

/**
 * Requests native Razorpay payment SDK with UPI app integration.
 */
export const requestNativePayment = (paymentDetails: {
  key?: string;
  amount: number;
  currency?: string;
  order_id: string;
  name?: string;
  description?: string;
  prefill?: any;
  theme?: any;
}) => {
  if (isWebView()) {
    postToFlutter({
      action: 'openRazorpay',
      ...paymentDetails,
    });
  } else {
    console.warn("requestNativePayment called, but not in a WebView environment.");
  }
};

/**
 * Retrieves the FCM device token provided by the Flutter native layer.
 */
export const getNativeFcmToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return (window as any).fcmDeviceToken || null;
};

/**
 * Synchronizes the FCM device token with Flutter.
 */
export const syncNativeFcmToken = (userId: string) => {
  if (isWebView()) {
    postToFlutter({ action: 'syncFcmToken', userId });
  }
};

/**
 * Requests the native Flutter app to handle a file or PDF invoice download.
 */
export const requestFileDownload = (url: string, fileName?: string) => {
  if (isWebView()) {
    postToFlutter({ action: 'downloadFile', url, fileName });
  } else {
    // Standard web download
    const link = document.createElement('a');
    link.href = url;
    if (fileName) link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Sends push notification data to the native Flutter app when received in WebView foreground.
 */
export const sendPushNotificationData = (payload: any) => {
  if (isWebView()) {
    postToFlutter({ action: 'pushNotificationData', payload });
  }
};

