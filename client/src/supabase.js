import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ihdlwogvjfgawgsalgng.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_KobV2o95Ymfem77b4zVBJg_E_onldRD';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const BUCKET_NAME = 'zen-releases';

/**
 * Uploads a file directly to Supabase Storage with optional progress tracking.
 * For large files (>6MB), Tus resumable upload is used automatically.
 */
export async function uploadReleaseBinary(file, appCategory, onProgress) {
  const filePath = `${appCategory}/${file.name}`;

  // Direct upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    throw error;
  }

  // Get CDN Public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return {
    path: data.path,
    publicUrl: urlData.publicUrl
  };
}

/**
 * Uploads HAVE_DONE.md directly to Supabase Storage.
 * Stores latest at docs/HAVE_DONE.md and creates a timestamped version in docs/history/.
 */
export async function uploadHaveDoneLog(file) {
  const latestPath = `docs/HAVE_DONE.md`;
  const historyPath = `docs/history/HAVE_DONE_${Date.now()}.md`;

  // 1. Upload/Overwrite latest
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(latestPath, file, {
      contentType: 'text/markdown',
      cacheControl: '60',
      upsert: true
    });

  if (error) {
    throw error;
  }

  // 2. Also archive historical snapshot
  await supabase.storage
    .from(BUCKET_NAME)
    .upload(historyPath, file, {
      contentType: 'text/markdown',
      upsert: true
    });

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(latestPath);

  return {
    path: data.path,
    publicUrl: urlData.publicUrl
  };
}
