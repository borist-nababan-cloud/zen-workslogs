# Panduan Deployment — zen-workslogs (Pure SPA + Supabase Production)

Aplikasi **Zen Work Logs & Release Hub** berjalan murni sebagai aplikasi **React + Vite SPA** yang dilayani oleh **Nginx Alpine** dan terhubung langsung ke **Supabase Production** tanpa server Express maupun database SQLite lokal.

## Arsitektur Container

- **Stage 1 (`node:22-alpine`)**: Mengompilasi bundle produksi di `client/dist`.
- **Stage 2 (`nginx:alpine`)**: Menyajikan static bundle SPA di port **`3000`** dan **`80`**, lengkap dengan endpoint healthcheck `/healthz` (dan alias `/api/health`) serta aturan *anti-stale cache* untuk `index.html`.
- **Tidak Membutuhkan Persistent Volume**: Seluruh catatan (`public.work_logs`), metadata rilis (`public.work_log_releases`), dan file biner (`storage.zen-releases`) tersimpan permanen di Supabase Production.

## Langkah Deployment di Coolify

1. Pastikan repositori `https://github.com/borist-nababan-cloud/zen-workslogs.git` (`main`) telah diperbarui.
2. Pada dashboard Coolify untuk `worklogs.zenfamilyspa.id`:
   - **Build Pack**: `Dockerfile` (atau `Docker Compose` dengan `docker-compose.yml`).
   - **Port**: `3000` (juga kompatibel dengan port `80`).
   - **Build-Time Environment Variables / Build Arguments (WAJIB — Build akan gagal jika kosong):**
     - `VITE_SUPABASE_URL` = URL proyek Supabase Production
     - `VITE_SUPABASE_ANON_KEY` = Publishable / Anon Key Supabase Production
     *(Pastikan kedua variabel dicentang **"Available at Buildtime"** di Coolify karena Dockerfile tidak menyimpan kredensial hardcoded).*
3. **Konfigurasi Supabase Auth (untuk Login Google OAuth SUPERUSER Role 8)**:
   - Di Supabase Studio Production $\rightarrow$ **Authentication** $\rightarrow$ **URL Configuration** $\rightarrow$ **Redirect URLs**, tambahkan:
     - `https://worklogs.zenfamilyspa.id/**`
4. Klik **Deploy** dan verifikasi:
   - `https://worklogs.zenfamilyspa.id/healthz` mengembalikan `200 OK`.
   - Daftar catatan kerja termuat otomatis dari `public.work_logs`.
   - Tombol unduhan rilis di `/` dan `/files` mengunduh langsung dari CDN Supabase.
   - Aksi tulis (Toggle `Trained`, Tambah/Edit/Hapus Catatan, Upload/Hapus Rilis) hanya aktif setelah login menggunakan akun **SUPERUSER (Role ID 8)**.

## Deployment Zen Watchdog Agent di Coolify

Layanan pemantau VPS (**Zen Watchdogs**) berada pada direktori `/watchdog-agent` di repositori yang sama (`borist-nababan-cloud/zen-workslogs`) dan **tidak membuka port maupun domain publik**.

1. Di Coolify, tambahkan **New Resource** $\rightarrow$ **Private/Public Git Repository** $\rightarrow$ `borist-nababan-cloud/zen-workslogs` (branch `main`).
2. Atur konfigurasi build:
   - **Build Pack**: `Docker Compose`
   - **Base Directory**: `/watchdog-agent`
   - **Domains / Exposed Ports**: **Kosongkan** (agent hanya mengirim *outbound HTTPS* ke Supabase).
3. Login ke `https://worklogs.zenfamilyspa.id/watchdogs` sebagai **SUPERUSER (Role ID 8)** $\rightarrow$ buka **Kelola Token & Setup Agent** $\rightarrow$ buat token untuk node (misal `coolify-prod-vps`).
4. Salin Environment Variables dari modal setup ke Coolify:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `WATCHDOG_INGEST_TOKEN`
   - `POLL_INTERVAL_SECONDS=30`
   - *(Opsional nanti)* `N8N_ALERT_WEBHOOK_URL` untuk meneruskan notifikasi `CRITICAL`/`WARNING` ke n8n (Telegram / WhatsApp).
5. Klik **Deploy**. Setelah ~30 detik, metrik live VPS, status container Docker, proses teratas, dan peringatan keamanan otomatis tampil eksklusif di tab **VPS Watchdogs** bagi **Role ID 8**.

## Pengujian Lokal dengan Docker

```powershell
cd d:\BEN\Zen\WORK_SPACE\frontend\worklogs
docker build --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=your-key -t zen-worklogs .
docker run --rm -p 3000:3000 zen-worklogs
```
Akses aplikasi melalui `http://localhost:3000`.
