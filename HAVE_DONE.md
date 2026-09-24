# Catatan Pembaruan Sistem (Update Log)

Dokumen ini berisi daftar pembaruan, perbaikan, dan fitur baru yang telah diimplementasikan ke dalam aplikasi.

## Rabu, 8 Juli 2026 (Sesi 3)
**Ringkasan:** Menyelesaikan inisialisasi repositori Git dan deployment aplikasi Karunia Logs App ke GitHub dengan dokumentasi lengkap serta konfigurasi Docker untuk Coolify.

### 📦 Modul yang Dibuat / Diperbarui
*   **Nama Modul:** `README.md` & `.gitignore`
    *   **Aksi:** Dibuat Baru
    *   **Detail Perubahan:** Membuat dokumentasi lengkap proyek Karunia Logs App meliputi fitur, teknologi, instalasi, API endpoints, deployment guide, dan troubleshooting. Mengupdate `.gitignore` untuk melindungi file sensitif seperti env files, SQL files, dan direktori credentials (`docs/`, `my-cred/`, `database-docs/`).
*   **Nama Modul:** `docker-compose.yaml` & `Dockerfile`
    *   **Aksi:** Dibuat Baru & Diperbarui
    *   **Detail Perubahan:** Menambahkan `docker-compose.yaml` untuk kompatibilitas dengan Coolify yang mencari ekstensi `.yaml`. Memperbaiki `Dockerfile` untuk mengatasi masalah build di Coolify dengan mengubah `npm install` menjadi `npm install --include=dev` dan `npm run build` menjadi `NODE_ENV=development npm run build` agar devDependencies (seperti Vite) terinstall saat build.
*   **Nama Modul:** `docs/PROJECT_SUMMARY.md`
    *   **Aksi:** Dibuat Baru
    *   **Detail Perubahan:** Membuat dokumentasi lengkap analisis aplikasi, arsitektur teknis, struktur database, API endpoints, rangkuman percakapan, dan kesimpulan penting untuk project Karunia Logs App.
*   **Nama Modul:** GitHub Repository
    *   **Aksi:** Dibuat Baru
    *   **Detail Perubahan:** Menginisialisasi repositori Git lokal dan remote di GitHub (`https://github.com/borist-nababan-cloud/karunialogsapp.git`). Mengunggah seluruh source code aplikasi (React frontend, Express backend, konfigurasi Docker) dengan perlindungan file sensitif melalui .gitignore.

---

## Rabu, 8 Juli 2026 (Sesi 2)
**Ringkasan:** Memperbaiki *bug* nomor kuitansi ganda pada modul cetak serta menginisialisasi repositori Git yang diunggah ke GitHub dengan perlindungan *file* sensitif dan biner.

### 📦 Modul yang Dibuat / Diperbarui
*   **Nama Modul:** `FQQDPLeasing.pas` & `FQQKPelunasan.pas`
    *   **Aksi:** Diperbarui
    *   **Detail Perubahan:** Memperbaiki permasalahan duplikasi nomor kuitansi manual (`nokuitansi`) yang disebabkan oleh pengurutan data bertipe *string* secara leksikografis (abjad). Query `ORDER BY` diganti menjadi `SELECT MAX(CAST(nokuitansi AS UNSIGNED))` agar nilai maksimum diambil secara matematis. Kode asli disembunyikan menggunakan komentar `//` demi mempermudah pemulihan (*rollback*) jika diperlukan.
*   **Nama Modul:** `.gitignore` & Konfigurasi Git
    *   **Aksi:** Dibuat Baru
    *   **Detail Perubahan:** Mengatur repositori Git lokal dan mengunggah kode ke GitHub (`karuniadesktopshowroom`). Membuat aturan `.gitignore` yang secara ketat memblokir data sensitif (`*.env`, `*.json`, `*.sql`), direktori dokumentasi, dan secara khusus mengabaikan *file* biner kompilasi besar bawaan Delphi (`*.exe`, `*.rsm`, `*.dcu`, folder `Win32/` dan `Win64/`) yang sebelumnya gagal diunggah akibat batas ukuran GitHub 100MB.

---

## Rabu, 8 Juli 2026
**Ringkasan:** Memperbarui logika perhitungan, memperbaiki bug *runtime* konversi tipe data, dan menyimpan *field* struktur tabel baru ke dalam sistem kalkulasi penjualan (Hitung Penjualan).

### 📦 Modul yang Dibuat / Diperbarui
*   **Nama Modul:** `FNewHitungPenjualan.pas` (Form Hitung Penjualan Baru)
    *   **Aksi:** Diperbarui
    *   **Detail Perubahan:** 
        - Mengintegrasikan penyimpanan *field* baru `subsidi_silang` dan JSON utuh (`semua_kolom`) ke tabel `mstr_perhitungan`.
        - Memperbaiki bug *Access Violation* saat melakukan *Save* (menyimpan) akibat referensi objek `tslPerhitungan` yang dihancurkan lebih awal.
        - Memperbaiki *error* tipe data `UnicodeString to Double` saat melakukan *Quick Search* SPK lama dengan menerapkan pengecekan ketersediaan variabel secara aman (*safe key existence check*).
        - Merombak ulang seluruh rumus matematika perhitungan yang melibatkan `Selisih PO` (termasuk *bug* pengurangan ganda) agar secara absolut selalu bertindak sebagai pengurang (-), tanpa mengubah tampilan input teks *user*.

---

## Tanggal Update: 7 Juli 2026

### 1. Modul Laporan Pengiriman (`FViewPengiriman`)
- **Peningkatan Performa & Akurasi Data:** Proses pencarian data pengiriman sekarang menggunakan tabel `checklist` secara langsung (berdasarkan tanggal pengiriman) sehingga data yang ditarik jauh lebih cepat dan akurat.
- **Informasi Lengkap di Layar (Grid):** Sistem sekarang secara otomatis membedah data pelanggan (dari format JSON) dan langsung menampilkannya ke layar Anda. Kolom-kolom baru yang kini terisi otomatis meliputi:
  - Nomor SPK (`No SPK`)
  - Tanggal Kirim
  - Data Kendaraan (Tahun, Warna, No Mesin, No Rangka, Type Kendaraan)
  - Data Kuitansi/Pembeli (Nama, Alamat, Kota, HP/Telepon)
  - Data BPKB (Nama BPKB, Alamat BPKB, Kota BPKB)
  - Nama Sales

### 2. Modul Transaksi Refund Leasing (`FNewRefundLeasing`)
- **Kemudahan Pelacakan Mutasi Bank (Traceability):** Untuk mempermudah tugas tim Keuangan (Finance & Accounting), sistem kini secara otomatis menyematkan Nomor SPK fisik ke dalam deskripsi/keterangan buku bank (tabel `bank_detail`).
- **Detail:** Keterangan mutasi masuk untuk Refund Leasing sekarang akan selalu diakhiri dengan teks `"No SPK : [Nomor SPK]"`. Ini menghilangkan kebutuhan untuk mencari ID internal saat melakukan rekonsiliasi bank.

### 3. Modul Checklist - Pelimpahan (`FNewChecklist`)
- **Penyesuaian Ledger Bank untuk Pelimpahan:** Konsisten dengan modul Refund, transaksi bank yang tercipta secara otomatis saat proses "Pelimpahan" dilakukan melalui Checklist kini juga mencantumkan Nomor SPK.
- **Detail:** Keterangan pada mutasi buku bank (`bank_detail`) khusus untuk aksi Pelimpahan sekarang otomatis menyertakan `"No. SPK : [Nomor SPK]"`.

---
*Catatan: Semua pembaruan di atas telah diuji dan dirancang untuk mempercepat pekerjaan operasional serta memudahkan proses audit data pencatatan bank.*
