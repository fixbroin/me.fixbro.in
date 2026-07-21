// src/lib/mysqlStorage.ts

export const storage = { type: 'storage' };
export const getStorage = () => storage;

// Global map to hold resolved URLs for uploaded references
const resolvedUrls = new Map<string, string>();

class MySQLStorageRef {
  type = 'storageRef';
  path: string; // can be "public/uploads/categories/abc.png" or "/uploads/categories/abc.png"

  constructor(path: string) {
    this.path = path;
  }
}

export function ref(storageInstance: any, path: string) {
  return new MySQLStorageRef(path);
}

/**
 * Extracts folder name from the storage ref path.
 * e.g., "public/uploads/categories/filename.png" -> "categories"
 */
function getUploadPath(refPath: string): string {
  const match = refPath.match(/uploads\/([^/]+)/);
  return match ? match[1] : 'general';
}

export function uploadBytesResumable(refInstance: MySQLStorageRef, file: File | Blob) {
  const uploadPath = getUploadPath(refInstance.path);
  
  // Custom mock UploadTask object
  let progressCallback: any = null;
  let errorCallback: any = null;
  let completeCallback: any = null;

  const task = {
    snapshot: {
      ref: refInstance
    },
    on: (
      event: string, 
      onProgress?: (snapshot: any) => void, 
      onError?: (error: any) => void, 
      onComplete?: () => void
    ) => {
      progressCallback = onProgress;
      errorCallback = onError;
      completeCallback = onComplete;
      
      // Start actual upload process asynchronously
      (async () => {
        try {
          if (progressCallback) progressCallback({ bytesTransferred: 20, totalBytes: 100 });

          const formData = new FormData();
          formData.append('file', file);
          formData.append('uploadPath', uploadPath);

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Upload failed');
          }

          // Store the resolved public URL
          resolvedUrls.set(refInstance.path, data.url);

          if (progressCallback) progressCallback({ bytesTransferred: 100, totalBytes: 100 });
          if (completeCallback) completeCallback();
        } catch (error: any) {
          if (errorCallback) errorCallback(error);
        }
      })();
    }
  };

  return task;
}

export async function uploadBytes(refInstance: MySQLStorageRef, file: File | Blob, metadata: any = {}) {
  const uploadPath = getUploadPath(refInstance.path);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadPath', uploadPath);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Upload failed');
  }

  resolvedUrls.set(refInstance.path, data.url);
  return { ref: refInstance };
}

export async function getDownloadURL(refInstance: MySQLStorageRef): Promise<string> {
  // If we already have the URL resolved from a recent upload
  if (resolvedUrls.has(refInstance.path)) {
    return resolvedUrls.get(refInstance.path) || '';
  }

  // If the ref path is already a direct URL (e.g. starting with /uploads/)
  if (refInstance.path.startsWith('/uploads/')) {
    return refInstance.path;
  }

  // Fallback to converting standard path public/uploads/... to /uploads/...
  const cleanPath = refInstance.path.replace(/^public\//, '/');
  if (cleanPath.startsWith('/uploads/')) {
    return cleanPath;
  }

  return refInstance.path;
}

export async function deleteObject(refInstance: any): Promise<void> {
  const targetUrl = typeof refInstance === 'string' 
    ? refInstance 
    : (refInstance?.path || refInstance?.name || String(refInstance || ''));
    
  if (!targetUrl || targetUrl.trim() === '') return;

  let cleanUrl = targetUrl.trim();
  if (cleanUrl.startsWith('public/')) {
    cleanUrl = cleanUrl.replace(/^public\//, '/');
  }

  try {
    const res = await fetch('/api/upload', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileUrl: cleanUrl })
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn("deleteObject warning:", data?.error || 'Deletion warning');
    }
  } catch (err) {
    console.error("deleteObject error:", err);
  }
}
