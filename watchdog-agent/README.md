# Zen Watchdog Agent (`watchdog-agent`)

Agent pemantau VPS DigitalOcean & container Docker berbasis Python 3.12 (tanpa dependensi eksternal, ~15–25 MB RAM, **0 port terbuka**, dan akses filesystem/Docker **read-only**).

## Keunggulan Keamanan Dibanding Glances Publik
1. **Tanpa Domain/Port Publik:** Agent hanya mengirim snapshot keluar (*outbound HTTPS*) ke RPC Supabase `public.ingest_vps_watchdog`.
2. **Token Terisolasi (*Least Privilege*):** Tidak menggunakan `SUPABASE_SERVICE_ROLE_KEY`. Token `WATCHDOG_INGEST_TOKEN` hanya dapat mengunggah metrik untuk satu `node_id` terdaftar.
3. **Auto-Redaction:** Argumen sensitif (`--requirepass`, `PASSWORD=`, `TOKEN=`, `Bearer`, kredensial URI) otomatis disensor menjadi `[REDACTED]` sebelum keluar dari VPS.
4. **Deteksi Ancaman Otomatis:** Mendeteksi proses zombie masif, kernel thread palsu (`[kworker/*]` dengan `RSS > 0`), serta pola cryptominer/botnet (`redis-server re`, `.kworkerd`, `.guard`, `i2pd`, `xmrig`), serta siap mengirim alert otomatis ke `N8N_ALERT_WEBHOOK_URL` bila diisi.

## Cara Deploy di Coolify
1. Buka dashboard Coolify $\rightarrow$ tambah **Resource Baru** $\rightarrow$ pilih repository **`borist-nababan-cloud/zen-workslogs`** (branch `main`).
2. Pada pengaturan **General**:
   - **Build Pack:** `Docker Compose`
   - **Base Directory:** `/watchdog-agent`
   - **Domain / Ports:** **Kosongkan** (jangan ekspos port apa pun).
3. Login sebagai **SUPERUSER (Role ID 8)** di `https://worklogs.zenfamilyspa.id/watchdogs` $\rightarrow$ klik **Kelola Token & Setup Agent** $\rightarrow$ buat token untuk `node_id` (misalnya `coolify-prod-vps`).
4. Salin Environment Variables dari modal setup ke Coolify:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `WATCHDOG_INGEST_TOKEN`
   - `POLL_INTERVAL_SECONDS=30`
   - *(Opsional nanti)* `N8N_ALERT_WEBHOOK_URL=https://n8n.../webhook/...`
5. Klik **Deploy**. Dalam ~30 detik, metrik live VPS DigitalOcean akan muncul di tab **VPS Watchdogs**.
