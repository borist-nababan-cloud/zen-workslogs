import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Trash2,
  FileArchive,
  AlertCircle,
  Monitor,
  RefreshCw,
  Smartphone,
  Users,
  Tv,
  CheckCircle,
  Lock,
  UploadCloud,
  Loader2,
} from 'lucide-react';
import {
  supabase,
  IS_SUPABASE_CONFIGURED,
  APP_CATEGORIES,
  uploadReleaseBinary,
  deleteReleaseObject,
  buildDownloadUrl,
} from '../supabase';
import { useAuth } from '../context/AuthContext';
import { releaseUploadSchema, formatZodError } from '../utils/validation';
import { mapSafeErrorMessage } from '../utils/errorShield';

const CATEGORY_ICONS = {
  zen_desktop: Monitor,
  zen_sync: RefreshCw,
  internal_android: Smartphone,
  customer_android: Users,
  dashboard_tv: Tv,
};

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

function formatDateID(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FilesPage({ onRequestLogin }) {
  const { user, isSuperuser } = useAuth();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(APP_CATEGORIES[0].id);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchReleases = useCallback(async () => {
    if (!supabase || !IS_SUPABASE_CONFIGURED) {
      setError('Konfigurasi koneksi server belum lengkap, silakan hubungi tim IT.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('work_log_releases')
        .select('*')
        .order('uploaded_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setReleases(data || []);
    } catch (err) {
      setError(mapSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const activeCategory = APP_CATEGORIES.find((c) => c.id === selectedCategory) || APP_CATEGORIES[0];

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSuperuser || !supabase) {
      setError('Akses ditolak. Fitur ini hanya tersedia untuk SUPERUSER (Role ID 8).');
      e.target.value = '';
      return;
    }

    const parsedMeta = releaseUploadSchema.safeParse({
      app_category: selectedCategory,
      version,
      notes,
    });
    if (!parsedMeta.success) {
      setError(formatZodError(parsedMeta));
      e.target.value = '';
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isAllowedExt = activeCategory.extensions.some((ext) => lowerName.endsWith(ext));
    if (!isAllowedExt) {
      setError(
        `Untuk ${activeCategory.name}, mohon unggah berkas berformat ${activeCategory.extLabel}.`
      );
      e.target.value = '';
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setError('Ukuran file maksimal adalah 500 MB.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const existing = releases.find((r) => r.app_category === selectedCategory);

      const { storagePath, publicUrl, sanitizedName, contentType } = await uploadReleaseBinary(
        file,
        selectedCategory,
        setProgress
      );

      const { error: dbErr } = await supabase.from('work_log_releases').upsert(
        {
          app_category: parsedMeta.data.app_category,
          app_name: activeCategory.name,
          filename: sanitizedName,
          original_name: file.name,
          version: parsedMeta.data.version || null,
          mime_type: contentType,
          size: file.size,
          storage_path: storagePath,
          download_url: publicUrl,
          notes: parsedMeta.data.notes || null,
          uploaded_by: user?.id || null,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'app_category' }
      );

      if (dbErr) throw dbErr;

      if (existing?.storage_path && existing.storage_path !== storagePath) {
        try {
          await deleteReleaseObject(existing.storage_path);
        } catch {
          // Kegagalan pembersihan berkas lama tidak membatalkan rilis baru yang sudah terpublikasi
        }
      }

      setSuccess(`${activeCategory.name} (${file.name}) berhasil diunggah dan dipublikasikan ke CDN!`);
      setVersion('');
      setNotes('');
      await fetchReleases();
    } catch (err) {
      setError(mapSafeErrorMessage(err));
    } finally {
      setUploading(false);
      setProgress(0);
      e.target.value = '';
    }
  };

  const handleDelete = async (rel) => {
    if (!isSuperuser || !supabase) return;
    if (!window.confirm(`Hapus rilis ${rel.app_name} (${rel.filename}) dari Release Hub?`)) return;

    setDeletingId(rel.id);
    setError(null);
    setSuccess(null);
    try {
      if (rel.storage_path) {
        try {
          await deleteReleaseObject(rel.storage_path);
        } catch {
          // Lanjutkan penghapusan metadata bila objek storage sudah terhapus sebelumnya
        }
      }

      const { error: delErr } = await supabase
        .from('work_log_releases')
        .delete()
        .eq('id', rel.id);
      if (delErr) throw delErr;

      setSuccess(`Rilis ${rel.app_name} berhasil dihapus.`);
      await fetchReleases();
    } catch (err) {
      setError(mapSafeErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zen-charcoal">
          Release Hub Ekosistem Zen
        </h1>
        <p className="text-sm text-zen-charcoal/70 mt-1">
          Unduh rilis aplikasi terbaru (.exe, .zip, .apk) langsung melalui CDN Supabase Production.
        </p>
      </div>

      {/* Panel Upload (Khusus SUPERUSER Role ID 8) */}
      {isSuperuser ? (
        <div className="card space-y-4">
          <div className="flex items-center space-x-2">
            <UploadCloud className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-zen-charcoal">Unggah Rilis Baru</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Aplikasi Target *</label>
              <select
                className="input bg-zen-linen/40"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={uploading}
              >
                {APP_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.extLabel})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Versi Rilis (Opsional)</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="Mis. v2.4.1"
                className="input"
                disabled={uploading}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="label">Catatan Rilis Singkat (Opsional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Perbaikan socket startup & tombol Sync Cloud HRD"
                className="input"
                disabled={uploading}
              />
            </div>

            <div className="shrink-0">
              <label
                className={`btn-primary cursor-pointer inline-flex items-center justify-center ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileArchive className="h-4 w-4 mr-2" />
                )}
                <span>{uploading ? `Mengunggah ${progress}%...` : 'Pilih File Rilis'}</span>
                <input
                  type="file"
                  accept={activeCategory.accept}
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="w-full bg-zen-linen rounded-full h-2.5 overflow-hidden border border-zen-sand/60">
                <div
                  className="bg-primary-500 h-2.5 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-zen-charcoal/70 text-right">
                Mengunggah via TUS Resumable Upload... {progress}%
              </p>
            </div>
          )}

          <p className="text-xs text-zen-charcoal/60">
            Batas ukuran file: 500 MB ({activeCategory.extLabel}). Mengunggah versi baru otomatis
            menggantikan rilis sebelumnya untuk aplikasi tersebut.
          </p>
        </div>
      ) : (
        <div className="card bg-zen-linen/70 border-zen-sand flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-white rounded-lg border border-zen-sand text-zen-charcoal/70">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zen-charcoal">
                Mode Baca Publik (Unduhan Terbuka)
              </h3>
              <p className="text-xs text-zen-charcoal/70 mt-0.5">
                Hanya akun <strong>SUPERUSER (Role ID 8)</strong> yang dapat mengunggah atau
                menghapus paket rilis.
              </p>
            </div>
          </div>
          {!user && onRequestLogin && (
            <button
              type="button"
              onClick={onRequestLogin}
              className="btn-primary text-xs shrink-0"
            >
              Masuk Admin (Role 8)
            </button>
          )}
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="card bg-red-50 border-red-200 p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="card bg-emerald-50 border-emerald-200 p-4 flex items-start space-x-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-800">{success}</p>
        </div>
      )}

      {/* Daftar 5 Rilis Aplikasi */}
      <div>
        <h2 className="text-xl font-bold text-zen-charcoal mb-4">Versi Terbaru Tersedia</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card h-44 bg-white/80" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {APP_CATEGORIES.map((category) => {
              const rel = releases.find((r) => r.app_category === category.id);
              const Icon = CATEGORY_ICONS[category.id] || Monitor;
              const isDeleting = rel && deletingId === rel.id;

              return (
                <div
                  key={category.id}
                  className="card flex flex-col justify-between border-l-4 border-l-primary-500 p-5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-zen-charcoal">{category.name}</h3>
                            {rel?.version && (
                              <span className="px-2 py-0.5 text-[11px] font-semibold bg-primary-100 text-primary-800 rounded-full">
                                {rel.version}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zen-charcoal/60">
                            Format {category.extLabel} • {category.description}
                          </p>
                        </div>
                      </div>

                      {rel && isSuperuser && (
                        <button
                          type="button"
                          onClick={() => handleDelete(rel)}
                          disabled={isDeleting}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors shrink-0"
                          title="Hapus rilis ini"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {rel ? (
                      <div className="bg-zen-linen/70 rounded-xl p-3.5 mb-4 border border-zen-sand/60 space-y-1">
                        <p
                          className="text-sm font-semibold text-zen-charcoal truncate"
                          title={rel.original_name}
                        >
                          {rel.original_name}
                        </p>
                        <p className="text-xs text-zen-charcoal/70">
                          {formatFileSize(rel.size)} • Diunggah {formatDateID(rel.uploaded_at)} WIB
                        </p>
                        {rel.notes && (
                          <p className="text-xs text-zen-charcoal/80 pt-1 italic">{rel.notes}</p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-zen-linen/40 rounded-xl p-4 mb-4 border border-zen-sand/60 border-dashed text-center">
                        <p className="text-xs text-zen-charcoal/50 italic">
                          Belum ada versi yang diunggah untuk kategori ini
                        </p>
                      </div>
                    )}
                  </div>

                  <a
                    href={rel ? buildDownloadUrl(rel.download_url, rel.filename) : '#'}
                    target={rel ? '_blank' : undefined}
                    rel={rel ? 'noopener noreferrer' : undefined}
                    onClick={(e) => {
                      if (!rel) e.preventDefault();
                    }}
                    className={`flex items-center justify-center w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                      rel
                        ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-sm'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {rel ? 'Unduh dari CDN Supabase' : 'Belum Tersedia'}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
