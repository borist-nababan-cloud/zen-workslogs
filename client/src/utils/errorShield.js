export const GENERIC_SYSTEM_ERROR =
  'Terjadi kesalahan pada sistem, silakan hubungi tim IT.';

export function mapSafeErrorMessage(err, fallback = GENERIC_SYSTEM_ERROR) {
  if (!err) return fallback;

  if (err.isUserMessage && typeof err.message === 'string' && err.message.trim()) {
    return err.message;
  }

  const raw = [err.message, err.error_description, err.code, err.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (raw.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah.';
  }
  if (raw.includes('email not confirmed')) {
    return 'Email akun belum terverifikasi.';
  }
  if (
    raw.includes('timeouterror') ||
    raw.includes('timed out') ||
    raw.includes('failed to fetch') ||
    raw.includes('networkerror') ||
    raw.includes('network request failed')
  ) {
    return 'Koneksi ke server lambat atau terputus. Silakan periksa jaringan lalu coba lagi.';
  }
  if (
    raw.includes('42501') ||
    raw.includes('row-level security') ||
    raw.includes('unauthorized') ||
    raw.includes('forbidden') ||
    err.status === 401 ||
    err.status === 403
  ) {
    return 'Akses ditolak. Fitur ini hanya tersedia untuk SUPERUSER (Role ID 8).';
  }
  if (raw.includes('23505') || raw.includes('duplicate key')) {
    return 'Data duplikat terdeteksi. Silakan periksa kembali isian Anda.';
  }

  return fallback;
}
