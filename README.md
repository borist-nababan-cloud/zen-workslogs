# zen-workslogs (Zen Work Logs & Release Hub)

Portal pelacakan catatan pembaruan sistem (**Work Logs**) dan pusat distribusi rilis aplikasi (**Release Hub**) untuk ekosistem **Zen Family Spa & Reflexology**, terhubung langsung ke **Supabase Production**.

## Fitur Utama

- **Otomatisasi Catatan Kerja (`public.work_logs`):** Catatan perubahan sistem langsung dipublikasikan ke Supabase Production melalui skrip otomatis `"update catatan"` (tanpa unggah manual file `HAVE_DONE.md`).
- **Pelacakan Status `Tested` & `Trained`:** Memantau kelayakan rilis (`tested = true`) dan progres pelatihan ke cabang/staf (`trained` true/false).
- **Release Hub 5 Aplikasi (`public.work_log_releases` + Bucket `zen-releases`):**
  1. **Zen Desktop System** (`.exe` / `.zip`)
  2. **Zen Sync App** (`.exe` / `.zip`)
  3. **Internal Android App** (`.apk`)
  4. **Customer Test Android App** (`.apk`)
  5. **Zen Dashboard Android TV** (`.apk`)
- **TUS Resumable Upload:** Mendukung unggahan berkas biner berukuran besar (> 6 MB hingga 500 MB) langsung dari browser ke Supabase Storage dengan indikator progres real-time.
- **Keamanan RBAC Ketat (Strict Role ID 8 ONLY):**
  - Pembacaan catatan dan pengunduhan biner dari CDN terbuka untuk publik (`anon`).
  - Seluruh aksi tulis (Toggle `Trained`, Tambah/Edit/Hapus Catatan, Unggah/Hapus Rilis, dan write RLS Storage) dikunci ketat di level UI dan PostgreSQL RLS hanya untuk **SUPERUSER (`user_role = 8`)**.

## Stack Teknologi

- **Frontend:** React 18, Vite 5, Tailwind CSS (Palet Zen Brand), `react-markdown` + `remark-gfm`, Lucide Icons
- **Cloud Backend & Storage:** `@supabase/supabase-js`, `tus-js-client` (TUS Resumable Upload), Supabase PostgreSQL & Storage CDN
- **Container Runtime:** Multi-stage `node:22-alpine` $\rightarrow$ `nginx:alpine` (listening di port `3000` & `80`, healthcheck `/healthz`)

## Pengembangan Lokal

```powershell
cd d:\BEN\Zen\WORK_SPACE\frontend\worklogs
npm run install:client
npm run dev
```

Aplikasi dev berjalan di `http://localhost:5173`. Untuk build produksi:

```powershell
npm run build
```
