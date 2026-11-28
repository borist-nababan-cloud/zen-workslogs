import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email wajib diisi.')
    .email('Format email tidak valid.'),
  password: z
    .string()
    .min(6, 'Kata sandi minimal 6 karakter.'),
});

export const workLogSchema = z.object({
  tanggal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid (YYYY-MM-DD).'),
  apps_name: z
    .string()
    .trim()
    .min(2, 'Nama aplikasi wajib dipilih.')
    .max(100, 'Nama aplikasi maksimal 100 karakter.'),
  path: z
    .string()
    .trim()
    .min(1, 'Path proyek wajib diisi.')
    .max(200, 'Path proyek maksimal 200 karakter.'),
  aksi: z.enum(['Dibuat Baru', 'Diperbarui', 'Perbaikan Bug', 'Infrastruktur'], {
    errorMap: () => ({ message: 'Tipe aksi tidak valid.' }),
  }),
  title: z
    .string()
    .trim()
    .min(3, 'Judul catatan minimal 3 karakter.')
    .max(200, 'Judul catatan maksimal 200 karakter.'),
  commit_hash: z
    .string()
    .trim()
    .max(100, 'Hash commit maksimal 100 karakter.')
    .regex(/^[0-9a-fA-F,\s-]*$/, 'Format commit hash hanya boleh alfanumerik heksadesimal.')
    .optional()
    .or(z.literal('')),
  have_done: z
    .string()
    .trim()
    .min(5, 'Detail perubahan minimal 5 karakter.')
    .max(20000, 'Detail perubahan melebihi batas 20.000 karakter.'),
  tested: z.boolean(),
  trained: z.boolean(),
});

export const releaseUploadSchema = z.object({
  app_category: z.enum([
    'zen_desktop',
    'zen_sync',
    'internal_android',
    'customer_android',
    'dashboard_tv',
  ]),
  version: z
    .string()
    .trim()
    .max(40, 'Versi rilis maksimal 40 karakter.')
    .regex(/^[a-zA-Z0-9._\-\s]*$/, 'Format versi hanya boleh huruf, angka, titik, atau strip.')
    .optional()
    .or(z.literal('')),
  notes: z
    .string()
    .trim()
    .max(2000, 'Catatan rilis maksimal 2.000 karakter.')
    .optional()
    .or(z.literal('')),
  target_outlets_raw: z
    .string()
    .trim()
    .max(200, 'Daftar kode outlet maksimal 200 karakter.')
    .regex(/^[a-zA-Z0-9,\s]*$/, 'Format kode outlet hanya boleh huruf, angka, dan koma (contoh: 101, 116).')
    .optional()
    .or(z.literal('')),
  is_mandatory: z.boolean().optional().default(false),
});

export const watchdogTokenSchema = z.object({
  node_id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9_-]{1,63}$/,
      'ID Node hanya boleh 2-64 huruf kecil, angka, tanda hubung (-), atau garis bawah (_).'
    ),
  label: z
    .string()
    .trim()
    .min(2, 'Label server minimal 2 karakter.')
    .max(80, 'Label server maksimal 80 karakter.'),
});

export function formatZodError(zodResult) {
  if (zodResult.success) return null;
  return zodResult.error?.issues?.[0]?.message || 'Data masukan tidak valid.';
}
