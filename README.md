# LMS Nurul Falah — Fondasi Tahap 1

Aplikasi Next.js yang disiapkan untuk Vercel dengan Supabase PostgreSQL/Auth/Storage. Paket ini adalah fondasi teknis; login dan modul pembelajaran belum diimplementasikan. Halaman awal tidak menggunakan data siswa contoh yang seolah nyata.

## Status terbaru

Supabase hosted telah dibuat, ketiga migrasi dan profil sekolah telah diterapkan serta diverifikasi. Pembuatan proyek Vercel ditolak 403; deployment dan email nyata belum tersedia. Lihat `docs/04-Status-Cloud.md` sebagai status terbaru. Pernyataan lokal pada laporan awal merujuk paket sebelum koneksi cloud.

## Cakupan fondasi

- Selesai lokal: proyek dan dependency terkunci, tampilan awal responsif, komponen UI dasar, konfigurasi Vercel, client Supabase server, penjagaan akun, dua migrasi, RLS, bucket privat, seed sekolah, skrip bootstrap admin dan pemeriksaan layanan, pengujian.
- Belum diterapkan: email nyata, repositori GitHub dan deployment Vercel. Supabase serta migrasinya sudah diterapkan.
- Belum termasuk: login, alur aktivasi lengkap, API pengelolaan akun, materi/tugas/kuis/absensi, impor/ekspor dan PWA. Fitur tersebut mengikuti tahap berikutnya.
- Tahap 1 belum lulus seluruh kriteria layanan nyata sampai Supabase dan SMTP diperiksa serta deployment diverifikasi.

## Menjalankan lokal

Gunakan Node.js 24 dan npm. Ekstrak ZIP, lalu masuk ke folder `lms-nurul-falah` yang berisi package.json.

```sh
npm ci
npm run dev
```

Buka http://localhost:3000. Tanpa konfigurasi layanan, halaman awal tetap dapat dibuka, sedangkan ruang belajar tertutup. Tidak ada mode demo yang melewati autentikasi.

Untuk konfigurasi, salin `.env.example` menjadi `.env.local`. Di PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Isi nilainya di editor lokal atau pengaturan Vercel; jangan mengirim secret melalui percakapan atau memasukkannya dalam repositori.

## Pemeriksaan

```sh
npm run typecheck
npm test
npm run build
npm run test:http
npm run check:services
```

`test:http` membutuhkan build terlebih dahulu dan menggunakan port lokal 3217. `check:services` memerlukan konfigurasi nyata; ia memeriksa database, bucket, penolakan akses anonim dan koneksi SMTP. Skrip tidak mengirim email ke penerima nyata dan tidak membuktikan email masuk inbox.

## Urutan konfigurasi cloud

Baca `docs/01-Panduan-Konfigurasi.md`, lalu `docs/02-Keamanan-dan-Database.md`. Jangan menjalankan bootstrap sebelum kedua migrasi dan seed sekolah diterapkan. Bootstrap membuat admin dengan password awal yang disepakati dan tetap mewajibkan aktivasi; login baru tersedia pada Tahap 2.

Paket tidak berisi credential, node_modules, .next, konfigurasi akun Vercel, atau repo .git. Tidak ada push ke GitHub yang dilakukan.

## Struktur

- `src/app`: halaman awal, informasi akses, ruang belajar terlindungi, liveness.
- `src/lib`: konfigurasi, Supabase, penjagaan aktivasi, kebijakan unggahan, transport email.
- `src/components/ui`: fondasi komponen kompatibel pola shadcn/ui.
- `supabase/migrations`: schema, RLS, dan bucket privat.
- `scripts`: pemeriksaan layanan, bootstrap lokal, smoke test HTTP.
- `tests`: PostgreSQL tertanam, batas akses/unggahan dan email lokal.
- `docs`: panduan, keputusan keamanan, status pengujian dan spesifikasi Tahap 0.

Sebelum melanjutkan modul akademik, buktikan prototipe autentikasi username, email wali bersama, pergantian password, logout paksa, login ulang, dan verifikasi email pada Tahap 2.
