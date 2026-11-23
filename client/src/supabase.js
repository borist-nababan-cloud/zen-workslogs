import { createClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const IS_SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const BUCKET_NAME = 'zen-releases';
export const SUPERUSER_ROLE_ID = 8;

const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const DEFAULT_FETCH_TIMEOUT_MS = 25000;
const STORAGE_FETCH_TIMEOUT_MS = 120000;

const processLocks = new Map();

function createUserError(message) {
  const err = new Error(message);
  err.isUserMessage = true;
  return err;
}

async function processLockFallback(name, acquireTimeout, fn) {
  const previous = processLocks.get(name) ?? Promise.resolve();
  let timedOut = false;
  const raceItems = [previous.catch(() => null)];
  let timer;

  if (acquireTimeout >= 0) {
    raceItems.push(
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const err = new Error(`Acquiring process lock "${name}" timed out`);
          err.isAcquireTimeout = true;
          reject(err);
        }, acquireTimeout);
      })
    );
  }

  const currentOp = (async () => {
    try {
      await Promise.race(raceItems);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    if (timedOut) {
      const err = new Error(`Acquiring process lock "${name}" timed out`);
      err.isAcquireTimeout = true;
      throw err;
    }
    return await fn();
  })();

  const queued = currentOp.catch(() => null);
  processLocks.set(name, queued);
  queued.finally(() => {
    if (processLocks.get(name) === queued) {
      processLocks.delete(name);
    }
  });

  return await currentOp;
}

const resilientAuthLock = async (name, acquireTimeout, fn) => {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return await processLockFallback(name, acquireTimeout, fn);
  }

  if (acquireTimeout === 0) {
    try {
      return await navigator.locks.request(
        name,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (!lock) {
            const err = new Error(`Navigator lock "${name}" busy`);
            err.isAcquireTimeout = true;
            throw err;
          }
          return await fn();
        }
      );
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === 'SecurityError' || err.name === 'NotSupportedError')
      ) {
        return await processLockFallback(name, acquireTimeout, fn);
      }
      throw err;
    }
  }

  const effectiveTimeout =
    acquireTimeout < 0
      ? LOCK_ACQUIRE_TIMEOUT_MS
      : Math.min(acquireTimeout, LOCK_ACQUIRE_TIMEOUT_MS);
  const controller = new AbortController();
  let timedOut = false;
  let acquired = false;
  let timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, effectiveTimeout);

  try {
    return await navigator.locks.request(
      name,
      { mode: 'exclusive', signal: controller.signal },
      async (lock) => {
        acquired = true;
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (!lock) {
          return await processLockFallback(name, effectiveTimeout, fn);
        }
        return await fn();
      }
    );
  } catch (err) {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (acquired) throw err;

    const isLockAbort =
      timedOut ||
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError');

    if (!isLockAbort) {
      if (
        err instanceof DOMException &&
        (err.name === 'SecurityError' || err.name === 'NotSupportedError')
      ) {
        return await processLockFallback(name, effectiveTimeout, fn);
      }
      throw err;
    }

    let stealAcquired = false;
    try {
      return await navigator.locks.request(name, { steal: true }, async () => {
        stealAcquired = true;
        return await fn();
      });
    } catch (stealErr) {
      if (stealAcquired) throw stealErr;
      return await processLockFallback(name, -1, fn);
    }
  }
};

const fetchWithTimeout = async (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input?.url || '';
  const timeoutMs = url.includes('/storage/v1/')
    ? STORAGE_FETCH_TIMEOUT_MS
    : DEFAULT_FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const upstreamSignal = init?.signal;

  if (upstreamSignal?.aborted) {
    controller.abort(upstreamSignal.reason);
  }
  const onAbort = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal && !upstreamSignal.aborted) {
    upstreamSignal.addEventListener('abort', onAbort, { once: true });
  }

  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (upstreamSignal) {
      upstreamSignal.removeEventListener('abort', onAbort);
    }
  }
};

export const supabase = IS_SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        lock: resilientAuthLock,
      },
      global: {
        fetch: fetchWithTimeout,
      },
    })
  : null;

export const APP_CATEGORIES = [
  {
    id: 'zen_desktop',
    name: 'Zen Desktop System',
    shortName: 'Zen Desktop',
    extLabel: '.exe / .zip',
    accept: '.exe,.zip',
    extensions: ['.exe', '.zip'],
    description: 'Aplikasi kasir POS, HRD, dan backoffice desktop Windows (Delphi)',
  },
  {
    id: 'zen_sync',
    name: 'Zen Sync App',
    shortName: 'Zen Sync',
    extLabel: '.exe / .zip',
    accept: '.exe,.zip',
    extensions: ['.exe', '.zip'],
    description: 'Agen sinkronisasi latar belakang MySQL cabang ke Supabase Cloud',
  },
  {
    id: 'internal_android',
    name: 'Internal Android App',
    shortName: 'Internal App',
    extLabel: '.apk',
    accept: '.apk',
    extensions: ['.apk'],
    description: 'Aplikasi Android operasional internal staf & terapis cabang',
  },
  {
    id: 'customer_android',
    name: 'Customer Test Android App',
    shortName: 'Customer App',
    extLabel: '.apk',
    accept: '.apk',
    extensions: ['.apk'],
    description: 'Paket Android APK pengujian pelanggan Zen Family Spa',
  },
  {
    id: 'dashboard_tv',
    name: 'Zen Dashboard Android TV',
    shortName: 'Dashboard TV',
    extLabel: '.apk',
    accept: '.apk',
    extensions: ['.apk'],
    description: 'Aplikasi Android TV monitor cabang & kantor pusat (Leanback APK)',
  },
];

export const STANDARD_APPS = [
  { name: 'WHMS App', path: 'frontend\\warehousemanagement' },
  { name: 'ZenSystem Desktop', path: 'desktop\\ZenSystem' },
  { name: 'SyncAgent', path: 'desktop\\SyncAgent' },
  { name: 'Supabase Backend', path: 'backend\\supabase' },
  { name: 'ZenDashboard', path: 'frontend\\dashboard' },
  { name: 'ZenInternal App', path: 'frontend\\internalapp' },
  { name: 'Website Static', path: 'frontend\\website' },
  { name: 'WorkLogs App', path: 'frontend\\worklogs' },
  { name: 'AI Backend', path: 'frontend\\aibackend' },
  { name: 'Ecosystem / Global', path: '.' },
];

export function resolveReleaseMimeType(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (lower.endsWith('.exe')) return 'application/octet-stream';
  return file.type || 'application/octet-stream';
}

export function sanitizeReleaseFilename(name) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

export function buildDownloadUrl(downloadUrl, filename) {
  if (!downloadUrl) return '#';
  if (!filename) return downloadUrl;
  const sep = downloadUrl.includes('?') ? '&' : '?';
  return `${downloadUrl}${sep}download=${encodeURIComponent(filename)}`;
}

/**
 * Mengunggah binary rilis (.exe, .zip, .apk) ke Supabase Storage bucket `zen-releases`.
 * Menggunakan TUS Resumable Upload untuk berkas > 6 MB agar stabil dan mendukung progress bar.
 */
export async function uploadReleaseBinary(file, appCategory, onProgress) {
  if (!supabase || !IS_SUPABASE_CONFIGURED) {
    throw createUserError('Konfigurasi koneksi server belum lengkap, silakan hubungi tim IT.');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw createUserError('Sesi login tidak aktif. Silakan masuk sebagai SUPERUSER (Role ID 8).');
  }

  const sanitizedName = sanitizeReleaseFilename(file.name);
  const storagePath = `${appCategory}/${sanitizedName}`;
  const contentType = resolveReleaseMimeType(file);
  const TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;

  if (file.size > TUS_THRESHOLD_BYTES) {
    await new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: BUCKET_NAME,
          objectName: storagePath,
          contentType,
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024,
        onError(err) {
          reject(err);
        },
        onProgress(bytesUploaded, bytesTotal) {
          if (onProgress && bytesTotal > 0) {
            onProgress(Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)));
          }
        },
        onSuccess() {
          if (onProgress) onProgress(100);
          resolve();
        },
      });

      upload
        .findPreviousUploads()
        .then((previousUploads) => {
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          upload.start();
        })
        .catch(() => {
          upload.start();
        });
    });
  } else {
    if (onProgress) onProgress(25);
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, file, {
      cacheControl: '3600',
      contentType,
      upsert: true,
    });
    if (error) throw error;
    if (onProgress) onProgress(100);
  }

  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: urlData.publicUrl,
    sanitizedName,
    contentType,
  };
}

export async function deleteReleaseObject(storagePath) {
  if (!storagePath || !supabase) return;
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
  if (error) throw error;
}
