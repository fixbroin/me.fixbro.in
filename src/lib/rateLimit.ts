interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * In-memory sliding window rate limiter.
 * Protects privileged and sensitive endpoints from brute force and enumeration attacks.
 */
export class RateLimiter {
  private store = new Map<string, RateLimitRecord>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodically clean up expired records
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, val] of this.store.entries()) {
          if (now > val.resetTime) {
            this.store.delete(key);
          }
        }
      }, 5 * 60 * 1000);
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as any).unref();
      }
    }
  }

  public check(identifier: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const record = this.store.get(identifier);

    if (!record || now > record.resetTime) {
      this.store.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true, remaining: this.maxRequests - 1, retryAfterSeconds: 0 };
    }

    if (record.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    record.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      retryAfterSeconds: 0,
    };
  }
}

/**
 * Extracts client IP safely from common proxy headers.
 */
export function getClientIp(req: Request | any): string {
  try {
    const headers = req.headers;
    const forwarded = typeof headers?.get === 'function' 
      ? headers.get('x-forwarded-for') 
      : headers?.['x-forwarded-for'];
      
    if (forwarded && typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }

    const realIp = typeof headers?.get === 'function' 
      ? headers.get('x-real-ip') 
      : headers?.['x-real-ip'];
      
    if (realIp && typeof realIp === 'string') {
      return realIp.trim();
    }
  } catch (e) {
    // Fallback if headers object is unavailable
  }

  return '127.0.0.1';
}
