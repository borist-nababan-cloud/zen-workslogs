import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  Calendar,
  FileCode,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  Download,
  Monitor,
  RefreshCw,
  Smartphone,
  Users,
  Tv,
  CheckCircle,
  Clock,
  Plus,
  Edit3,
  Trash2,
  FolderOpen,
  GitCommit,
  AlertCircle,
  Loader2,
  Layers,
} from 'lucide-react';
import {
  supabase,
  IS_SUPABASE_CONFIGURED,
  APP_CATEGORIES,
  STANDARD_APPS,
  buildDownloadUrl,
} from '../supabase';
import { useAuth } from '../context/AuthContext';
import WorkLogModal from '../components/WorkLogModal';
import { mapSafeErrorMessage } from '../utils/errorShield';

const CATEGORY_ICONS = {
  zen_desktop: Monitor,
  zen_sync: RefreshCw,
  internal_android: Smartphone,
  customer_android: Users,
  dashboard_tv: Tv,
};

const APP_BADGE_STYLES = {
  'WHMS App': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Supabase Backend': 'bg-indigo-50 text-indigo-800 border-indigo-200',
  'ZenSystem Desktop': 'bg-amber-50 text-amber-800 border-amber-200',
  SyncAgent: 'bg-sky-50 text-sky-800 border-sky-200',
  ZenDashboard: 'bg-teal-50 text-teal-800 border-teal-200',
  'ZenInternal App': 'bg-purple-50 text-purple-800 border-purple-200',
  'Website Static': 'bg-rose-50 text-rose-800 border-rose-200',
  'WorkLogs App': 'bg-lime-50 text-lime-800 border-lime-200',
  'AI Backend': 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
  'Ecosystem / Global': 'bg-stone-100 text-stone-800 border-stone-300',
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTanggalID(dateIso) {
  if (!dateIso) return '-';
  const parsed = new Date(`${dateIso}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimestampID(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

function getActionBadge(action) {
  const lower = (action || '').toLowerCase();
  if (lower.includes('baru')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (lower.includes('bug') || lower.includes('perbaikan'))
    return 'bg-rose-100 text-rose-800 border-rose-200';
  if (lower.includes('infrastruktur') || lower.includes('deploy'))
    return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-sky-100 text-sky-800 border-sky-200';
}

const MARKDOWN_COMPONENTS = {
  h1: ({ children }) => (
    <h3 className="text-base font-bold text-zen-charcoal mt-3 mb-1.5">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="text-sm font-bold text-zen-charcoal mt-3 mb-1.5">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-sm font-semibold text-primary-700 mt-3 mb-1.5 border-b border-zen-sand/50 pb-1">
      {children}
    </h5>
  ),
  p: ({ children }) => (
    <p className="text-sm text-zen-charcoal/90 leading-relaxed mb-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1 text-sm text-zen-charcoal/90 mb-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1 text-sm text-zen-charcoal/90 mb-2">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ inline, children }) =>
    inline ? (
      <code className="px-1.5 py-0.5 bg-zen-linen border border-zen-sand/60 rounded text-xs font-mono text-primary-800">
        {children}
      </code>
    ) : (
      <pre className="p-3 bg-zen-charcoal text-zen-linen rounded-lg text-xs font-mono overflow-x-auto my-2">
        <code>{children}</code>
      </pre>
    ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-600 underline hover:text-primary-700"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary-400 pl-3 italic text-zen-charcoal/75 my-2">
      {children}
    </blockquote>
  ),
};

export default function DisplayPage() {
  const { isSuperuser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [trainedFilter, setTrainedFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState(null);

  const fetchData = useCallback(async () => {
    if (!supabase || !IS_SUPABASE_CONFIGURED) {
      setError('Konfigurasi koneksi server belum lengkap, silakan hubungi tim IT.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [logsRes, relRes] = await Promise.all([
        supabase
          .from('work_logs')
          .select('*')
          .order('tanggal', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('work_log_releases')
          .select('*')
          .order('uploaded_at', { ascending: false }),
      ]);

      if (logsRes.error) throw logsRes.error;
      if (relRes.error) throw relRes.error;

      setLogs(logsRes.data || []);
      setReleases(relRes.data || []);
    } catch (err) {
      setError(mapSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const availableApps = useMemo(() => {
    const names = new Set(STANDARD_APPS.map((a) => a.name));
    logs.forEach((l) => {
      if (l.apps_name) names.add(l.apps_name);
    });
    return Array.from(names);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((item) => {
      if (appFilter && item.apps_name !== appFilter) return false;
      if (trainedFilter === 'TRAINED' && !item.trained) return false;
      if (trainedFilter === 'NOT_TRAINED' && item.trained) return false;
      if (dateFrom && item.tanggal < dateFrom) return false;
      if (dateTo && item.tanggal > dateTo) return false;
      if (q) {
        const hay = [
          item.title,
          item.apps_name,
          item.path,
          item.have_done,
          item.aksi,
          item.commit_hash,
          item.tanggal,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, appFilter, trainedFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = logs.length;
    const appsCount = new Set(logs.map((l) => l.apps_name).filter(Boolean)).size;
    const trainedCount = logs.filter((l) => l.trained).length;
    const untrainedCount = total - trainedCount;
    return { total, appsCount, trainedCount, untrainedCount };
  }, [logs]);

  const clearFilters = () => {
    setSearch('');
    setAppFilter('');
    setTrainedFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const highlightText = (text, term) => {
    const trimmed = term.trim();
    if (!trimmed || !text) return text;
    const regex = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi');
    const parts = String(text).split(regex);
    const lowerTerm = trimmed.toLowerCase();
    return (
      <>
        {parts.map((part, idx) =>
          part.toLowerCase() === lowerTerm ? (
            <mark key={idx} className="highlight">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const handleToggleTrained = async (item) => {
    if (!isSuperuser || !supabase) return;
    setTogglingId(item.id);
    setActionError(null);
    try {
      const nextVal = !item.trained;
      const { data, error: upErr } = await supabase
        .from('work_logs')
        .update({ trained: nextVal })
        .eq('id', item.id)
        .select()
        .single();

      if (upErr) throw upErr;
      setLogs((prev) => prev.map((row) => (row.id === item.id ? data : row)));
    } catch (err) {
      setActionError(mapSafeErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteLog = async (item) => {
    if (!isSuperuser || !supabase) return;
    if (!window.confirm(`Hapus catatan "${item.title}" (${item.apps_name})?`)) return;

    setDeletingId(item.id);
    setActionError(null);
    try {
      const { error: delErr } = await supabase.from('work_logs').delete().eq('id', item.id);
      if (delErr) throw delErr;
      setLogs((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      setActionError(mapSafeErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const hasActiveFilter =
    Boolean(search) ||
    Boolean(appFilter) ||
    trainedFilter !== 'ALL' ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-72 bg-zen-sand/40 rounded-lg" />
            <div className="h-4 w-96 bg-zen-sand/30 rounded-lg" />
          </div>
          <div className="h-10 w-28 bg-zen-sand/40 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-20 bg-white/80" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card h-24 bg-white/80" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-28 bg-white/80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Tombol Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zen-charcoal">
            Catatan Pembaruan Sistem Zen
          </h1>
          <p className="text-sm text-zen-charcoal/70 mt-1">
            Pemantauan rilis, status pengujian (Tested), dan kesiapan training cabang (Trained)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchData}
            className="btn-secondary flex items-center space-x-1.5 text-sm"
            title="Muat ulang data terbaru"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Segarkan</span>
          </button>
          {isSuperuser && (
            <button
              type="button"
              onClick={() => {
                setEditingLog(null);
                setModalOpen(true);
              }}
              className="btn-primary flex items-center space-x-1.5 text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Catatan</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {(error || actionError) && (
        <div className="card bg-red-50 border-red-200 p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 flex-1">{error || actionError}</div>
          {actionError && (
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* 4 Kartu KPI Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card p-4 border-l-4 border-l-primary-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zen-charcoal/70">Total Catatan</span>
            <FileCode className="h-4 w-4 text-primary-600" />
          </div>
          <p className="text-2xl font-bold text-zen-charcoal mt-1">{stats.total}</p>
        </div>

        <div className="card p-4 border-l-4 border-l-zen-sand">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zen-charcoal/70">Aplikasi Aktif</span>
            <Layers className="h-4 w-4 text-zen-charcoal/70" />
          </div>
          <p className="text-2xl font-bold text-zen-charcoal mt-1">{stats.appsCount}</p>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zen-charcoal/70">Sudah Training</span>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.trainedCount}</p>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zen-charcoal/70">Menunggu Training</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-1">{stats.untrainedCount}</p>
        </div>
      </div>

      {/* Quick Downloads (5 Aplikasi Termasuk Android TV) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base sm:text-lg font-bold text-zen-charcoal">
            Unduhan Cepat Rilis Aplikasi (CDN)
          </h2>
          <Link
            to="/files"
            className="text-xs sm:text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            {isSuperuser ? 'Kelola Release Hub →' : 'Lihat Detail Rilis →'}
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {APP_CATEGORIES.map((category) => {
            const rel = releases.find((r) => r.app_category === category.id);
            const Icon = CATEGORY_ICONS[category.id] || Monitor;
            return (
              <div
                key={category.id}
                className="card p-3.5 border-l-4 border-l-primary-500 flex flex-col justify-between"
              >
                <div className="flex items-start space-x-2.5 mb-2.5">
                  <div className="p-1.5 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-zen-charcoal text-xs sm:text-sm leading-tight truncate">
                      {category.shortName}
                    </h3>
                    <p className="text-[11px] text-zen-charcoal/60 truncate mt-0.5">
                      {rel
                        ? `${formatFileSize(rel.size)} • ${rel.filename}`
                        : `Belum diunggah (${category.extLabel})`}
                    </p>
                  </div>
                </div>

                <a
                  href={rel ? buildDownloadUrl(rel.download_url, rel.filename) : '#'}
                  target={rel ? '_blank' : undefined}
                  rel={rel ? 'noopener noreferrer' : undefined}
                  onClick={(e) => {
                    if (!rel) e.preventDefault();
                  }}
                  className={`flex items-center justify-center w-full py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    rel
                      ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200'
                      : 'bg-zen-linen text-zen-charcoal/40 cursor-not-allowed'
                  }`}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {rel ? (rel.version ? `Unduh ${rel.version}` : 'Unduh CDN') : 'Belum Tersedia'}
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zen-charcoal/50" />
            <input
              type="text"
              placeholder="Cari judul, aplikasi, modul, path, atau commit hash..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 text-sm"
            />
          </div>

          <select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            className="input sm:w-52 text-sm"
          >
            <option value="">Semua Aplikasi</option>
            {availableApps.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={trainedFilter}
            onChange={(e) => setTrainedFilter(e.target.value)}
            className="input sm:w-44 text-sm"
          >
            <option value="ALL">Semua Training</option>
            <option value="NOT_TRAINED">Belum Training</option>
            <option value="TRAINED">Sudah Training</option>
          </select>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center justify-center space-x-1.5 text-sm shrink-0"
          >
            <Filter className="h-4 w-4" />
            <span>Tanggal</span>
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-zen-sand/60 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="label text-xs">Dari Tanggal</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label text-xs">Sampai Tanggal</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input text-sm"
              />
            </div>
            <div className="flex items-center">
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center space-x-1.5 text-sm text-zen-charcoal/70 hover:text-zen-charcoal py-2"
                >
                  <X className="h-4 w-4" />
                  <span>Reset Semua Filter</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results counter */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-zen-charcoal/70">
        <span>
          Menampilkan <strong>{filteredLogs.length}</strong> dari <strong>{logs.length}</strong>{' '}
          catatan
        </span>
        {hasActiveFilter && !showFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-primary-600 hover:text-primary-700 font-medium flex items-center space-x-1"
          >
            <X className="h-3.5 w-3.5" />
            <span>Hapus Filter</span>
          </button>
        )}
      </div>

      {/* Daftar Catatan Kerja */}
      {filteredLogs.length === 0 ? (
        <div className="card text-center py-12">
          <FileCode className="h-12 w-12 mx-auto text-zen-charcoal/30 mb-3" />
          <h3 className="text-lg font-semibold text-zen-charcoal mb-1">
            Tidak ada catatan ditemukan
          </h3>
          <p className="text-sm text-zen-charcoal/60">
            Ubah kata kunci pencarian atau filter aplikasi/tanggal di atas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            const appBadgeClass =
              APP_BADGE_STYLES[item.apps_name] || 'bg-stone-100 text-stone-800 border-stone-200';
            const isToggling = togglingId === item.id;
            const isDeleting = deletingId === item.id;

            return (
              <article
                key={item.id}
                className="card p-4 sm:p-5 hover:border-primary-300 transition-colors"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center text-xs font-medium text-zen-charcoal/75 bg-zen-linen px-2.5 py-1 rounded-full border border-zen-sand/60">
                        <Calendar className="h-3.5 w-3.5 mr-1.5 text-primary-600" />
                        {formatTanggalID(item.tanggal)}
                      </span>

                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${appBadgeClass}`}
                      >
                        {item.apps_name}
                      </span>

                      <span className="inline-flex items-center text-[11px] font-mono text-zen-charcoal/70 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        <FolderOpen className="h-3 w-3 mr-1 text-zen-charcoal/50" />
                        {highlightText(item.path, search)}
                      </span>

                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getActionBadge(
                          item.aksi
                        )}`}
                      >
                        {item.aksi}
                      </span>

                      {item.commit_hash && (
                        <span className="inline-flex items-center text-[11px] font-mono text-zen-charcoal/70 bg-zen-linen px-2 py-0.5 rounded border border-zen-sand/70">
                          <GitCommit className="h-3 w-3 mr-1" />
                          {highlightText(item.commit_hash, search)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${
                          item.tested
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        {item.tested ? 'Tested' : 'Belum Diuji'}
                      </span>

                      {isSuperuser ? (
                        <button
                          type="button"
                          onClick={() => handleToggleTrained(item)}
                          disabled={isToggling}
                          title={
                            item.trained
                              ? 'Klik untuk menandai Belum Training'
                              : 'Klik untuk menandai Sudah Training'
                          }
                          className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                            item.trained
                              ? 'bg-primary-500 text-white border-primary-600 hover:bg-primary-600'
                              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                          } disabled:opacity-50`}
                        >
                          {isToggling ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : item.trained ? (
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 mr-1" />
                          )}
                          <span>{item.trained ? 'Sudah Training' : 'Tandai Trained'}</span>
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${
                            item.trained
                              ? 'bg-primary-50 text-primary-700 border-primary-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {item.trained ? (
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 mr-1" />
                          )}
                          {item.trained ? 'Sudah Training' : 'Menunggu Training'}
                        </span>
                      )}

                      {isSuperuser && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLog(item);
                              setModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-zen-charcoal/70 hover:bg-zen-linen hover:text-primary-700 border border-zen-sand/60"
                            title="Ubah catatan"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(item)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 border border-red-200 disabled:opacity-50"
                            title="Hapus catatan"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex items-start justify-between gap-3 cursor-pointer"
                    onClick={() => toggleExpand(item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-zen-charcoal leading-snug">
                        {highlightText(item.title, search)}
                      </h3>
                      {item.trained && item.trained_at && (
                        <p className="text-[11px] text-primary-700 mt-1">
                          Training tercatat pada {formatTimestampID(item.trained_at)} WIB
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(item.id);
                      }}
                      className="p-1.5 rounded-lg text-zen-charcoal/60 hover:bg-zen-linen shrink-0"
                      aria-label={isExpanded ? 'Tutup detail' : 'Lihat detail'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="pt-3 mt-1 border-t border-zen-sand/60 bg-zen-linen/40 rounded-lg p-4">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={MARKDOWN_COMPONENTS}
                      >
                        {item.have_done || ''}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <WorkLogModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingLog(null);
        }}
        initialData={editingLog}
        onSaved={fetchData}
      />
    </div>
  );
}
