import { useEffect, useState } from 'react';
import { sanitizeCoverUrl } from '../utils/cover';
import { generateId } from '../utils/crypto';

const DB_NAME = 'booklibrary_covers_v1';
const STORE_NAME = 'covers';

const memoryCovers = new Map<string, string>();

function openCoversDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSetCover(key: string, dataUrl: string): Promise<void> {
  const db = await openCoversDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbGetCover(key: string): Promise<string | undefined> {
  const db = await openCoversDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(blob);
  });
}

export async function compressImageToWebPDataUrl(
  file: Blob,
  maxWidth = 320,
  maxHeight = 480,
  quality = 0.78,
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return blobToDataUrl(file);
  }

  const objectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : await blobToDataUrl(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode cover image.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxWidth / Math.max(1, img.width), maxHeight / Math.max(1, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return blobToDataUrl(file);
    }
    ctx.drawImage(img, 0, 0, width, height);

    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) {
      return webp;
    }
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    if (objectUrl.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export async function saveCustomCover(file: Blob): Promise<string> {
  const dataUrl = await compressImageToWebPDataUrl(file);
  const key = `idb-cover:${generateId('cov')}`;
  memoryCovers.set(key, dataUrl);
  await idbSetCover(key, dataUrl);
  return key;
}

export async function resolveCoverUrl(url?: string): Promise<string | undefined> {
  const clean = sanitizeCoverUrl(url);
  if (!clean) return undefined;
  if (!clean.startsWith('idb-cover:')) return clean;

  const cached = memoryCovers.get(clean);
  if (cached) return cached;

  const stored = await idbGetCover(clean);
  if (stored) {
    memoryCovers.set(clean, stored);
  }
  return stored;
}

export function useResolvedCover(rawUrl?: string): string | undefined {
  const clean = sanitizeCoverUrl(rawUrl);
  const syncValue = clean?.startsWith('idb-cover:') ? memoryCovers.get(clean) : clean;
  const [resolved, setResolved] = useState<string | undefined>(syncValue);

  useEffect(() => {
    if (!clean) {
      setResolved(undefined);
      return;
    }
    if (!clean.startsWith('idb-cover:')) {
      setResolved(clean);
      return;
    }

    const cached = memoryCovers.get(clean);
    if (cached) {
      setResolved(cached);
      return;
    }

    let cancelled = false;
    void resolveCoverUrl(clean).then((url) => {
      if (!cancelled) {
        setResolved(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clean]);

  return resolved;
}
