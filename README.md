# LMS Nurul Falah

LMS sampai Tahap 6 mencakup materi, absensi, tugas, kuis dan laporan Excel/PDF, disertai pengujian serta perbaikan sinkronisasi. Gerbang kelayakan yang belum lulus dicatat pada dokumentasi Tahap 6. Frontend/backend di Vercel; Supabase menangani PostgreSQL, Auth dan Storage.

## Status terbaru

- Source: https://github.com/kamadmtsnf-ai/lms-nurul-falah
- Aplikasi: https://lms-nurul-falah.vercel.app
- Sebelas migrasi diterapkan pada Supabase `slppnagegknxsjhfqthm`.
- Form login, wajib ganti password lalu login ulang, email per akun, pemulihan berbasis token sekali pakai, multi-peran dan manajemen akun tersedia.
- Aktivasi telah dikonfirmasi berhasil oleh pengguna. Email menggunakan konfigurasi SMTP; tidak ada bypass aktivasi.
- Master akademik, tujuh template/impor Excel serta materi, tugas dan dua sumber absensi tersedia. Kuis/laporan V1 mengikuti Tahap 5.

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

## Tahap 4 — Pembelajaran

Buka `/akademik` lalu pilih mata pelajaran. Absensi piket/rekap ada di `/absensi-harian`. Alur guru, siswa, lampiran privat dan batas verifikasi: [docs/07-Tahap-4-Pembelajaran.md](docs/07-Tahap-4-Pembelajaran.md).

## Tahap 5 — Kuis dan laporan

Tab **Kuis** dan **Laporan** ada di setiap ruang pembelajaran. V1 mencakup pilihan ganda/benar-salah, satu percobaan dengan autosave, batas waktu server, koreksi otomatis, rilis nilai/pembahasan oleh guru, serta laporan Excel/PDF. Panduan dan batas verifikasi: [docs/08-Tahap-5-Kuis-Laporan.md](docs/08-Tahap-5-Kuis-Laporan.md).

## Tahap 6 — Kelayakan uji coba

Perbaikan sinkronisasi kuis, pengujian antrean/sesi, laporan beban dan drill cadangan tersedia. Hasil lokal dipisahkan dari produksi dan browser. Panduan operator serta gerbang penerimaan yang masih terbuka: [docs/09-Tahap-6-Kelayakan-Uji-Coba.md](docs/09-Tahap-6-Kelayakan-Uji-Coba.md).

## Tahap 7 — Persiapan peluncuran terbatas

Panduan migrasi data, aktivasi bertahap dan pendampingan: [docs/10-Tahap-7-Peluncuran-Terbatas.md](docs/10-Tahap-7-Peluncuran-Terbatas.md). Jalankan `node scripts/check-rollout.mjs` untuk laporan kesiapan (kode 2 menandakan peluncuran belum dimulai). Kendala Tahap 6 dan data nyata yang belum tersedia dicatat terbuka.
