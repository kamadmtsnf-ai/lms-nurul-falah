# Hasil Pengerjaan Tahap 1

Tanggal: 17 Oktober 2026. Status: fondasi kode selesai dan lolos pengujian lokal; penerapan serta verifikasi layanan cloud belum selesai.

## Hasil yang tersedia

1. Next.js App Router dan TypeScript strict, Tailwind, komponen UI dasar pola shadcn/ui, ikon Lucide, Zod.
2. Halaman awal hijau zamrud/putih/emas, informasi akses, halaman privat terjaga, halaman 404 dan error, endpoint liveness.
3. Client Supabase server dan admin yang dipisah; refresh cookie melalui proxy; validasi konfigurasi publik yang menolak secret key.
4. Migrasi tabel identitas/sekolah/semester, katalog delapan peran, pemisahan admin pusat, tabel token/outbox privat, foreign key komposit, RLS, dan pemeriksaan sesi Auth.
5. Bucket privat dengan plafon global 5 MB dan kebijakan ukuran per jenis di kode; fitur unggahan belum diaktifkan.
6. Seed satu sekolah, skrip bootstrap admin dengan pembersihan kegagalan, pemeriksaan database/storage/SMTP, konfigurasi Vercel dan CI.
7. Panduan konfigurasi dan catatan keamanan; spesifikasi Tahap 0 disertakan sebagai acuan.

## Bukti pemeriksaan

| Pemeriksaan | Hasil | Batas bukti |
| --- | --- | --- |
| Build produksi Next.js | Lulus | Tanpa environment Supabase; membuktikan kode dapat dibangun, bukan cloud siap |
| TypeScript | Lulus | Seluruh source, scripts, tests diperiksa |
| Unit, PostgreSQL/RLS, email lokal | 21 test lulus, 0 gagal | Termasuk parent test database; PostgreSQL tertanam memakai stub Auth/Storage |
| HTTP produksi | 5 skenario lulus | Beranda/header, informasi akses, health tanpa cache, pengalihan halaman privat, 404 |
| Lockfile | Konsisten | Dependency runtime/development sesuai package.json |
| Koneksi cloud | Belum diuji | Script berhenti BLOCKED dengan exit 2 karena konfigurasi belum ada |
| Email eksternal | Belum diuji | Pengiriman hanya ke SMTP lokal, tidak ke alamat orang lain |
| Browser visual/perangkat | Belum diuji | Tidak ada klaim pemeriksaan screenshot atau perangkat nyata |
| Beban 132 siswa | Belum diuji | Dilaksanakan setelah kuis dan lingkungan nyata tersedia |

Masalah yang ditemukan dan diperbaiki: validasi URL kosong semula melempar error sehingga halaman privat memberi HTTP 500. Validator kini menolak input kosong/rusak tanpa exception; regression test ditambahkan dan pengalihan privat diuji lewat HTTP produksi.

Perintah `npm test` mengeksekusi migrasi SQL asli. Schema Auth/Storage dalam test merupakan stub minimal, bukan salinan seluruh Supabase. Hasil lokal tidak menggantikan uji integrasi hosted.

## Dependensi terbuka

- Hubungkan Vercel dan Supabase melalui integrasi akun yang tersedia; belum ada koneksi terkonfirmasi.
- Buat proyek Supabase khusus LMS, terapkan migrasi berurutan, verifikasi pengaturan Auth dan schema privat.
- Pilih penyedia SMTP berkuota gratis yang dapat mengirim ke pengguna nyata; siapkan pengirim yang memenuhi syarat penyedia.
- Periksa kelayakan Vercel Hobby untuk penggunaan sekolah dan kuota yang berlaku.
- Terapkan source ke repositori milik pengguna bila dikehendaki, lalu deploy di Vercel. Tidak ada push atau deploy yang dilakukan dalam pengerjaan ini.

Tahap 1 tidak dinyatakan selesai menyeluruh sampai koneksi database dan pengiriman email nyata terbukti serta deployment diverifikasi. Pekerjaan lokal yang dapat dilakukan tanpa akun sudah diselesaikan. Tahap berikutnya membangun prototipe autentikasi dan aktivasi; modul akademik tidak didahulukan sebelum alur tersebut lolos uji.

## Penggunaan paket

Ekstrak ZIP, buka README.md, jalankan `npm ci`. Paket tidak berisi dependency terpasang, hasil build, secret, data siswa atau repositori .git. Manifest SHA-256 disertakan untuk memeriksa integritas source. ZIP bukan aplikasi yang sudah dihosting.
