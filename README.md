# LMS Nurul Falah

Tahap 3 melengkapi akun/aktivasi dengan master akademik, penugasan, anggota kelas dan impor Excel. Frontend/backend di Vercel; Supabase menangani PostgreSQL, Auth dan Storage.

## Status terbaru

- Source: https://github.com/kamadmtsnf-ai/lms-nurul-falah
- Aplikasi: https://lms-nurul-falah.vercel.app
- Enam migrasi diterapkan pada Supabase `slppnagegknxsjhfqthm`.
- Form login, wajib ganti password lalu login ulang, email per akun, pemulihan berbasis token sekali pakai, multi-peran dan manajemen akun tersedia.
- Aktivasi telah dikonfirmasi berhasil oleh pengguna. Email menggunakan konfigurasi SMTP; tidak ada bypass aktivasi.
- Master akademik dan tujuh template/impor Excel tersedia. Materi/tugas/kuis/absensi mengikuti Tahap 4.

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

## Tahap 3 — Akademik

Pusat akademik tersedia pada `/admin/akademik`; kelas sesuai hak akses pada `/akademik`. Panduan konfigurasi, tujuh template Excel dan batas impor: [docs/06-Tahap-3-Akademik.md](docs/06-Tahap-3-Akademik.md).
