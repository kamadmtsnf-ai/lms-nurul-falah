# LMS Nurul Falah

Tahap 2 menambahkan akun, login username/password, aktivasi dan administrasi pengguna. Frontend/backend di Vercel; Supabase menangani PostgreSQL, Auth dan Storage.

## Status terbaru

- Source: https://github.com/kamadmtsnf-ai/lms-nurul-falah
- Aplikasi: https://lms-nurul-falah.vercel.app
- Empat migrasi diterapkan pada Supabase `slppnagegknxsjhfqthm`.
- Form login, wajib ganti password lalu login ulang, email per akun, pemulihan berbasis token sekali pakai, multi-peran dan manajemen akun tersedia.
- Pengiriman email nyata memerlukan konfigurasi SMTP. Tanpa SMTP, pengguna tetap tertahan pada verifikasi; tidak ada bypass aktivasi.
- Impor/template Excel mengikuti Tahap 3 bersama master akademik; materi/tugas/kuis/absensi mengikuti tahap pembelajaran.

## Menjalankan dan memeriksa

Gunakan Node.js 24. Salin `.env.example` menjadi `.env.local`, isi konfigurasi langsung di lingkungan lokal/Vercel, lalu:

```sh
npm ci
npm run dev
```

Pemeriksaan:

```sh
npm test
npm run typecheck
npm run build
npm run test:http
npm run check:services
```

`test:http` membutuhkan build. Skrip tidak mengirim email ke penerima nyata. `check:services` memerlukan konfigurasi nyata dan memeriksa SMTP tanpa mengirim pesan.

## Admin pertama

Penyiapan memakai skrip `npm run bootstrap:admin` dengan environment lokal atau halaman `/pengaturan-awal` dengan LMS_SETUP_TOKEN yang ditetapkan pengelola secara aman. Bootstrap web hanya dapat selesai sekali dan menutup setelah admin tersedia. Password awal mengikuti ketentuan madrasah; wajib diganti sebelum verifikasi email.

Jangan menjalankan seed development pada proyek hosted: profil sekolah sudah ada. Gunakan UUID sekolah `dffb68f0-7a81-4047-bcf9-1870f1849112` untuk BOOTSTRAP_SCHOOL_ID. Tidak ada password baru, secret key, token verifikasi atau kode setup yang disimpan dalam source.

## Dokumentasi

- `docs/00-Spesifikasi-Tahap-0.md`: kebutuhan lengkap.
- `docs/01-Panduan-Konfigurasi.md`: konfigurasi awal.
- `docs/05-Tahap-2-Identitas.md`: alur akun, keamanan, penggunaan dan batas verifikasi terbaru.

Laporan Tahap 1 dan status cloud sebelumnya disimpan sebagai riwayat; status pada dokumen Tahap 2 menjadi rujukan terbaru.
