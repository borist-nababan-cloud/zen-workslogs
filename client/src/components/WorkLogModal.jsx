import { useEffect, useState } from 'react';
import { X, Save, AlertCircle, Loader2, FileCode } from 'lucide-react';
import { supabase, STANDARD_APPS } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { workLogSchema, formatZodError } from '../utils/validation';
import { mapSafeErrorMessage } from '../utils/errorShield';

const ACTION_OPTIONS = ['Dibuat Baru', 'Diperbarui', 'Perbaikan Bug', 'Infrastruktur'];

function getTodayWIB() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

async function computeSourceHash(raw) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(raw);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function WorkLogModal({ isOpen, onClose, initialData, onSaved }) {
  const { isSuperuser } = useAuth();
  const isEditing = Boolean(initialData?.id);
  const [tanggal, setTanggal] = useState(getTodayWIB());
  const [appsName, setAppsName] = useState(STANDARD_APPS[0].name);
  const [path, setPath] = useState(STANDARD_APPS[0].path);
  const [aksi, setAksi] = useState('Diperbarui');
  const [title, setTitle] = useState('');
  const [commitHash, setCommitHash] = useState('');
  const [haveDone, setHaveDone] = useState('');
  const [tested, setTested] = useState(true);
  const [trained, setTrained] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setError(null);
    if (initialData) {
      setTanggal(initialData.tanggal || getTodayWIB());
      setAppsName(initialData.apps_name || STANDARD_APPS[0].name);
      setPath(initialData.path || '');
      setAksi(initialData.aksi || 'Diperbarui');
      setTitle(initialData.title || '');
      setCommitHash(initialData.commit_hash || '');
      setHaveDone(initialData.have_done || '');
      setTested(initialData.tested ?? true);
      setTrained(Boolean(initialData.trained));
    } else {
      setTanggal(getTodayWIB());
      setAppsName(STANDARD_APPS[0].name);
      setPath(STANDARD_APPS[0].path);
      setAksi('Diperbarui');
      setTitle('');
      setCommitHash('');
      setHaveDone('');
      setTested(true);
      setTrained(false);
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;

  const handleAppChange = (nextApp) => {
    const prevDef = STANDARD_APPS.find((a) => a.name === appsName);
    const nextDef = STANDARD_APPS.find((a) => a.name === nextApp);
    setAppsName(nextApp);
    if (nextDef && (!path || (prevDef && path === prevDef.path))) {
      setPath(nextDef.path);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!isSuperuser || !supabase) {
      setError('Akses ditolak. Fitur ini hanya tersedia untuk SUPERUSER (Role ID 8).');
      return;
    }

    const parsed = workLogSchema.safeParse({
      tanggal,
      apps_name: appsName,
      path,
      aksi,
      title,
      commit_hash: commitHash,
      have_done: haveDone,
      tested: Boolean(tested),
      trained: Boolean(trained),
    });

    if (!parsed.success) {
      setError(formatZodError(parsed));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tanggal: parsed.data.tanggal,
        apps_name: parsed.data.apps_name,
        path: parsed.data.path,
        aksi: parsed.data.aksi,
        title: parsed.data.title,
        commit_hash: parsed.data.commit_hash || null,
        have_done: parsed.data.have_done,
        tested: parsed.data.tested,
        trained: parsed.data.trained,
      };

      if (isEditing) {
        const { error: updateErr } = await supabase
          .from('work_logs')
          .update(payload)
          .eq('id', initialData.id);
        if (updateErr) throw updateErr;
      } else {
        payload.source_hash = await computeSourceHash(
          `ui:${payload.tanggal}:${payload.apps_name}:${payload.title}:${Date.now()}`
        );
        const { error: insertErr } = await supabase.from('work_logs').insert([payload]);
        if (insertErr) throw insertErr;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(mapSafeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zen-charcoal/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-zen-sand w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-zen-linen border-b border-zen-sand/70 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-primary-500 text-white rounded-lg">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zen-charcoal">
                {isEditing ? 'Ubah Catatan Kerja' : 'Tambah Catatan Kerja Baru'}
              </h2>
              <p className="text-xs text-zen-charcoal/70">Tersimpan langsung ke Supabase Production</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-zen-charcoal/60 hover:bg-zen-sand/30 hover:text-zen-charcoal disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2 text-sm text-red-700">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Tanggal *</label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Tipe Aksi *</label>
              <select value={aksi} onChange={(e) => setAksi(e.target.value)} className="input">
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Nama Aplikasi *</label>
              <select
                value={appsName}
                onChange={(e) => handleAppChange(e.target.value)}
                className="input"
              >
                {STANDARD_APPS.map((app) => (
                  <option key={app.name} value={app.name}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Path Proyek *</label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="frontend\warehousemanagement"
                className="input font-mono text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Judul Ringkas Perubahan *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Perbaikan filter laporan stok & cetak A4"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Hash Commit Git</label>
              <input
                type="text"
                value={commitHash}
                onChange={(e) => setCommitHash(e.target.value)}
                placeholder="Opsional (mis. e042ded)"
                className="input font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="label">Detail Perubahan (Format Markdown) *</label>
            <textarea
              rows={7}
              value={haveDone}
              onChange={(e) => setHaveDone(e.target.value)}
              placeholder={'**Ringkasan:** ...\n\n### Modul & Perubahan\n- **Modul:** `NamaFile.tsx`\n  - **Detail:** ...'}
              className="input font-mono text-sm"
              required
            />
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1 bg-zen-linen/70 border border-zen-sand/60 rounded-xl p-3.5">
            <label className="inline-flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tested}
                onChange={(e) => setTested(e.target.checked)}
                className="h-4 w-4 rounded border-zen-sand text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-zen-charcoal">
                Sudah Diuji (Tested)
              </span>
            </label>

            <label className="inline-flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={trained}
                onChange={(e) => setTrained(e.target.checked)}
                className="h-4 w-4 rounded border-zen-sand text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-zen-charcoal">
                Sudah Training ke Cabang (Trained)
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zen-sand/60">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>{isEditing ? 'Simpan Perubahan' : 'Simpan Catatan'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
