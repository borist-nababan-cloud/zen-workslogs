import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity,
  Server,
  Cpu,
  HardDrive,
  Layers,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Key,
  Copy,
  Check,
  Plus,
  Search,
  Lock,
  Terminal,
  Package,
  ArrowUpDown,
  Clock,
  Wifi,
  WifiOff,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Ban,
} from 'lucide-react';
import {
  supabase,
  IS_SUPABASE_CONFIGURED,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '../supabase';
import { useAuth } from '../context/AuthContext';
import { mapSafeErrorMessage } from '../utils/errorShield';
import { watchdogTokenSchema, formatZodError } from '../utils/validation';

const AUTO_REFRESH_SECONDS = 30;

function formatTimestampID(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatShortTimeID(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeAgeID(ts) {
  if (!ts) return 'belum pernah';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mnt lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  return `${Math.floor(diffSec / 86400)} hari lalu`;
}

function formatUptimeID(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${mins} mnt`;
  return `${mins} mnt`;
}

function getNodeStatusInfo(lastHeartbeatAt) {
  if (!lastHeartbeatAt) {
    return {
      code: 'OFFLINE',
      label: 'OFFLINE',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      dotClass: 'bg-red-500',
    };
  }
  const ageSec = (Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000;
  if (ageSec <= 90) {
    return {
      code: 'ONLINE',
      label: 'ONLINE',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dotClass: 'bg-emerald-500 animate-pulse',
    };
  }
  if (ageSec <= 180) {
    return {
      code: 'LAGGING',
      label: 'TERLAMBAT',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      dotClass: 'bg-amber-500',
    };
  }
  return {
    code: 'OFFLINE',
    label: 'OFFLINE',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
  };
}

function MetricTrendChart({
  title,
  unit,
  data,
  primaryKey,
  secondaryKey = null,
  primaryLabel,
  secondaryLabel = null,
  primaryColor = '#889D35',
  secondaryColor = '#d97706',
  fixedMaxY = null,
}) {
  const stats = useMemo(() => {
    const vals = data
      .map((d) => Number(d[primaryKey]))
      .filter((n) => Number.isFinite(n));
    if (vals.length === 0) {
      return { min: 0, avg: 0, max: 0, last: 0 };
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((acc, v) => acc + v, 0) / vals.length;
    return {
      min: Number(min.toFixed(2)),
      avg: Number(avg.toFixed(2)),
      max: Number(max.toFixed(2)),
      last: Number(vals[vals.length - 1].toFixed(2)),
    };
  }, [data, primaryKey]);

  const width = 460;
  const height = 140;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { primaryPath, areaPath, secondaryPath, maxY, yTicks } = useMemo(() => {
    if (!data || data.length < 2) {
      return {
        primaryPath: '',
        areaPath: '',
        secondaryPath: '',
        maxY: fixedMaxY || 100,
        yTicks: [0, 50, 100],
      };
    }

    let computedMax = fixedMaxY || 4;
    if (!fixedMaxY) {
      const candidates = data.map((d) => Number(d[primaryKey]) || 0);
      if (secondaryKey) {
        candidates.push(...data.map((d) => Number(d[secondaryKey]) || 0));
      }
      computedMax = Math.max(4, Math.ceil(Math.max(...candidates) * 1.15));
    }

    const n = data.length;
    const toX = (idx) => padL + (idx / (n - 1)) * plotW;
    const toY = (val) => {
      const clamped = Math.max(0, Math.min(computedMax, Number(val) || 0));
      return padT + plotH - (clamped / computedMax) * plotH;
    };

    const pPoints = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d[primaryKey]).toFixed(1)}`);
    const pLine = `M ${pPoints.join(' L ')}`;
    const baseY = (padT + plotH).toFixed(1);
    const pArea = `${pLine} L ${toX(n - 1).toFixed(1)},${baseY} L ${toX(0).toFixed(1)},${baseY} Z`;

    let sLine = '';
    if (secondaryKey) {
      const sPoints = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d[secondaryKey]).toFixed(1)}`);
      sLine = `M ${sPoints.join(' L ')}`;
    }

    return {
      primaryPath: pLine,
      areaPath: pArea,
      secondaryPath: sLine,
      maxY: computedMax,
      yTicks: [0, Number((computedMax / 2).toFixed(1)), computedMax],
    };
  }, [data, primaryKey, secondaryKey, fixedMaxY, plotW, plotH]);

  const startLabel = data.length > 0 ? formatShortTimeID(data[0].recorded_at) : '';
  const midLabel = data.length > 2 ? formatShortTimeID(data[Math.floor(data.length / 2)].recorded_at) : '';
  const endLabel = data.length > 0 ? formatShortTimeID(data[data.length - 1].recorded_at) : '';

  return (
    <div className="bg-white rounded-xl border border-zen-sand/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h4 className="text-sm font-bold text-zen-charcoal">{title}</h4>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-zen-charcoal/70">
            <span className="inline-flex items-center space-x-1">
              <span
                className="inline-block w-2.5 h-0.5 rounded"
                style={{ backgroundColor: primaryColor }}
              />
              <span>{primaryLabel}</span>
            </span>
            {secondaryLabel && (
              <span className="inline-flex items-center space-x-1">
                <span
                  className="inline-block w-2.5 h-0.5 border-b border-dashed"
                  style={{ borderColor: secondaryColor }}
                />
                <span>{secondaryLabel}</span>
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-zen-charcoal">
            {stats.last}
            <span className="text-xs font-normal text-zen-charcoal/60 ml-0.5">{unit}</span>
          </div>
          <div className="text-[11px] text-zen-charcoal/60">
            Min {stats.min} • Rata {stats.avg} • Maks {stats.max}
          </div>
        </div>
      </div>

      {data.length < 2 ? (
        <div className="h-36 flex items-center justify-center rounded-lg bg-zen-linen/70 border border-dashed border-zen-sand text-xs text-zen-charcoal/60 px-4 text-center">
          Menunggu minimal 2 titik data (tersimpan tiap ±1 menit) untuk menampilkan grafik riwayat.
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
          {yTicks.map((tick) => {
            const yPos = padT + plotH - (tick / maxY) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={yPos}
                  x2={width - padR}
                  y2={yPos}
                  stroke="#E8E0D4"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padL - 5}
                  y={yPos + 3}
                  textAnchor="end"
                  className="fill-zen-charcoal/50 text-[9px]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill={primaryColor} fillOpacity="0.14" />
          <path
            d={primaryPath}
            fill="none"
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {secondaryPath && (
            <path
              d={secondaryPath}
              fill="none"
              stroke={secondaryColor}
              strokeWidth="1.6"
              strokeDasharray="4 3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          <text x={padL} y={height - 4} textAnchor="start" className="fill-zen-charcoal/50 text-[9px]">
            {startLabel}
          </text>
          {midLabel && (
            <text
              x={padL + plotW / 2}
              y={height - 4}
              textAnchor="middle"
              className="fill-zen-charcoal/50 text-[9px]"
            >
              {midLabel}
            </text>
          )}
          <text
            x={width - padR}
            y={height - 4}
            textAnchor="end"
            className="fill-zen-charcoal/50 text-[9px]"
          >
            {endLabel}
          </text>
        </svg>
      )}
    </div>
  );
}

function TokenSetupModal({
  isOpen,
  onClose,
  tokens,
  onRefresh,
}) {
  const [nodeId, setNodeId] = useState('coolify-prod-vps');
  const [label, setLabel] = useState('VPS DigitalOcean Coolify');
  const [submitting, setSubmitting] = useState(false);
  const [revokingNode, setRevokingNode] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [generated, setGenerated] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  if (!isOpen) return null;

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      setErrorMsg('Gagal menyalin ke clipboard browser. Silakan salin teks secara manual.');
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const parsed = watchdogTokenSchema.safeParse({
      node_id: nodeId,
      label,
    });
    if (!parsed.success) {
      setErrorMsg(formatZodError(parsed));
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('generate_vps_watchdog_token', {
        p_node_id: parsed.data.node_id,
        p_label: parsed.data.label,
      });
      if (error) throw error;
      setGenerated(data);
      await onRefresh();
    } catch (err) {
      setErrorMsg(mapSafeErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (targetNodeId) => {
    setErrorMsg('');
    setRevokingNode(targetNodeId);
    try {
      const { error } = await supabase.rpc('revoke_vps_watchdog_token', {
        p_node_id: targetNodeId,
      });
      if (error) throw error;
      if (generated?.node_id === targetNodeId) {
        setGenerated(null);
      }
      await onRefresh();
    } catch (err) {
      setErrorMsg(mapSafeErrorMessage(err));
    } finally {
      setRevokingNode(null);
    }
  };

  const coolifyEnvSnippet = generated
    ? [
        `SUPABASE_URL=${SUPABASE_URL}`,
        `SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}`,
        `WATCHDOG_INGEST_TOKEN=${generated.token}`,
        `POLL_INTERVAL_SECONDS=30`,
        `# Opsional webhook notifikasi n8n (Telegram / WhatsApp):`,
        `# N8N_ALERT_WEBHOOK_URL=`,
      ].join('\n')
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-zen-charcoal/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-zen-sand shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zen-sand/70 bg-zen-linen/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-primary-100 text-primary-700">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zen-charcoal">
                Kelola Token &amp; Setup VPS Watchdog Agent
              </h3>
              <p className="text-xs text-zen-charcoal/65">
                Token terisolasi (Least Privilege) hanya untuk mengirim metrik node terdaftar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zen-charcoal/60 hover:bg-zen-sand/40"
            aria-label="Tutup Modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form buat / rotasi token */}
          <form
            onSubmit={handleGenerate}
            className="bg-zen-linen/60 border border-zen-sand/70 rounded-xl p-4 space-y-3"
          >
            <h4 className="text-xs font-bold uppercase tracking-wider text-zen-charcoal/70">
              Buat atau Rotasi Token Node VPS
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zen-charcoal mb-1">
                  ID Node (slug unik)
                </label>
                <input
                  type="text"
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value.toLowerCase())}
                  placeholder="coolify-prod-vps"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zen-sand bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zen-charcoal mb-1">
                  Label Tampilan Server
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="VPS DigitalOcean Coolify"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zen-sand bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-zen-charcoal/65">
                Jika ID Node sudah ada, token lama otomatis diganti (rotasi aman).
              </span>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 shadow-sm"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span>Buat / Rotasi Token</span>
              </button>
            </div>
          </form>

          {/* Token sekali lihat */}
          {generated && (
            <div className="rounded-xl border-2 border-primary-300 bg-primary-50/70 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded bg-primary-600 text-white text-[10px] font-bold uppercase">
                    Tampil Sekali Saja
                  </span>
                  <h4 className="text-sm font-bold text-zen-charcoal mt-1">
                    Token Agent untuk &ldquo;{generated.node_id}&rdquo; Siap Dipasang
                  </h4>
                  <p className="text-xs text-zen-charcoal/75">
                    Simpan segera di Environment Variables Coolify (`Base Directory: /watchdog-agent`, `Build Pack: Docker Compose`, tanpa domain/port publik).
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-zen-charcoal/70 mb-1">
                  <span>WATCHDOG_INGEST_TOKEN</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(generated.token, 'raw')}
                    className="inline-flex items-center space-x-1 text-primary-700 hover:text-primary-800"
                  >
                    {copiedKey === 'raw' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedKey === 'raw' ? 'Tersalin' : 'Salin Token'}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-primary-200 font-mono text-xs break-all text-zen-charcoal">
                  {generated.token}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-zen-charcoal/70 mb-1">
                  <span>Blok Environment Variables Coolify (.env)</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(coolifyEnvSnippet, 'env')}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-primary-600 text-white hover:bg-primary-700"
                  >
                    {copiedKey === 'env' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedKey === 'env' ? 'Blok Tersalin!' : 'Salin Semua ENV'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-zen-charcoal text-zen-linen text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  {coolifyEnvSnippet}
                </pre>
              </div>
            </div>
          )}

          {/* Daftar Token Terdaftar */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zen-charcoal/70 mb-2">
              Daftar Token Node Terdaftar ({tokens.length})
            </h4>
            {tokens.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-zen-sand text-center text-xs text-zen-charcoal/60">
                Belum ada token Watchdog yang dibuat. Buat token pertama Anda di atas.
              </div>
            ) : (
              <div className="border border-zen-sand/70 rounded-xl overflow-hidden divide-y divide-zen-sand/50">
                {tokens.map((t) => (
                  <div
                    key={t.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-zen-charcoal">
                          {t.node_id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            t.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-stone-100 text-stone-600 border-stone-200'
                          }`}
                        >
                          {t.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <div className="text-xs text-zen-charcoal/70 mt-0.5">
                        {t.label} • Prefix: <code className="font-mono">{t.token_prefix}...</code>
                      </div>
                      <div className="text-[11px] text-zen-charcoal/55 mt-0.5">
                        Terakhir digunakan:{' '}
                        {t.last_used_at
                          ? `${formatTimestampID(t.last_used_at)} (${formatRelativeAgeID(t.last_used_at)})`
                          : 'Belum pernah mengirim heartbeat'}
                      </div>
                    </div>
                    {t.is_active && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(t.node_id)}
                        disabled={revokingNode === t.node_id}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 shrink-0 self-start sm:self-center"
                      >
                        {revokingNode === t.node_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        <span>Nonaktifkan</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WatchdogsPage({ onRequestLogin }) {
  const { user, isSuperuser, loading: authLoading } = useAuth();

  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [tokens, setTokens] = useState([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [timeWindow, setTimeWindow] = useState('6h');

  const [showResolvedAlerts, setShowResolvedAlerts] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);

  const [containerSearch, setContainerSearch] = useState('');
  const [containerFilter, setContainerFilter] = useState('all');
  const [containerSort, setContainerSort] = useState('cpu');

  const [procSearch, setProcSearch] = useState('');
  const [onlySuspicious, setOnlySuspicious] = useState(false);
  const [procSort, setProcSort] = useState('cpu');

  const isFetchingRef = useRef(false);

  const fetchDashboardData = useCallback(
    async (silent = false) => {
      if (!supabase || !IS_SUPABASE_CONFIGURED || !isSuperuser) {
        setInitialLoading(false);
        return;
      }
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (silent) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }

      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [nodesRes, alertsRes, tokensRes] = await Promise.all([
          supabase.from('vps_nodes').select('*').order('last_heartbeat_at', { ascending: false }),
          supabase.from('vps_alerts').select('*').order('last_seen_at', { ascending: false }).limit(100),
          supabase.rpc('list_vps_watchdog_tokens'),
        ]);

        if (nodesRes.error) throw nodesRes.error;
        if (alertsRes.error) throw alertsRes.error;
        if (tokensRes.error) throw tokensRes.error;

        const fetchedNodes = nodesRes.data || [];
        setNodes(fetchedNodes);
        setAlerts(alertsRes.data || []);
        setTokens(tokensRes.data || []);

        const activeTargetId =
          selectedNodeId && fetchedNodes.some((n) => n.node_id === selectedNodeId)
            ? selectedNodeId
            : fetchedNodes[0]?.node_id || '';

        if (activeTargetId && activeTargetId !== selectedNodeId) {
          setSelectedNodeId(activeTargetId);
        }

        if (activeTargetId) {
          const histRes = await supabase
            .from('vps_metrics_history')
            .select(
              'id, node_id, recorded_at, cpu_total, cpu_nice, mem_percent, swap_percent, load_1m, load_5m, disk_percent, zombie_count, suspicious_count, container_running'
            )
            .eq('node_id', activeTargetId)
            .gte('recorded_at', since24h)
            .order('recorded_at', { ascending: true })
            .limit(1500);

          if (histRes.error) throw histRes.error;
          setHistory(histRes.data || []);
        } else {
          setHistory([]);
        }

        setErrorMsg('');
      } catch (err) {
        setErrorMsg(mapSafeErrorMessage(err));
      } finally {
        isFetchingRef.current = false;
        setInitialLoading(false);
        setRefreshing(false);
        setCountdown(AUTO_REFRESH_SECONDS);
      }
    },
    [isSuperuser, selectedNodeId]
  );

  useEffect(() => {
    if (!authLoading && isSuperuser) {
      fetchDashboardData(false);
    } else if (!authLoading) {
      setInitialLoading(false);
    }
  }, [authLoading, isSuperuser, fetchDashboardData]);

  // Visibility-aware 30-second auto-refresh
  useEffect(() => {
    if (!isSuperuser || nodes.length === 0) return undefined;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isSuperuser, nodes.length, fetchDashboardData]);

  useEffect(() => {
    if (countdown === 0 && isSuperuser && nodes.length > 0) {
      fetchDashboardData(true);
    }
  }, [countdown, isSuperuser, nodes.length, fetchDashboardData]);

  const activeNode = useMemo(
    () => nodes.find((n) => n.node_id === selectedNodeId) || nodes[0] || null,
    [nodes, selectedNodeId]
  );

  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    const hours = timeWindow === '1h' ? 1 : timeWindow === '6h' ? 6 : 24;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return history.filter((h) => new Date(h.recorded_at).getTime() >= cutoff);
  }, [history, timeWindow]);

  const nodeAlerts = useMemo(() => {
    if (!activeNode) return alerts;
    return alerts.filter((a) => a.node_id === activeNode.node_id);
  }, [alerts, activeNode]);

  const activeAlerts = useMemo(
    () => nodeAlerts.filter((a) => a.status !== 'RESOLVED'),
    [nodeAlerts]
  );
  const resolvedAlerts = useMemo(
    () => nodeAlerts.filter((a) => a.status === 'RESOLVED'),
    [nodeAlerts]
  );

  const filteredContainers = useMemo(() => {
    const raw = Array.isArray(activeNode?.containers) ? activeNode.containers : [];
    const q = containerSearch.trim().toLowerCase();
    const list = raw.filter((c) => {
      const matchQuery =
        !q ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.image || '').toLowerCase().includes(q) ||
        (c.ports || '').toLowerCase().includes(q);
      if (!matchQuery) return false;
      if (containerFilter === 'problem') {
        return c.health === 'unhealthy' || c.health === 'restarting' || (c.mem_mb || 0) >= 1536;
      }
      if (containerFilter === 'running') {
        return c.state === 'running';
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (containerSort === 'mem') return (b.mem_mb || 0) - (a.mem_mb || 0);
      return (b.cpu_percent || 0) - (a.cpu_percent || 0);
    });
  }, [activeNode, containerSearch, containerFilter, containerSort]);

  const filteredProcesses = useMemo(() => {
    const raw = Array.isArray(activeNode?.top_processes) ? activeNode.top_processes : [];
    const q = procSearch.trim().toLowerCase();
    const list = raw.filter((p) => {
      if (onlySuspicious && !p.is_suspicious) return false;
      if (!q) return true;
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.cmdline || '').toLowerCase().includes(q) ||
        (p.username || '').toLowerCase().includes(q) ||
        String(p.pid || '').includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (procSort === 'mem') return (b.rss_mb || 0) - (a.rss_mb || 0);
      return (b.cpu_percent || 0) - (a.cpu_percent || 0);
    });
  }, [activeNode, procSearch, onlySuspicious, procSort]);

  const handleAckAlert = async (alertId) => {
    setAcknowledgingId(alertId);
    try {
      const { error } = await supabase.rpc('acknowledge_vps_alert', {
        p_alert_id: alertId,
      });
      if (error) throw error;
      await fetchDashboardData(true);
    } catch (err) {
      setErrorMsg(mapSafeErrorMessage(err));
    } finally {
      setAcknowledgingId(null);
    }
  };

  // Loading auth state
  if (authLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-2xl bg-white border border-zen-sand/70 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white border border-zen-sand/70 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Strict Role ID 8 Lock Screen
  if (!isSuperuser) {
    return (
      <div className="max-w-xl mx-auto my-10 bg-white rounded-2xl border border-zen-sand/80 shadow-md p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-zen-charcoal">
          VPS Watchdogs — Akses Terkunci (SUPERUSER Role ID 8)
        </h1>
        <p className="text-sm text-zen-charcoal/75 leading-relaxed">
          {user
            ? 'Akun Anda saat ini tidak memiliki Role ID 8 (SUPERUSER). Metrik server VPS, daftar proses, status container Docker, dan log peringatan keamanan dikunci ketat di level database & UI.'
            : 'Halaman pemantauan infrastruktur server (Zen Watchdogs) bersifat privat untuk melindungi data sistem dan hanya dapat dibuka setelah masuk sebagai SUPERUSER (Role ID 8).'}
        </p>
        {!user && (
          <button
            type="button"
            onClick={onRequestLogin}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary-500 text-white hover:bg-primary-600 transition-colors shadow-sm"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Masuk Admin (Role 8)</span>
          </button>
        )}
      </div>
    );
  }

  const statusInfo = activeNode ? getNodeStatusInfo(activeNode.last_heartbeat_at) : null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-zen-sand/70 p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-700 text-xs font-semibold">
              <Activity className="h-3.5 w-3.5" />
              <span>Zen Watchdogs</span>
            </span>
            {statusInfo && (
              <span
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${statusInfo.badgeClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
                <span>{statusInfo.label}</span>
              </span>
            )}
            {activeNode?.suspicious_count > 0 && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-red-600 text-white text-xs font-bold animate-pulse">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>{activeNode.suspicious_count} Anomali Proses Terdeteksi</span>
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-zen-charcoal">
            {activeNode ? activeNode.label : 'Pemantauan Infrastruktur VPS & Container'}
          </h1>

          {activeNode ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zen-charcoal/70">
              <span>
                Host: <strong className="font-mono text-zen-charcoal">{activeNode.hostname || '-'}</strong>
              </span>
              <span>• {activeNode.os_info || 'Linux'}</span>
              <span>• Kernel {activeNode.kernel_version || '-'}</span>
              <span>• Uptime: {formatUptimeID(activeNode.uptime_seconds)}</span>
              <span>
                • Heartbeat: <strong>{formatTimestampID(activeNode.last_heartbeat_at)} WIB</strong> (
                {formatRelativeAgeID(activeNode.last_heartbeat_at)})
              </span>
            </div>
          ) : (
            <p className="text-xs text-zen-charcoal/70">
              Pemantauan real-time tanpa membuka port publik, dengan auto-redaction &amp; deteksi malware otomatis.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {nodes.length > 1 && (
            <select
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-zen-sand bg-zen-linen text-xs font-semibold text-zen-charcoal focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {nodes.map((n) => (
                <option key={n.node_id} value={n.node_id}>
                  {n.label} ({n.node_id})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-zen-linen hover:bg-zen-sand/40 border border-zen-sand text-zen-charcoal transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>
              {refreshing
                ? 'Menyegarkan...'
                : nodes.length > 0
                  ? `Segarkan (${countdown}d)`
                  : 'Segarkan'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTokenModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-primary-500 text-white hover:bg-primary-600 transition-colors shadow-sm"
          >
            <Key className="h-3.5 w-3.5" />
            <span>Kelola Token &amp; Setup Agent</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start space-x-2.5">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {initialLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-white border border-zen-sand/70 animate-pulse" />
          ))}
        </div>
      ) : !activeNode ? (
        /* Empty Onboarding Card before first agent heartbeat */
        <div className="bg-white rounded-2xl border border-zen-sand/80 p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-200 text-primary-600 flex items-center justify-center mx-auto">
            <Server className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-zen-charcoal">
            Belum Ada Heartbeat VPS Watchdog Diterima
          </h2>
          <p className="text-sm text-zen-charcoal/75 max-w-xl mx-auto">
            Buat token node terlebih dahulu, lalu deploy folder <code className="px-1.5 py-0.5 rounded bg-zen-linen border border-zen-sand text-xs">/watchdog-agent</code> di Coolify sebagai layanan Docker Compose tanpa domain/port publik. Data server akan otomatis muncul dalam 30 detik.
          </p>
          <button
            type="button"
            onClick={() => setTokenModalOpen(true)}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary-500 text-white hover:bg-primary-600 shadow-sm"
          >
            <Key className="h-4 w-4" />
            <span>Buat Token Agent Pertama</span>
          </button>
        </div>
      ) : (
        <>
          {/* Offline Warning Banner */}
          {statusInfo?.code === 'OFFLINE' && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-sm text-red-900 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <WifiOff className="h-5 w-5 text-red-600 shrink-0" />
                <span>
                  <strong>Koneksi Heartbeat Terputus:</strong> Agent VPS tidak mengirim pembaruan lebih dari 3 menit (terakhir {formatTimestampID(activeNode.last_heartbeat_at)} WIB). Periksa status container <code className="font-mono">zen-watchdog-agent</code> di Coolify.
                </span>
              </div>
            </div>
          )}

          {/* Panel Peringatan Keamanan & Kesehatan */}
          <div className="bg-white rounded-2xl border border-zen-sand/70 p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                {activeAlerts.length > 0 ? (
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                )}
                <h2 className="text-base font-bold text-zen-charcoal">
                  Peringatan Keamanan &amp; Kesehatan ({activeAlerts.length} Aktif)
                </h2>
              </div>

              {resolvedAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowResolvedAlerts(!showResolvedAlerts)}
                  className="inline-flex items-center space-x-1 text-xs font-medium text-zen-charcoal/70 hover:text-zen-charcoal"
                >
                  <span>Riwayat Selesai ({resolvedAlerts.length})</span>
                  {showResolvedAlerts ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>

            {activeAlerts.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs sm:text-sm text-emerald-900 flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  Tidak ada peringatan keamanan maupun beban kritis yang aktif saat ini.
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeAlerts.map((alert) => {
                  const isCrit = alert.severity === 'CRITICAL';
                  return (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                        isCrit
                          ? 'bg-red-50/90 border-red-200 text-red-950'
                          : 'bg-amber-50/90 border-amber-200 text-amber-950'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isCrit ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white/70 border border-black/10">
                            {alert.alert_key}
                          </span>
                          {alert.status === 'ACKNOWLEDGED' && (
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">
                              DIKETAHUI
                            </span>
                          )}
                          <span className="text-[11px] opacity-75">
                            Terpantau {alert.occurrences}x • Terakhir {formatRelativeAgeID(alert.last_seen_at)}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold">{alert.title}</h3>
                        <p className="text-xs opacity-90 break-words">{alert.message}</p>
                      </div>

                      {alert.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => handleAckAlert(alert.id)}
                          disabled={acknowledgingId === alert.id}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-black/15 hover:bg-zen-linen shrink-0 self-start"
                        >
                          {acknowledgingId === alert.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5 text-primary-600" />
                          )}
                          <span>Tandai Diketahui</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {showResolvedAlerts && resolvedAlerts.length > 0 && (
              <div className="pt-2 border-t border-zen-sand/60 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zen-charcoal/60">
                  Peringatan yang Sudah Pulih / Selesai
                </div>
                {resolvedAlerts.slice(0, 10).map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-lg bg-zen-linen/70 border border-zen-sand/60 text-xs text-zen-charcoal/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-semibold mr-2">[{alert.alert_key}]</span>
                      <span className="font-semibold">{alert.title}</span>
                    </div>
                    <span className="text-[11px] text-zen-charcoal/60 shrink-0">
                      Pulih: {formatTimestampID(alert.resolved_at)} WIB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4 Kartu KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: CPU & Load */}
            <div className="bg-white rounded-xl border border-zen-sand/70 p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zen-charcoal/70 uppercase tracking-wide">
                  CPU &amp; Beban ({activeNode.cpu_cores} Core)
                </span>
                <Cpu className="h-4 w-4 text-primary-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-zen-charcoal">
                  {Number(activeNode.cpu_total).toFixed(1)}%
                </span>
                <span
                  className={`text-xs font-semibold ${
                    Number(activeNode.cpu_nice) >= 25 ? 'text-red-600' : 'text-zen-charcoal/65'
                  }`}
                >
                  Nice: {Number(activeNode.cpu_nice).toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-zen-linen overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    Number(activeNode.cpu_total) >= 90
                      ? 'bg-red-500'
                      : Number(activeNode.cpu_total) >= 75
                        ? 'bg-amber-500'
                        : 'bg-primary-500'
                  }`}
                  style={{ width: `${Math.min(100, Number(activeNode.cpu_total) || 0)}%` }}
                />
              </div>
              <div className="text-[11px] text-zen-charcoal/65 flex justify-between">
                <span>
                  Load: <strong>{Number(activeNode.load_1m).toFixed(2)}</strong> /{' '}
                  {Number(activeNode.load_5m).toFixed(2)} / {Number(activeNode.load_15m).toFixed(2)}
                </span>
                <span>IO {Number(activeNode.cpu_iowait).toFixed(1)}%</span>
              </div>
            </div>

            {/* KPI 2: RAM & SWAP */}
            <div className="bg-white rounded-xl border border-zen-sand/70 p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zen-charcoal/70 uppercase tracking-wide">
                  Memori (RAM &amp; SWAP)
                </span>
                <Layers className="h-4 w-4 text-primary-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-zen-charcoal">
                  {Number(activeNode.mem_percent).toFixed(1)}%
                </span>
                <span className="text-xs text-zen-charcoal/70">
                  {(activeNode.mem_used_mb / 1024).toFixed(2)} /{' '}
                  {(activeNode.mem_total_mb / 1024).toFixed(2)} GiB
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-zen-linen overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    Number(activeNode.mem_percent) >= 90
                      ? 'bg-red-500'
                      : Number(activeNode.mem_percent) >= 80
                        ? 'bg-amber-500'
                        : 'bg-primary-500'
                  }`}
                  style={{ width: `${Math.min(100, Number(activeNode.mem_percent) || 0)}%` }}
                />
              </div>
              <div className="text-[11px] flex justify-between">
                {activeNode.swap_total_mb === 0 ? (
                  <span className="text-amber-700 font-semibold">
                    SWAP: 0 MB (Disarankan 4 GiB)
                  </span>
                ) : (
                  <span className="text-zen-charcoal/65">
                    SWAP: {activeNode.swap_used_mb} / {activeNode.swap_total_mb} MB (
                    {Number(activeNode.swap_percent).toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>

            {/* KPI 3: Disk */}
            <div className="bg-white rounded-xl border border-zen-sand/70 p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zen-charcoal/70 uppercase tracking-wide">
                  Penyimpanan Disk (/)
                </span>
                <HardDrive className="h-4 w-4 text-primary-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-zen-charcoal">
                  {Number(activeNode.disk_percent).toFixed(1)}%
                </span>
                <span className="text-xs text-zen-charcoal/70">
                  {Number(activeNode.disk_used_gb).toFixed(1)} /{' '}
                  {Number(activeNode.disk_total_gb).toFixed(1)} GB
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-zen-linen overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    Number(activeNode.disk_percent) >= 90
                      ? 'bg-red-500'
                      : Number(activeNode.disk_percent) >= 80
                        ? 'bg-amber-500'
                        : 'bg-primary-500'
                  }`}
                  style={{ width: `${Math.min(100, Number(activeNode.disk_percent) || 0)}%` }}
                />
              </div>
              <div className="text-[11px] text-zen-charcoal/65">
                Tersisa {(Number(activeNode.disk_total_gb) - Number(activeNode.disk_used_gb)).toFixed(1)} GB ruang kosong
              </div>
            </div>

            {/* KPI 4: Proses, Zombie & Container */}
            <div className="bg-white rounded-xl border border-zen-sand/70 p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zen-charcoal/70 uppercase tracking-wide">
                  Proses &amp; Container
                </span>
                <Package className="h-4 w-4 text-primary-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-zen-charcoal">
                  {activeNode.container_running}/{activeNode.container_total}
                  <span className="text-xs font-normal text-zen-charcoal/60 ml-1">container</span>
                </span>
                <span
                  className={`text-xs font-bold ${
                    activeNode.container_unhealthy > 0 ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  {activeNode.container_unhealthy > 0
                    ? `${activeNode.container_unhealthy} bermasalah`
                    : 'Semua sehat'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                <div className="rounded-lg bg-zen-linen px-1.5 py-1">
                  <div className="text-xs font-bold text-zen-charcoal">{activeNode.process_total}</div>
                  <div className="text-[10px] text-zen-charcoal/60">Proses</div>
                </div>
                <div
                  className={`rounded-lg px-1.5 py-1 ${
                    activeNode.zombie_count >= 20 ? 'bg-red-50 text-red-700' : 'bg-zen-linen'
                  }`}
                >
                  <div className="text-xs font-bold">{activeNode.zombie_count}</div>
                  <div className="text-[10px] opacity-75">Zombie</div>
                </div>
                <div
                  className={`rounded-lg px-1.5 py-1 ${
                    activeNode.suspicious_count > 0 ? 'bg-red-600 text-white' : 'bg-zen-linen'
                  }`}
                >
                  <div className="text-xs font-bold">{activeNode.suspicious_count}</div>
                  <div className="text-[10px] opacity-85">Anomali</div>
                </div>
              </div>
            </div>
          </div>

          {/* Grafik Riwayat 24 Jam */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-primary-600" />
                <h2 className="text-base font-bold text-zen-charcoal">Grafik Tren Performa VPS</h2>
              </div>
              <div className="inline-flex rounded-lg border border-zen-sand bg-white p-0.5 text-xs">
                {[
                  { id: '1h', label: '1 Jam' },
                  { id: '6h', label: '6 Jam' },
                  { id: '24h', label: '24 Jam' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTimeWindow(opt.id)}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      timeWindow === opt.id
                        ? 'bg-primary-500 text-white'
                        : 'text-zen-charcoal/75 hover:bg-zen-linen'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <MetricTrendChart
                title="Penggunaan CPU & Nice"
                unit="%"
                data={filteredHistory}
                primaryKey="cpu_total"
                secondaryKey="cpu_nice"
                primaryLabel="CPU Total"
                secondaryLabel="CPU Nice"
                primaryColor="#889D35"
                secondaryColor="#dc2626"
                fixedMaxY={100}
              />
              <MetricTrendChart
                title="Penggunaan Memori (RAM)"
                unit="%"
                data={filteredHistory}
                primaryKey="mem_percent"
                primaryLabel="RAM Terpakai"
                primaryColor="#2563eb"
                fixedMaxY={100}
              />
              <MetricTrendChart
                title="Load Average (1m vs 5m)"
                unit=""
                data={filteredHistory}
                primaryKey="load_1m"
                secondaryKey="load_5m"
                primaryLabel="Load 1m"
                secondaryLabel="Load 5m"
                primaryColor="#7c3aed"
                secondaryColor="#d97706"
              />
            </div>
          </div>

          {/* Tabel Container Docker */}
          <div className="bg-white rounded-2xl border border-zen-sand/70 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zen-sand/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Wifi className="h-4 w-4 text-primary-600" />
                <h2 className="text-base font-bold text-zen-charcoal">
                  Daftar Container Docker ({filteredContainers.length})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-zen-charcoal/50 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={containerSearch}
                    onChange={(e) => setContainerSearch(e.target.value)}
                    placeholder="Cari container / image..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zen-sand bg-zen-linen/60 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <select
                  value={containerFilter}
                  onChange={(e) => setContainerFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-zen-sand bg-white text-zen-charcoal"
                >
                  <option value="all">Semua Status</option>
                  <option value="running">Sedang Berjalan</option>
                  <option value="problem">Bermasalah / RAM Tinggi</option>
                </select>
                <button
                  type="button"
                  onClick={() => setContainerSort((s) => (s === 'cpu' ? 'mem' : 'cpu'))}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zen-sand bg-zen-linen hover:bg-zen-sand/40"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span>Urut: {containerSort === 'cpu' ? 'CPU%' : 'RAM MB'}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zen-linen/80 text-zen-charcoal/70 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Nama Container</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">CPU %</th>
                    <th className="px-4 py-2.5 text-right">RAM</th>
                    <th className="px-4 py-2.5">Image &amp; Port</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zen-sand/40">
                  {filteredContainers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zen-charcoal/60">
                        Tidak ada container yang cocok dengan filter saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredContainers.map((c) => {
                      const isBad = c.health === 'unhealthy' || c.health === 'restarting';
                      const isMemHeavy = (c.mem_mb || 0) >= 1536;
                      return (
                        <tr
                          key={c.id || c.name}
                          className={isBad ? 'bg-red-50/70' : isMemHeavy ? 'bg-amber-50/60' : 'hover:bg-zen-linen/40'}
                        >
                          <td className="px-4 py-2.5 font-mono font-semibold text-zen-charcoal">
                            <div>{c.name}</div>
                            <div className="text-[10px] font-normal text-zen-charcoal/55">{c.id}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isBad
                                  ? 'bg-red-100 text-red-800 border-red-200'
                                  : c.health === 'healthy' || c.state === 'running'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-stone-100 text-stone-700 border-stone-200'
                              }`}
                            >
                              {c.health && c.health !== 'none' ? c.health : c.state}
                            </span>
                            <div className="text-[10px] text-zen-charcoal/60 mt-0.5">{c.status}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold">
                            {Number(c.cpu_percent || 0).toFixed(1)}%
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-mono font-semibold ${
                              isMemHeavy ? 'text-amber-800' : ''
                            }`}
                          >
                            {Number(c.mem_mb || 0).toFixed(0)} MB
                          </td>
                          <td className="px-4 py-2.5 max-w-xs">
                            <div className="truncate font-mono text-[11px] text-zen-charcoal/80" title={c.image}>
                              {c.image || '-'}
                            </div>
                            {c.ports && (
                              <div className="truncate font-mono text-[10px] text-zen-charcoal/55">
                                {c.ports}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabel Proses Teratas & Anomali */}
          <div className="bg-white rounded-2xl border border-zen-sand/70 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zen-sand/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Terminal className="h-4 w-4 text-primary-600" />
                <h2 className="text-base font-bold text-zen-charcoal">
                  Proses Teratas &amp; Deteksi Anomali ({filteredProcesses.length})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-zen-charcoal/50 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={procSearch}
                    onChange={(e) => setProcSearch(e.target.value)}
                    placeholder="Cari PID, nama, atau cmd..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zen-sand bg-zen-linen/60 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setOnlySuspicious((v) => !v)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    onlySuspicious
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-zen-charcoal border-zen-sand hover:bg-zen-linen'
                  }`}
                >
                  Hanya Anomali
                </button>
                <button
                  type="button"
                  onClick={() => setProcSort((s) => (s === 'cpu' ? 'mem' : 'cpu'))}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zen-sand bg-zen-linen hover:bg-zen-sand/40"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span>Urut: {procSort === 'cpu' ? 'CPU%' : 'RAM MB'}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zen-linen/80 text-zen-charcoal/70 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">PID / User</th>
                    <th className="px-4 py-2.5">Nama Proses</th>
                    <th className="px-4 py-2.5 text-right">CPU %</th>
                    <th className="px-4 py-2.5 text-right">RAM (RSS)</th>
                    <th className="px-4 py-2.5">Perintah (Tersensor Aman)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zen-sand/40">
                  {filteredProcesses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zen-charcoal/60">
                        {onlySuspicious
                          ? 'Tidak ada proses mencurigakan terdeteksi — server bersih.'
                          : 'Tidak ada proses yang cocok dengan pencarian.'}
                      </td>
                    </tr>
                  ) : (
                    filteredProcesses.map((p) => (
                      <tr
                        key={p.pid}
                        className={p.is_suspicious ? 'bg-red-50/90 text-red-950' : 'hover:bg-zen-linen/40'}
                      >
                        <td className="px-4 py-2.5 font-mono">
                          <div className="font-semibold">{p.pid}</div>
                          <div className="text-[10px] opacity-70">{p.username}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-semibold">{p.name}</span>
                            {p.is_suspicious && (
                              <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">
                                {p.anomaly_code}
                              </span>
                            )}
                          </div>
                          {p.anomaly_reason && (
                            <div className="text-[10px] text-red-700 mt-0.5">{p.anomaly_reason}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">
                          {Number(p.cpu_percent || 0).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {Number(p.rss_mb || 0).toFixed(1)} MB
                        </td>
                        <td className="px-4 py-2.5 max-w-md">
                          <code className="block truncate font-mono text-[11px] opacity-80" title={p.cmdline}>
                            {p.cmdline || '-'}
                          </code>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <TokenSetupModal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        tokens={tokens}
        onRefresh={() => fetchDashboardData(true)}
      />
    </div>
  );
}

export default WatchdogsPage;
