import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download,
  Trash2,
  FileArchive,
  AlertCircle,
  AlertTriangle,
  Monitor,
  RefreshCw,
  Smartphone,
  Users,
  Tv,
  CheckCircle,
  Lock,
  UploadCloud,
  Loader2,
  ShieldCheck,
  X,
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
import { inspectReleaseFile } from '../utils/releaseBinaryInspector';

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
  const [targetOutletsRaw, setTargetOutletsRaw] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const fileInputRef = useRef(null);

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

  const resetPendingFile = () => {
    setPendingFile(null);
    setInspection(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCategoryChange = (newCategory) => {
    setSelectedCategory(newCategory);
    resetPendingFile();
    setVersion('');
    setError(null);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSuperuser || !supabase) {
      setError('Akses ditolak. Fitur ini hanya tersedia untuk SUPERUSER (Role ID 8).');
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

    setInspecting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await inspectReleaseFile(file, selectedCategory);
      setPendingFile(file);
      setInspection(result);
      if (result.detectedVersion) {
        setVersion(result.detectedVersion);
      }
    } catch (err) {
      resetPendingFile();
      setError(mapSafeErrorMessage(err) || 'Gagal menganalisis berkas rilis.');
    } finally {
      setInspecting(false);
    }
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!pendingFile) {
      setError('Silakan pilih berkas rilis terlebih dahulu.');
      return;
    }

    if (!isSuperuser || !supabase) {
      setError('Akses ditolak. Fitur ini hanya tersedia untuk SUPERUSER (Role ID 8).');
      return;
    }

    if (inspection?.containsConfigJson) {
      setError(
        'Unggahan diblokir: ditemukan config.json di dalam arsip ZIP. Hapus config.json terlebih dahulu.'
      );
      return;
    }

    const parsedMeta = releaseUploadSchema.safeParse({
      app_category: selectedCategory,
      version,
      notes,
      target_outlets_raw: targetOutletsRaw,
      is_mandatory: isMandatory,
    });
    if (!parsedMeta.success) {
      setError(formatZodError(parsedMeta));
      return;
    }

    const parsedOutlets = (parsedMeta.data.target_outlets_raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const targetOutlets = parsedOutlets.length > 0 ? Array.from(new Set(parsedOutlets)) : null;

    setUploading(true);
    setProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const existing = releases.find((r) => r.app_category === selectedCategory);

      const { storagePath, publicUrl, sanitizedName, contentType } = await uploadReleaseBinary(
        pendingFile,
        selectedCategory,
        setProgress
      );

      const { error: dbErr } = await supabase.from('work_log_releases').upsert(
        {
          app_category: parsedMeta.data.app_category,
          app_name: activeCategory.name,
          filename: sanitizedName,
          original_name: pendingFile.name,
          version: parsedMeta.data.version || null,
          mime_type: contentType,
          size: pendingFile.size,
          storage_path: storagePath,
          download_url: publicUrl,
          notes: parsedMeta.data.notes || null,
          sha256: inspection?.sha256 || null,
          exe_sha256: inspection?.exeSha256 || null,
          target_outlets: targetOutlets,
          is_mandatory: Boolean(parsedMeta.data.is_mandatory),
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

      setSuccess(
        `${activeCategory.name} (${pendingFile.name}) berhasil diunggah dan dipublikasikan ke CDN!`
      );
      setVersion('');
      setNotes('');
      setTargetOutletsRaw('');
      setIsMandatory(false);
      resetPendingFile();
      await fetchReleases();
    } catch (err) {
      setError(mapSafeErrorMessage(err));
    } finally {
      setUploading(false);
      setProgress(0);
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
        <form onSubmit={handlePublish} className="card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <UploadCloud className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-zen-charcoal">Unggah Rilis Baru</h2>
            </div>
            <span className="text-xs text-zen-charcoal/60">
              Versi PE & SHA-256 terdeteksi otomatis
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Aplikasi Target *</label>
              <select
                className="input bg-zen-linen/40"
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={uploading || inspecting}
              >
                {APP_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.extLabel})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Versi Rilis (Otomatis / Edit)</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="Mis. 1.2.0.1"
                className="input"
                disabled={uploading || inspecting}
              />
            </div>
          </div>

          {/* Pemilihan & Hasil Inspeksi Berkas */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label
                className={`btn-secondary cursor-pointer inline-flex items-center justify-center ${
                  uploading || inspecting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {inspecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileArchive className="h-4 w-4 mr-2" />
                )}
                <span>
                  {inspecting
                    ? 'Menganalisis berkas & SHA-256...'
                    : pendingFile
                      ? 'Ganti File Rilis'
                      : 'Pilih File Rilis'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={activeCategory.accept}
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={uploading || inspecting}
                />
              </label>

              {pendingFile && (
                <button
                  type="button"
                  onClick={resetPendingFile}
                  disabled={uploading}
                  className="inline-flex items-center text-xs text-zen-charcoal/70 hover:text-red-600 px-2.5 py-1.5 rounded-lg border border-zen-sand/70 bg-zen-linen/50"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Batal Pilih
                </button>
              )}
            </div>

            {pendingFile && inspection && (
              <div
                className={`rounded-xl p-3.5 border text-xs space-y-1.5 ${
                  inspection.containsConfigJson
                    ? 'bg-red-50 border-red-300 text-red-900'
                    : 'bg-zen-linen/70 border-zen-sand/80 text-zen-charcoal'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold truncate">
                    {inspection.containsConfigJson ? (
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-primary-600 shrink-0" />
                    )}
                    <span className="truncate">{pendingFile.name}</span>
                  </div>
                  <span className="shrink-0 font-medium">{formatFileSize(pendingFile.size)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-zen-charcoal/80">
                  <p>
                    Versi PE Terdeteksi:{' '}
                    <strong className="text-zen-charcoal">
                      {inspection.detectedVersion || 'Tidak terbaca (isi manual)'}
                    </strong>
                  </p>
                  {inspection.exeFilename && (
                    <p className="truncate">
                      Biner Utama: <strong className="text-zen-charcoal">{inspection.exeFilename}</strong>
                    </p>
                  )}
                  {inspection.sha256 && (
                    <p className="font-mono truncate" title={inspection.sha256}>
                      SHA-256 Paket: {inspection.sha256.slice(0, 16)}...
                    </p>
                  )}
                  {inspection.exeSha256 && (
                    <p className="font-mono truncate" title={inspection.exeSha256}>
                      SHA-256 Biner: {inspection.exeSha256.slice(0, 16)}...
                    </p>
                  )}
                </div>

                {inspection.warnings?.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {inspection.warnings.map((w, idx) => (
                      <p key={idx} className="text-red-700 font-semibold">
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="label">Catatan Rilis (Release Notes — tampil di Wizard ZenUpdater)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={"Contoh:\n- Penambahan fitur ZenUpdater Wizard\n- Perbaikan sinkronisasi Gift Certificate"}
              className="input min-h-[84px] py-2"
              disabled={uploading}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="sm:col-span-2">
              <label className="label">Target Cabang / Canary Rollout (Opsional)</label>
              <input
                type="text"
                value={targetOutletsRaw}
                onChange={(e) => setTargetOutletsRaw(e.target.value)}
                placeholder="Kosongkan untuk semua cabang, atau isi mis. 101, 116"
                className="input"
                disabled={uploading}
              />
            </div>

            <div className="pt-2 sm:pt-5">
              <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  disabled={uploading}
                  className="h-4 w-4 rounded border-zen-sand text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-zen-charcoal">
                  Pembaruan Wajib (Mandatory)
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <p className="text-xs text-zen-charcoal/60">
              Batas ukuran file: 500 MB ({activeCategory.extLabel}). Mengunggah versi baru otomatis
              menggantikan rilis sebelumnya.
            </p>

            <button
              type="submit"
              disabled={
                uploading || inspecting || !pendingFile || Boolean(inspection?.containsConfigJson)
              }
              className={`btn-primary inline-flex items-center justify-center shrink-0 ${
                uploading || inspecting || !pendingFile || Boolean(inspection?.containsConfigJson)
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4 mr-2" />
              )}
              <span>
                {uploading ? `Mengunggah ${progress}%...` : 'Unggah & Publikasikan Rilis'}
              </span>
            </button>
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
        </form>
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="font-bold text-zen-charcoal">{category.name}</h3>
                            {rel?.version && (
                              <span className="px-2 py-0.5 text-[11px] font-semibold bg-primary-100 text-primary-800 rounded-full">
                                {rel.version}
                              </span>
                            )}
                            {rel?.is_mandatory && (
                              <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-full">
                                Wajib
                              </span>
                            )}
                            {Array.isArray(rel?.target_outlets) && rel.target_outlets.length > 0 && (
                              <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-800 rounded-full">
                                Canary: {rel.target_outlets.join(', ')}
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
                      <div className="bg-zen-linen/70 rounded-xl p-3.5 mb-4 border border-zen-sand/60 space-y-1.5">
                        <p
                          className="text-sm font-semibold text-zen-charcoal truncate"
                          title={rel.original_name}
                        >
                          {rel.original_name}
                        </p>
                        <p className="text-xs text-zen-charcoal/70">
                          {formatFileSize(rel.size)} • Diunggah {formatDateID(rel.uploaded_at)} WIB
                        </p>
                        {rel.sha256 && (
                          <p
                            className="text-[11px] font-mono text-zen-charcoal/60 truncate"
                            title={rel.sha256}
                          >
                            SHA-256: {rel.sha256.slice(0, 16)}...
                          </p>
                        )}
                        {rel.notes && (
                          <p className="text-xs text-zen-charcoal/85 pt-1 whitespace-pre-line border-t border-zen-sand/40">
                            {rel.notes}
                          </p>
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
