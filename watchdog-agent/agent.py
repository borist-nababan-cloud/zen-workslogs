#!/usr/bin/env python3
"""
Zen Watchdog Agent - Lightweight, read-only, zero-dependency VPS & Docker monitor.
Pushes sanitized host metrics, container stats, and security anomaly alerts to Supabase
via scoped token RPC (`ingest_vps_watchdog`) without opening any inbound ports.
"""

from __future__ import annotations

import http.client
import json
import os
try:
    import pwd
except ImportError:  # Windows local testing
    pwd = None  # type: ignore[assignment]
import re
import signal
import socket
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

AGENT_VERSION = "1.0.0"

SECRET_ARG_RE = re.compile(
    r"(--(?:requirepass|password|passwd|pass|secret|token|api-key|apikey)(?:=|\s+))(\"[^\"]*\"|'[^']*'|[^\s]+)",
    re.IGNORECASE,
)
SECRET_ENV_RE = re.compile(
    r"\b((?:[A-Z0-9_]*?(?:PASSWORD|PASSWD|PASS|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|KEY))=)(\"[^\"]*\"|'[^']*'|[^\s]+)",
    re.IGNORECASE,
)
BEARER_RE = re.compile(r"\b(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)
URI_CRED_RE = re.compile(r"([a-zA-Z][a-zA-Z0-9+.-]*://[^:\s/@]+:)([^@\s/]+)(@)")

FAKE_KWORKER_NAME_RE = re.compile(
    r"^(?:\[)?(?:kworker/[0-9u]+:[0-9a-zA-Z-]+|ksoftirqd/\d+|kswapd\d+|migration/\d+|rcu_sched|rcu_preempt|watchdog/\d+)\]?$"
)
FAKE_KWORKER_CMD_RE = re.compile(
    r"(?:^|\s|\[)(?:kworker/[0-9u]+:[0-9]+|ksoftirqd/\d+|kswapd\d+|migration/\d+)(?:\]|$|\s)"
)
MALWARE_IOC_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    ("redis-server-re", re.compile(r"redis-server\s+re\b", re.IGNORECASE)),
    ("redis-se", re.compile(r"(?:^|\s|/)redis-se(?:\s|$)", re.IGNORECASE)),
    ("dot-kworkerd", re.compile(r"\.kworkerd\b", re.IGNORECASE)),
    ("dot-guard", re.compile(r"(?:^|\s|/)\.guard(?:\s|$)", re.IGNORECASE)),
    ("i2pd", re.compile(r"\bi2pd(?:-daemon)?\b", re.IGNORECASE)),
    ("xmrig", re.compile(r"\bxmrig\b", re.IGNORECASE)),
    ("kdevtmpfsi", re.compile(r"\bkdevtmpfsi\b", re.IGNORECASE)),
    ("kinsing", re.compile(r"\bkinsing\b", re.IGNORECASE)),
    ("stratum", re.compile(r"stratum\+(?:tcp|ssl|http)", re.IGNORECASE)),
    ("miner-bin", re.compile(r"\b(?:minerd|cpuminer|nbminer|lolminer|t-rex)\b", re.IGNORECASE)),
    ("kworker-flag-f", re.compile(r"\bkworker\s+-f\b", re.IGNORECASE)),
]


def redact_cmdline(text: str, max_len: int = 220) -> str:
    """Strip credentials, tokens, and secrets from command lines before transmission."""
    if not text:
        return ""
    cleaned = SECRET_ARG_RE.sub(r"\1[REDACTED]", text)
    cleaned = SECRET_ENV_RE.sub(r"\1[REDACTED]", cleaned)
    cleaned = BEARER_RE.sub(r"\1[REDACTED]", cleaned)
    cleaned = URI_CRED_RE.sub(r"\1[REDACTED]\3", cleaned)
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > max_len:
        return cleaned[: max_len - 3] + "..."
    return cleaned


def detect_process_anomaly(name: str, cmdline: str, rss_mb: float) -> Optional[Tuple[str, str]]:
    """
    Detect masquerading kernel threads (non-zero RSS) and cryptominer/botnet IOCs.
    Returns (reason_code, detail_text) or None if clean.
    """
    name_clean = (name or "").strip()
    cmd_clean = (cmdline or "").strip()
    combined = f"{name_clean} {cmd_clean}".strip()

    for ioc_code, pattern in MALWARE_IOC_PATTERNS:
        if pattern.search(combined):
            return ("MALWARE_IOC", f"Cocok dengan pola IOC malware ({ioc_code})")

    if rss_mb > 0 and (
        FAKE_KWORKER_NAME_RE.match(name_clean) or FAKE_KWORKER_CMD_RE.search(cmd_clean)
    ):
        return (
            "FAKE_KWORKER",
            f"Proses user-space (RSS {rss_mb:.1f} MB) menyamar sebagai kernel thread",
        )

    return None


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class Config:
    def __init__(self) -> None:
        self.supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
        self.supabase_anon_key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
        self.ingest_token = os.environ.get("WATCHDOG_INGEST_TOKEN", "").strip()
        self.poll_interval = max(10, _env_int("POLL_INTERVAL_SECONDS", 30))

        default_proc = "/host/proc" if Path("/host/proc/stat").exists() else "/proc"
        default_rootfs = "/host/rootfs" if Path("/host/rootfs").exists() else "/"
        self.proc_root = Path(os.environ.get("PROC_ROOT", default_proc))
        self.rootfs_path = os.environ.get("ROOTFS_PATH", default_rootfs)
        self.docker_sock = os.environ.get("DOCKER_SOCK", "/var/run/docker.sock")
        self.n8n_webhook_url = os.environ.get("N8N_ALERT_WEBHOOK_URL", "").strip()

        self.cpu_warn = _env_float("CPU_WARN", 80.0)
        self.cpu_crit = _env_float("CPU_CRIT", 92.0)
        self.cpu_nice_warn = _env_float("CPU_NICE_WARN", 30.0)
        self.cpu_nice_crit = _env_float("CPU_NICE_CRIT", 45.0)
        self.mem_warn = _env_float("MEM_WARN", 80.0)
        self.mem_crit = _env_float("MEM_CRIT", 90.0)
        self.disk_warn = _env_float("DISK_WARN", 80.0)
        self.disk_crit = _env_float("DISK_CRIT", 90.0)
        self.zombie_warn = _env_int("ZOMBIE_WARN", 20)
        self.zombie_crit = _env_int("ZOMBIE_CRIT", 100)
        self.container_mem_warn_mb = _env_int("CONTAINER_MEM_WARN_MB", 1536)
        self.container_mem_crit_mb = _env_int("CONTAINER_MEM_CRIT_MB", 2048)
        raw_allow = os.environ.get("CONTAINER_MEM_ALLOWLIST", "")
        self.container_mem_allowlist = [
            x.strip().lower() for x in raw_allow.split(",") if x.strip()
        ]


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_socket_path: str, timeout: float = 5.0) -> None:
        super().__init__("localhost", timeout=timeout)
        self.unix_socket_path = unix_socket_path

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect(self.unix_socket_path)
        self.sock = sock


def docker_get_json(sock_path: str, path: str, timeout: float = 5.0) -> Any:
    conn = UnixHTTPConnection(sock_path, timeout=timeout)
    try:
        conn.request("GET", path, headers={"Host": "docker"})
        resp = conn.getresponse()
        body = resp.read()
        if resp.status >= 400:
            raise RuntimeError(f"Docker API {path} returned HTTP {resp.status}")
        return json.loads(body.decode("utf-8", errors="replace"))
    finally:
        conn.close()


def read_host_metadata(proc_root: Path) -> Dict[str, Any]:
    hostname = socket.gethostname()
    hostname_file = proc_root / "sys" / "kernel" / "hostname"
    if hostname_file.exists():
        try:
            hostname = hostname_file.read_text(encoding="utf-8", errors="ignore").strip() or hostname
        except OSError:
            pass

    kernel_version = ""
    osrelease_file = proc_root / "sys" / "kernel" / "osrelease"
    if osrelease_file.exists():
        try:
            kernel_version = osrelease_file.read_text(encoding="utf-8", errors="ignore").strip()
        except OSError:
            pass

    os_info = "Linux"
    for candidate in (Path("/host/os-release"), Path("/etc/os-release")):
        if candidate.exists():
            try:
                for line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                    if line.startswith("PRETTY_NAME="):
                        os_info = line.split("=", 1)[1].strip().strip('"')
                        break
                if os_info != "Linux":
                    break
            except OSError:
                pass

    uptime_seconds = 0
    uptime_file = proc_root / "uptime"
    if uptime_file.exists():
        try:
            raw_up = uptime_file.read_text(encoding="utf-8", errors="ignore").split()[0]
            uptime_seconds = int(float(raw_up))
        except (OSError, IndexError, ValueError):
            pass

    return {
        "hostname": hostname,
        "os_info": os_info,
        "kernel_version": kernel_version,
        "uptime_seconds": uptime_seconds,
    }


def read_cpu_snapshot(proc_root: Path) -> Tuple[int, int, int, int, int, int, int]:
    """
    Returns (user, nice, system, idle, iowait, total, cores) from /proc/stat.
    """
    lines = (proc_root / "stat").read_text(encoding="utf-8", errors="ignore").splitlines()
    user = nice = system = idle = iowait = irq = softirq = steal = 0
    cores = 0
    for line in lines:
        if line.startswith("cpu "):
            parts = [int(x) for x in line.split()[1:9]]
            while len(parts) < 8:
                parts.append(0)
            user, nice, system, idle, iowait, irq, softirq, steal = parts[:8]
        elif line.startswith("cpu") and len(line) > 3 and line[3].isdigit():
            cores += 1
    total = user + nice + system + idle + iowait + irq + softirq + steal
    return (user, nice, system + irq + softirq, idle, iowait, total, max(1, cores))


def compute_cpu_metrics(
    prev: Optional[Tuple[int, int, int, int, int, int, int]],
    curr: Tuple[int, int, int, int, int, int, int],
) -> Tuple[Dict[str, Any], int]:
    cores = curr[6]
    if prev is None:
        return (
            {
                "cpu_cores": cores,
                "cpu_total": 0.0,
                "cpu_user": 0.0,
                "cpu_system": 0.0,
                "cpu_nice": 0.0,
                "cpu_iowait": 0.0,
            },
            0,
        )

    du = max(0, curr[0] - prev[0])
    dn = max(0, curr[1] - prev[1])
    ds = max(0, curr[2] - prev[2])
    di = max(0, curr[3] - prev[3])
    dw = max(0, curr[4] - prev[4])
    dt = max(1, curr[5] - prev[5])

    busy = max(0, dt - di - dw)
    return (
        {
            "cpu_cores": cores,
            "cpu_total": round((busy / dt) * 100.0, 2),
            "cpu_user": round((du / dt) * 100.0, 2),
            "cpu_system": round((ds / dt) * 100.0, 2),
            "cpu_nice": round((dn / dt) * 100.0, 2),
            "cpu_iowait": round((dw / dt) * 100.0, 2),
        },
        dt,
    )


def read_mem_info(proc_root: Path) -> Tuple[Dict[str, Any], int]:
    kv: Dict[str, int] = {}
    for line in (proc_root / "meminfo").read_text(encoding="utf-8", errors="ignore").splitlines():
        if ":" not in line:
            continue
        k, rest = line.split(":", 1)
        parts = rest.strip().split()
        if parts:
            try:
                kv[k.strip()] = int(parts[0])
            except ValueError:
                pass

    mem_total_kb = kv.get("MemTotal", 0)
    mem_avail_kb = kv.get("MemAvailable", kv.get("MemFree", 0))
    mem_used_kb = max(0, mem_total_kb - mem_avail_kb)
    mem_pct = round((mem_used_kb / mem_total_kb) * 100.0, 2) if mem_total_kb > 0 else 0.0

    swap_total_kb = kv.get("SwapTotal", 0)
    swap_free_kb = kv.get("SwapFree", 0)
    swap_used_kb = max(0, swap_total_kb - swap_free_kb)
    swap_pct = round((swap_used_kb / swap_total_kb) * 100.0, 2) if swap_total_kb > 0 else 0.0

    return (
        {
            "mem_total_mb": int(round(mem_total_kb / 1024)),
            "mem_used_mb": int(round(mem_used_kb / 1024)),
            "mem_available_mb": int(round(mem_avail_kb / 1024)),
            "mem_percent": mem_pct,
            "swap_total_mb": int(round(swap_total_kb / 1024)),
            "swap_used_mb": int(round(swap_used_kb / 1024)),
            "swap_percent": swap_pct,
        },
        mem_total_kb,
    )


def read_load_avg(proc_root: Path) -> Dict[str, float]:
    parts = (proc_root / "loadavg").read_text(encoding="utf-8", errors="ignore").split()
    return {
        "load_1m": round(float(parts[0]), 2) if len(parts) > 0 else 0.0,
        "load_5m": round(float(parts[1]), 2) if len(parts) > 1 else 0.0,
        "load_15m": round(float(parts[2]), 2) if len(parts) > 2 else 0.0,
    }


def read_disk_usage(rootfs_path: str) -> Dict[str, float]:
    st = os.statvfs(rootfs_path)
    total_bytes = st.f_blocks * st.f_frsize
    avail_bytes = st.f_bavail * st.f_frsize
    used_bytes = max(0, total_bytes - (st.f_bfree * st.f_frsize))
    # Match df semantics on used% against (used + avail)
    effective_total = used_bytes + avail_bytes
    pct = round((used_bytes / effective_total) * 100.0, 2) if effective_total > 0 else 0.0
    gb = 1024 ** 3
    return {
        "disk_total_gb": round(total_bytes / gb, 2),
        "disk_used_gb": round(used_bytes / gb, 2),
        "disk_percent": pct,
    }


def _resolve_username(uid: int) -> str:
    if pwd is None:
        return str(uid)
    try:
        return pwd.getpwuid(uid).pw_name
    except KeyError:
        return str(uid)


def collect_processes(
    proc_root: Path,
    prev_proc_ticks: Dict[Tuple[int, int], int],
    total_cpu_delta: int,
    cpu_cores: int,
    mem_total_kb: int,
) -> Tuple[Dict[str, Any], Dict[Tuple[int, int], int], List[Dict[str, Any]], List[Dict[str, Any]]]:
    page_size = os.sysconf("SC_PAGE_SIZE")
    next_proc_ticks: Dict[Tuple[int, int], int] = {}
    process_total = 0
    process_running = 0
    zombie_count = 0

    candidates: List[Dict[str, Any]] = []
    suspicious: List[Dict[str, Any]] = []

    for entry in os.scandir(proc_root):
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        pid_dir = Path(entry.path)
        try:
            dir_stat = entry.stat()
            stat_text = (pid_dir / "stat").read_text(encoding="utf-8", errors="ignore")
        except (OSError, ProcessLookupError):
            continue

        lparen = stat_text.find("(")
        rparen = stat_text.rfind(")")
        if lparen == -1 or rparen == -1 or rparen <= lparen:
            continue

        comm = stat_text[lparen + 1 : rparen]
        after = stat_text[rparen + 2 :].split()
        if len(after) < 22:
            continue

        state = after[0]
        try:
            utime = int(after[11])
            stime = int(after[12])
            nice = int(after[16])
            num_threads = int(after[17])
            starttime = int(after[19])
            rss_pages = int(after[21])
        except ValueError:
            continue

        process_total += 1
        if state == "R":
            process_running += 1
        elif state == "Z":
            zombie_count += 1
            continue  # Zombie holds no RSS/CPU; counted cleanly above

        ticks = utime + stime
        key = (pid, starttime)
        next_proc_ticks[key] = ticks

        cpu_pct = 0.0
        if total_cpu_delta > 0 and key in prev_proc_ticks:
            proc_delta = max(0, ticks - prev_proc_ticks[key])
            cpu_pct = round(
                min(cpu_cores * 100.0, (proc_delta / total_cpu_delta) * cpu_cores * 100.0),
                1,
            )

        rss_mb = round((rss_pages * page_size) / (1024 * 1024), 1)
        mem_pct = (
            round(((rss_pages * page_size) / 1024.0 / mem_total_kb) * 100.0, 2)
            if mem_total_kb > 0
            else 0.0
        )

        cmdline_raw = ""
        if rss_pages > 0 or cpu_pct > 0 or "kwork" in comm or "redis" in comm or "guard" in comm:
            try:
                raw_bytes = (pid_dir / "cmdline").read_bytes()
                cmdline_raw = raw_bytes.replace(b"\x00", b" ").decode("utf-8", errors="replace").strip()
            except (OSError, ProcessLookupError):
                cmdline_raw = ""

        anomaly = detect_process_anomaly(comm, cmdline_raw or f"[{comm}]", rss_mb)
        is_suspicious = anomaly is not None
        item = {
            "pid": pid,
            "name": comm,
            "username": _resolve_username(dir_stat.st_uid),
            "state": state,
            "cpu_percent": cpu_pct,
            "mem_percent": mem_pct,
            "rss_mb": rss_mb,
            "threads": num_threads,
            "nice": nice,
            "cmdline": redact_cmdline(cmdline_raw or f"[{comm}]"),
            "is_suspicious": is_suspicious,
            "anomaly_code": anomaly[0] if anomaly else None,
            "anomaly_reason": anomaly[1] if anomaly else None,
        }
        if is_suspicious:
            suspicious.append(item)
        candidates.append(item)

    candidates.sort(key=lambda x: (1 if x["is_suspicious"] else 0, x["cpu_percent"], x["rss_mb"]), reverse=True)
    top_processes = candidates[:25]

    summary = {
        "process_total": process_total,
        "process_running": process_running,
        "zombie_count": zombie_count,
        "suspicious_count": len(suspicious),
    }
    return summary, next_proc_ticks, top_processes, suspicious


def _parse_docker_health(status_text: str, state: str) -> str:
    low = (status_text or "").lower()
    if "(unhealthy)" in low:
        return "unhealthy"
    if "(health: starting)" in low or "(starting)" in low:
        return "starting"
    if "(healthy)" in low:
        return "healthy"
    if state == "restarting":
        return "restarting"
    return "none"


def _format_docker_ports(ports: Any) -> str:
    if not isinstance(ports, list):
        return ""
    formatted: List[str] = []
    seen = set()
    for p in ports:
        if not isinstance(p, dict):
            continue
        priv = p.get("PrivatePort")
        pub = p.get("PublicPort")
        proto = p.get("Type", "tcp")
        label = f"{pub}->{priv}/{proto}" if pub else f"{priv}/{proto}"
        if label not in seen:
            seen.add(label)
            formatted.append(label)
    return ", ".join(formatted[:6])


def _fetch_single_container_stat(sock_path: str, cid: str) -> Optional[Dict[str, Any]]:
    try:
        return docker_get_json(sock_path, f"/containers/{cid}/stats?stream=false&one-shot=true", timeout=4.0)
    except Exception:
        return None


def collect_containers(
    sock_path: str, prev_container_cpu: Dict[str, Tuple[int, int]]
) -> Tuple[Dict[str, int], List[Dict[str, Any]], Dict[str, Tuple[int, int]]]:
    if not Path(sock_path).exists():
        return {"container_total": 0, "container_running": 0, "container_unhealthy": 0}, [], prev_container_cpu

    try:
        raw_containers = docker_get_json(sock_path, "/containers/json?all=1", timeout=5.0)
    except Exception:
        return {"container_total": 0, "container_running": 0, "container_unhealthy": 0}, [], prev_container_cpu

    if not isinstance(raw_containers, list):
        return {"container_total": 0, "container_running": 0, "container_unhealthy": 0}, [], prev_container_cpu

    running_ids = [c["Id"] for c in raw_containers if (c.get("State") or "").lower() == "running"]
    stats_map: Dict[str, Dict[str, Any]] = {}

    if running_ids:
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(_fetch_single_container_stat, sock_path, cid): cid for cid in running_ids}
            for fut in as_completed(futures):
                cid = futures[fut]
                res = fut.result()
                if isinstance(res, dict):
                    stats_map[cid] = res

    next_cpu_cache: Dict[str, Tuple[int, int]] = {}
    items: List[Dict[str, Any]] = []
    running_count = 0
    unhealthy_count = 0

    for c in raw_containers:
        cid = c.get("Id", "")
        short_id = cid[:12]
        names = c.get("Names") or []
        name = (names[0] if names else short_id).lstrip("/")
        state = (c.get("State") or "unknown").lower()
        status_text = c.get("Status") or state
        health = _parse_docker_health(status_text, state)

        if state == "running":
            running_count += 1
        if health in ("unhealthy", "restarting"):
            unhealthy_count += 1

        cpu_pct = 0.0
        mem_mb = 0.0

        st = stats_map.get(cid)
        if st:
            cpu_stats = st.get("cpu_stats") or {}
            pre_stats = st.get("precpu_stats") or {}
            cur_total = ((cpu_stats.get("cpu_usage") or {}).get("total_usage")) or 0
            cur_sys = cpu_stats.get("system_cpu_usage") or 0
            online_cpus = cpu_stats.get("online_cpus") or len((cpu_stats.get("cpu_usage") or {}).get("percpu_usage") or []) or 1

            next_cpu_cache[cid] = (cur_total, cur_sys)
            prev_pair = prev_container_cpu.get(cid)
            if prev_pair is not None:
                prev_total, prev_sys = prev_pair
            else:
                prev_total = ((pre_stats.get("cpu_usage") or {}).get("total_usage")) or 0
                prev_sys = pre_stats.get("system_cpu_usage") or 0

            cpu_delta = cur_total - prev_total
            sys_delta = cur_sys - prev_sys
            if cpu_delta > 0 and sys_delta > 0:
                cpu_pct = round((cpu_delta / sys_delta) * online_cpus * 100.0, 2)

            mem_stats = st.get("memory_stats") or {}
            mem_usage = mem_stats.get("usage") or 0
            mem_details = mem_stats.get("stats") or {}
            cache_bytes = mem_details.get("inactive_file", mem_details.get("cache", 0)) or 0
            mem_mb = round(max(0, mem_usage - cache_bytes) / (1024 * 1024), 1)

        items.append(
            {
                "id": short_id,
                "name": name,
                "image": c.get("Image") or "",
                "state": state,
                "status": status_text,
                "health": health,
                "cpu_percent": cpu_pct,
                "mem_mb": mem_mb,
                "ports": _format_docker_ports(c.get("Ports")),
            }
        )

    items.sort(
        key=lambda x: (
            1 if x["health"] in ("unhealthy", "restarting") else 0,
            x["cpu_percent"],
            x["mem_mb"],
        ),
        reverse=True,
    )

    summary = {
        "container_total": len(raw_containers),
        "container_running": running_count,
        "container_unhealthy": unhealthy_count,
    }
    return summary, items[:60], next_cpu_cache


def evaluate_alerts(
    snapshot: Dict[str, Any],
    containers: List[Dict[str, Any]],
    suspicious_procs: List[Dict[str, Any]],
    cfg: Config,
) -> List[Dict[str, Any]]:
    alerts: List[Dict[str, Any]] = []

    fake_kworkers = [p for p in suspicious_procs if p.get("anomaly_code") == "FAKE_KWORKER"]
    ioc_procs = [p for p in suspicious_procs if p.get("anomaly_code") == "MALWARE_IOC"]

    if fake_kworkers:
        sample = ", ".join(f"{p['name']} (PID {p['pid']}, {p['rss_mb']} MB)" for p in fake_kworkers[:5])
        alerts.append(
            {
                "alert_key": "FAKE_KWORKER",
                "severity": "CRITICAL",
                "title": "Terdeteksi Proses Palsu Menyerupai Kernel Thread",
                "message": f"Ditemukan {len(fake_kworkers)} proses user-space yang menyamar sebagai kernel thread: {sample}.",
                "details": {"count": len(fake_kworkers), "pids": [p["pid"] for p in fake_kworkers[:10]]},
            }
        )

    if ioc_procs:
        sample = ", ".join(f"{p['name']} (PID {p['pid']}, CPU {p['cpu_percent']}%)" for p in ioc_procs[:5])
        alerts.append(
            {
                "alert_key": "MALWARE_IOC",
                "severity": "CRITICAL",
                "title": "Terdeteksi Indikator Malware / Cryptominer Aktif",
                "message": f"Ditemukan {len(ioc_procs)} proses cocok dengan pola cryptominer/botnet: {sample}.",
                "details": {"count": len(ioc_procs), "pids": [p["pid"] for p in ioc_procs[:10]]},
            }
        )

    zombies = snapshot.get("zombie_count", 0)
    if zombies >= cfg.zombie_crit:
        alerts.append(
            {
                "alert_key": "ZOMBIE_FLOOD",
                "severity": "CRITICAL",
                "title": f"Lonjakan Proses Zombie Ekstrem ({zombies} Proses)",
                "message": f"Terdapat {zombies} proses berstatus zombie (Z). Segera periksa container atau skrip yang bermasalah.",
                "details": {"zombie_count": zombies},
            }
        )
    elif zombies >= cfg.zombie_warn:
        alerts.append(
            {
                "alert_key": "ZOMBIE_FLOOD",
                "severity": "WARNING",
                "title": f"Jumlah Proses Zombie Meningkat ({zombies} Proses)",
                "message": f"Terdeteksi {zombies} proses zombie pada host (batas peringatan {cfg.zombie_warn}).",
                "details": {"zombie_count": zombies},
            }
        )

    cpu_total = snapshot.get("cpu_total", 0.0)
    if cpu_total >= cfg.cpu_crit:
        alerts.append(
            {
                "alert_key": "CPU_HIGH",
                "severity": "CRITICAL",
                "title": f"Pemakaian CPU Kritis ({cpu_total:.1f}%)",
                "message": f"Total penggunaan CPU mencapai {cpu_total:.1f}% (User {snapshot.get('cpu_user', 0):.1f}%, Sys {snapshot.get('cpu_system', 0):.1f}%, Nice {snapshot.get('cpu_nice', 0):.1f}%).",
                "details": {"cpu_total": cpu_total},
            }
        )
    elif cpu_total >= cfg.cpu_warn:
        alerts.append(
            {
                "alert_key": "CPU_HIGH",
                "severity": "WARNING",
                "title": f"Pemakaian CPU Tinggi ({cpu_total:.1f}%)",
                "message": f"Total penggunaan CPU berada di {cpu_total:.1f}% (ambang peringatan {cfg.cpu_warn:.0f}%).",
                "details": {"cpu_total": cpu_total},
            }
        )

    cpu_nice = snapshot.get("cpu_nice", 0.0)
    if cpu_nice >= cfg.cpu_nice_crit:
        alerts.append(
            {
                "alert_key": "CPU_NICE_HIGH",
                "severity": "CRITICAL",
                "title": f"Lonjakan CPU Nice Tidak Wajar ({cpu_nice:.1f}%)",
                "message": f"Pemakaian CPU pada prioritas nice mencapai {cpu_nice:.1f}%, sering mengindikasikan tugas latar belakang berat atau cryptominer.",
                "details": {"cpu_nice": cpu_nice},
            }
        )
    elif cpu_nice >= cfg.cpu_nice_warn:
        alerts.append(
            {
                "alert_key": "CPU_NICE_HIGH",
                "severity": "WARNING",
                "title": f"CPU Nice Tinggi ({cpu_nice:.1f}%)",
                "message": f"Pemakaian CPU nice terpantau {cpu_nice:.1f}% (ambang {cfg.cpu_nice_warn:.0f}%).",
                "details": {"cpu_nice": cpu_nice},
            }
        )

    mem_pct = snapshot.get("mem_percent", 0.0)
    if mem_pct >= cfg.mem_crit:
        alerts.append(
            {
                "alert_key": "MEM_HIGH",
                "severity": "CRITICAL",
                "title": f"Pemakaian RAM Kritis ({mem_pct:.1f}%)",
                "message": f"RAM terpakai {snapshot.get('mem_used_mb', 0)} MB dari {snapshot.get('mem_total_mb', 0)} MB ({mem_pct:.1f}%). Risiko OOM Killer tinggi.",
                "details": {"mem_percent": mem_pct},
            }
        )
    elif mem_pct >= cfg.mem_warn:
        alerts.append(
            {
                "alert_key": "MEM_HIGH",
                "severity": "WARNING",
                "title": f"Pemakaian RAM Tinggi ({mem_pct:.1f}%)",
                "message": f"RAM terpakai {snapshot.get('mem_used_mb', 0)} MB dari {snapshot.get('mem_total_mb', 0)} MB ({mem_pct:.1f}%).",
                "details": {"mem_percent": mem_pct},
            }
        )

    disk_pct = snapshot.get("disk_percent", 0.0)
    if disk_pct >= cfg.disk_crit:
        alerts.append(
            {
                "alert_key": "DISK_HIGH",
                "severity": "CRITICAL",
                "title": f"Kapasitas Disk Hampir Penuh ({disk_pct:.1f}%)",
                "message": f"Disk root terpakai {snapshot.get('disk_used_gb', 0)} GB dari {snapshot.get('disk_total_gb', 0)} GB.",
                "details": {"disk_percent": disk_pct},
            }
        )
    elif disk_pct >= cfg.disk_warn:
        alerts.append(
            {
                "alert_key": "DISK_HIGH",
                "severity": "WARNING",
                "title": f"Pemakaian Disk Tinggi ({disk_pct:.1f}%)",
                "message": f"Disk root terpakai {snapshot.get('disk_used_gb', 0)} GB dari {snapshot.get('disk_total_gb', 0)} GB.",
                "details": {"disk_percent": disk_pct},
            }
        )

    cores = max(1, snapshot.get("cpu_cores", 1))
    load_5m = snapshot.get("load_5m", 0.0)
    if load_5m >= cores * 2.0:
        alerts.append(
            {
                "alert_key": "LOAD_HIGH",
                "severity": "CRITICAL",
                "title": f"Load Average Overload ({load_5m:.2f} / {cores} Core)",
                "message": f"Load rata-rata 5 menit ({load_5m:.2f}) melebihi 2x jumlah core CPU ({cores}).",
                "details": {"load_5m": load_5m, "cpu_cores": cores},
            }
        )
    elif load_5m >= cores * 1.25:
        alerts.append(
            {
                "alert_key": "LOAD_HIGH",
                "severity": "WARNING",
                "title": f"Load Average Tinggi ({load_5m:.2f} / {cores} Core)",
                "message": f"Load rata-rata 5 menit ({load_5m:.2f}) melebihi kapasitas ideal {cores} core.",
                "details": {"load_5m": load_5m, "cpu_cores": cores},
            }
        )

    if snapshot.get("swap_total_mb", 0) == 0:
        alerts.append(
            {
                "alert_key": "NO_SWAP",
                "severity": "WARNING",
                "title": "VPS Tidak Memiliki Memori SWAP",
                "message": "SwapTotal terbaca 0 MB. Aktifkan swapfile agar sistem terlindung dari OOM saat lonjakan memori.",
                "details": {"swap_total_mb": 0},
            }
        )

    bad_containers = [c for c in containers if c.get("health") in ("unhealthy", "restarting")]
    if bad_containers:
        names = ", ".join(f"{c['name']} ({c['health']})" for c in bad_containers[:5])
        alerts.append(
            {
                "alert_key": "CONTAINER_UNHEALTHY",
                "severity": "CRITICAL",
                "title": f"{len(bad_containers)} Container Tidak Sehat / Restarting",
                "message": f"Container bermasalah: {names}.",
                "details": {"containers": [c["name"] for c in bad_containers[:10]]},
            }
        )

    heavy_containers = []
    for c in containers:
        cname = (c.get("name") or "").lower()
        if any(allow in cname for allow in cfg.container_mem_allowlist):
            continue
        if (c.get("mem_mb") or 0) >= cfg.container_mem_warn_mb:
            heavy_containers.append(c)

    if heavy_containers:
        top_heavy = max(heavy_containers, key=lambda x: x.get("mem_mb") or 0)
        sev = "CRITICAL" if top_heavy["mem_mb"] >= cfg.container_mem_crit_mb else "WARNING"
        desc = ", ".join(f"{c['name']} ({c['mem_mb']:.0f} MB)" for c in heavy_containers[:5])
        alerts.append(
            {
                "alert_key": "CONTAINER_MEM_SPIKE",
                "severity": sev,
                "title": f"Lonjakan Memori Container ({top_heavy['mem_mb']:.0f} MB)",
                "message": f"Container dengan konsumsi memori tinggi: {desc}.",
                "details": {"top_container": top_heavy["name"], "mem_mb": top_heavy["mem_mb"]},
            }
        )

    return alerts


def push_to_supabase(cfg: Config, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{cfg.supabase_url}/rest/v1/rpc/ingest_vps_watchdog"
    body = json.dumps({"p_token": cfg.ingest_token, "p_payload": payload}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "apikey": cfg.supabase_anon_key,
            "Authorization": f"Bearer {cfg.supabase_anon_key}",
            "Content-Type": "application/json",
            "User-Agent": f"zen-watchdog-agent/{AGENT_VERSION}",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {"ok": True}


def notify_n8n_if_needed(
    cfg: Config,
    rpc_result: Dict[str, Any],
    snapshot: Dict[str, Any],
    alerts: List[Dict[str, Any]],
) -> None:
    if not cfg.n8n_webhook_url:
        return
    opened = rpc_result.get("newly_opened") or []
    resolved = rpc_result.get("newly_resolved") or []
    if not opened and not resolved:
        return

    opened_details = [a for a in alerts if a.get("alert_key") in opened]
    webhook_payload = {
        "source": "zen-watchdog-agent",
        "node_id": rpc_result.get("node_id"),
        "hostname": snapshot.get("hostname"),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "newly_opened_keys": opened,
        "newly_resolved_keys": resolved,
        "newly_opened_alerts": opened_details,
        "metrics": {
            "cpu_total": snapshot.get("cpu_total"),
            "cpu_nice": snapshot.get("cpu_nice"),
            "mem_percent": snapshot.get("mem_percent"),
            "load_5m": snapshot.get("load_5m"),
            "disk_percent": snapshot.get("disk_percent"),
            "zombie_count": snapshot.get("zombie_count"),
            "suspicious_count": snapshot.get("suspicious_count"),
        },
    }
    req = urllib.request.Request(
        cfg.n8n_webhook_url,
        data=json.dumps(webhook_payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": f"zen-watchdog-agent/{AGENT_VERSION}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(
                f"[INFO] Sent n8n alert webhook (opened={len(opened)}, resolved={len(resolved)}, HTTP {resp.status})",
                flush=True,
            )
    except Exception as exc:
        print(f"[WARN] Failed sending n8n alert webhook: {exc}", flush=True)


def run_self_test() -> int:
    # 1. Credential & secret redaction checks
    cases = [
        (
            "docker-entrypoint.sh redis-server --save 20 1 --requirepass dummy_redis_secret_123=",
            "dummy_redis_secret_123",
        ),
        (
            "node app.js --password=supersecret --token=tok_12345 PASSWORD=my_db_pass",
            "supersecret",
        ),
        (
            "psql postgresql://postgres:TopSecret99@db.example.com:5432/postgres",
            "TopSecret99",
        ),
        (
            "curl -H 'Authorization: Bearer dummy_bearer_token_998877' https://api.example.com",
            "dummy_bearer_token_998877",
        ),
    ]
    for raw, leaked_substr in cases:
        redacted = redact_cmdline(raw)
        assert leaked_substr not in redacted, f"Secret leaked in redacted output: {redacted}"
        assert "[REDACTED]" in redacted, f"Expected [REDACTED] marker in: {redacted}"

    # 2. Malware & fake kworker detection checks (true positives & true negatives)
    assert detect_process_anomaly("kworker/0:1", "[kworker/0:1]", 14.0)[0] == "FAKE_KWORKER"
    assert detect_process_anomaly("kworker/u16:2", "[kworker/u16:2]", 44.0)[0] == "FAKE_KWORKER"
    assert detect_process_anomaly("redis-server re", "redis-se", 2352.0)[0] == "MALWARE_IOC"
    assert detect_process_anomaly(".kworkerd", ".kworkerd", 10.0)[0] == "MALWARE_IOC"
    assert detect_process_anomaly("i2pd-daemon", "i2pd-daemon", 12.0)[0] == "MALWARE_IOC"
    assert detect_process_anomaly("kworker", "kworker -f .c", 23.0)[0] == "MALWARE_IOC"

    # Real kernel thread (RSS=0) and real Redis must NOT trigger false positives
    assert detect_process_anomaly("kworker/0:1-events", "[kworker/0:1-events]", 0.0) is None
    assert detect_process_anomaly("redis-server", "redis-server *:6379", 16.5) is None
    assert detect_process_anomaly("mysqld", "mysqld", 551.0) is None

    # 3. Alert evaluator checks
    cfg = Config()
    sample_snap = {
        "cpu_cores": 4,
        "cpu_total": 94.2,
        "cpu_user": 18.0,
        "cpu_system": 10.0,
        "cpu_nice": 46.0,
        "mem_total_mb": 7941,
        "mem_used_mb": 7200,
        "mem_percent": 90.7,
        "swap_total_mb": 0,
        "disk_total_gb": 76.4,
        "disk_used_gb": 21.1,
        "disk_percent": 27.6,
        "load_5m": 8.5,
        "zombie_count": 120,
    }
    sample_containers = [
        {"name": "bad-next", "health": "running", "mem_mb": 2700.0},
        {"name": "broken-app", "health": "unhealthy", "mem_mb": 50.0},
    ]
    sample_suspicious = [
        {"pid": 1, "name": "kworker/0:1", "rss_mb": 14.0, "cpu_percent": 0.5, "anomaly_code": "FAKE_KWORKER"},
        {"pid": 2, "name": "redis-server re", "rss_mb": 2352.0, "cpu_percent": 170.0, "anomaly_code": "MALWARE_IOC"},
    ]
    alerts = evaluate_alerts(sample_snap, sample_containers, sample_suspicious, cfg)
    keys = {a["alert_key"]: a["severity"] for a in alerts}
    expected_keys = {
        "FAKE_KWORKER": "CRITICAL",
        "MALWARE_IOC": "CRITICAL",
        "ZOMBIE_FLOOD": "CRITICAL",
        "CPU_HIGH": "CRITICAL",
        "CPU_NICE_HIGH": "CRITICAL",
        "MEM_HIGH": "CRITICAL",
        "LOAD_HIGH": "CRITICAL",
        "NO_SWAP": "WARNING",
        "CONTAINER_UNHEALTHY": "CRITICAL",
        "CONTAINER_MEM_SPIKE": "CRITICAL",
    }
    for k, sev in expected_keys.items():
        assert keys.get(k) == sev, f"Alert {k} expected {sev}, got {keys.get(k)}"

    print("Zen Watchdog Agent --self-test PASSED (all redaction, IOC, and alert checks OK).")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return run_self_test()

    cfg = Config()
    if not cfg.supabase_url or not cfg.supabase_anon_key or not cfg.ingest_token:
        print(
            "[ERROR] SUPABASE_URL, SUPABASE_ANON_KEY, and WATCHDOG_INGEST_TOKEN are required.",
            file=sys.stderr,
            flush=True,
        )
        return 1

    running = True

    def _handle_stop(_signum: int, _frame: Any) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)

    prev_cpu = read_cpu_snapshot(cfg.proc_root)
    prev_proc_ticks: Dict[Tuple[int, int], int] = {}
    prev_container_cpu: Dict[str, Tuple[int, int]] = {}

    # Warm up baseline ticks on boot so the very first pushed snapshot has accurate CPU%
    time.sleep(1.5)
    print(
        f"[INFO] Zen Watchdog Agent v{AGENT_VERSION} started "
        f"(interval={cfg.poll_interval}s, proc={cfg.proc_root}, docker={cfg.docker_sock})",
        flush=True,
    )

    while running:
        loop_start = time.monotonic()
        try:
            curr_cpu = read_cpu_snapshot(cfg.proc_root)
            cpu_metrics, total_cpu_delta = compute_cpu_metrics(prev_cpu, curr_cpu)
            prev_cpu = curr_cpu

            mem_metrics, mem_total_kb = read_mem_info(cfg.proc_root)
            load_metrics = read_load_avg(cfg.proc_root)
            disk_metrics = read_disk_usage(cfg.rootfs_path)
            host_metrics = read_host_metadata(cfg.proc_root)

            proc_summary, prev_proc_ticks, top_processes, suspicious_procs = collect_processes(
                cfg.proc_root,
                prev_proc_ticks,
                total_cpu_delta,
                cpu_metrics["cpu_cores"],
                mem_total_kb,
            )

            container_summary, containers, prev_container_cpu = collect_containers(
                cfg.docker_sock, prev_container_cpu
            )

            snapshot = {
                **host_metrics,
                **cpu_metrics,
                **mem_metrics,
                **load_metrics,
                **disk_metrics,
                **proc_summary,
                **container_summary,
                "agent_version": AGENT_VERSION,
            }
            alerts = evaluate_alerts(snapshot, containers, suspicious_procs, cfg)

            payload = {
                **snapshot,
                "containers": containers,
                "top_processes": top_processes,
                "alerts": alerts,
            }

            rpc_res = push_to_supabase(cfg, payload)
            notify_n8n_if_needed(cfg, rpc_res, snapshot, alerts)

            print(
                f"[INFO] Heartbeat ok node={rpc_res.get('node_id')} cpu={snapshot['cpu_total']}% "
                f"mem={snapshot['mem_percent']}% load={snapshot['load_5m']} "
                f"zombies={snapshot['zombie_count']} suspicious={snapshot['suspicious_count']} "
                f"alerts={len(alerts)}",
                flush=True,
            )
        except urllib.error.HTTPError as http_err:
            err_body = ""
            try:
                err_body = http_err.read().decode("utf-8", errors="replace")[:300]
            except Exception:
                pass
            print(f"[ERROR] Supabase HTTP {http_err.code}: {err_body}", file=sys.stderr, flush=True)
        except Exception as exc:
            print(f"[ERROR] Collector cycle failed: {exc}", file=sys.stderr, flush=True)

        elapsed = time.monotonic() - loop_start
        sleep_left = max(1.0, cfg.poll_interval - elapsed)
        deadline = time.monotonic() + sleep_left
        while running and time.monotonic() < deadline:
            time.sleep(min(1.0, max(0.1, deadline - time.monotonic())))

    print("[INFO] Zen Watchdog Agent stopped cleanly.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
