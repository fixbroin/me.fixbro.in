// src/app/actions/dbActions.ts
'use server';

import { getPool, getDocInternal, getDocsInternal, addDocInternal, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';

// Fast server-side in-memory cache for high-frequency configuration reads
const docCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds cache for static config reads

function getCachedDoc(fullPath: string) {
  const cached = docCache.get(fullPath);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  return null;
}

function setCachedDoc(fullPath: string, data: any) {
  docCache.set(fullPath, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function clearDocCache(pathPrefix?: string) {
  if (!pathPrefix) {
    docCache.clear();
    return;
  }
  for (const key of docCache.keys()) {
    if (key.includes(pathPrefix) || key.startsWith(pathPrefix)) {
      docCache.delete(key);
    }
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      const code = error?.code || '';
      const isRetryable = code === 'ECONNRESET' || code === 'PROTOCOL_CONNECTION_LOST' || code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'ER_LOCK_WAIT_TIMEOUT' || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enetunreach') || msg.includes('connection lost') || msg.includes('lock wait timeout');
      if (isRetryable && attempt < retries) {
        attempt++;
        (globalThis as any)._mysqlPool = undefined;
        await new Promise(r => setTimeout(r, 300 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Execution failed after retries");
}

export async function executeDbGetDoc(path: string, docId?: string) {
  return withRetry(async () => {
    try {
      const fullPath = docId ? `${path}/${docId}` : path;
      const isCacheable = fullPath.startsWith('webSettings') || fullPath.startsWith('seoSettings') || fullPath.startsWith('appConfiguration');
      
      if (isCacheable) {
        const cached = getCachedDoc(fullPath);
        if (cached) return cached;
      }

      const pool = await getPool();
      const result = await getDocInternal(pool, path, docId);

      if (isCacheable) {
        setCachedDoc(fullPath, result);
      }
      return result;
    } catch (error: any) {
      console.error(`Error in executeDbGetDoc on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbGetDocs(path: string, constraints: any[] = []) {
  return withRetry(async () => {
    try {
      const isCacheable = (path === 'adminCategories' || path === 'adminSubCategories' || path === 'adminServices' || path === 'adminSlideshows' || path === 'webSettings' || path === 'adminReviews' || path === 'blogPosts') && constraints.length === 0;
      const cacheKey = `getDocs:${path}:${JSON.stringify(constraints)}`;

      if (isCacheable) {
        const cached = getCachedDoc(cacheKey);
        if (cached) return cached;
      }

      const pool = await getPool();
      const result = await getDocsInternal(pool, path, constraints);

      if (isCacheable) {
        setCachedDoc(cacheKey, result);
      }
      return result;
    } catch (error: any) {
      console.error(`Error in executeDbGetDocs on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbAddDoc(path: string, data: any) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      return await addDocInternal(pool, path, data);
    } catch (error: any) {
      console.error(`Error in executeDbAddDoc on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbSetDoc(path: string, docId: string, data: any, options: any = {}) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      await setDocInternal(pool, path, docId, data, options);
      return { success: true };
    } catch (error: any) {
      console.error(`Error in executeDbSetDoc on ${path}/${docId}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbUpdateDoc(path: string, docId: string, data: any) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      await updateDocInternal(pool, path, docId, data);
      return { success: true };
    } catch (error: any) {
      console.error(`Error in executeDbUpdateDoc on ${path}/${docId}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbDeleteDoc(path: string, docId?: string) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      await deleteDocInternal(pool, path, docId);
      return { success: true };
    } catch (error: any) {
      console.error(`Error in executeDbDeleteDoc on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbBatch(operations: any[]) {
  return withRetry(async () => {
    clearDocCache();
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const op of operations) {
        if (op.action === 'setDoc') {
          await setDocInternal(conn, op.collection, op.id, op.data, op.options);
        } else if (op.action === 'updateDoc') {
          await updateDocInternal(conn, op.collection, op.id, op.data);
        } else if (op.action === 'deleteDoc') {
          await deleteDocInternal(conn, op.collection, op.id);
        }
      }

      await conn.commit();
      return { success: true };
    } catch (error: any) {
      await conn.rollback();
      console.error("Error in executeDbBatch:", error);
      throw new Error(error.message || 'Database transaction error');
    } finally {
      conn.release();
    }
  });
}
