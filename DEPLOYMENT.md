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

## Pengujian Lokal dengan Docker

```powershell
cd d:\BEN\Zen\WORK_SPACE\frontend\worklogs
docker build --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=your-key -t zen-worklogs .
docker run --rm -p 3000:3000 zen-worklogs
```
Akses aplikasi melalui `http://localhost:3000`.
