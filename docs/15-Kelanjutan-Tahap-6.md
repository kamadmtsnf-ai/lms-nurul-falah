# Kelanjutan Tahap 6 — 18 Oktober 2026

## Pekerjaan yang dilanjutkan

Tahap 6 awal membuktikan integritas jawaban dan otorisasi pada 60/100/132 sesi API, tetapi belum meluluskan latensi client, browser/perangkat, gangguan jaringan browser, serta pemulihan cadangan produksi dan Storage. Pengujian tampilan dengan API simulasi dari audit UI tidak dipakai untuk menutup gate ini.

Kelanjutan ini memakai sekolah sintetis `[UJI-TAHAP6]`, tujuh identitas sintetis tanpa akses madrasah asli, Supabase Auth hosted dengan sesi asli, halaman Vercel, dan PostgreSQL hosted. Data fixture disiapkan operator dengan lingkup ID yang eksplisit. Tidak ada JWT yang dibuat sendiri atau kebijakan akses yang dimatikan. Email verifikasi awal pada sebagian fixture merupakan penyiapan operator, bukan bukti pengiriman email. Password, cookie, token, dan konfigurasi fixture disimpan di luar repository dengan izin 0600 dan tidak disertakan dalam laporan.

## Temuan dan perbaikan aplikasi

1. Form tanpa `method` dapat melakukan GET native sebelum React siap. Pengujian login memperlihatkan username/password **sintetis** menjadi query URL. Semua form client sekarang menetapkan POST. Form akun menahan isian/tombol hingga handler terpasang. HTTP smoke test memeriksa POST dan kondisi disabled pada HTML server.
2. Kontrol yang terlihat aktif sebelum hidrasi dapat mengabaikan klik tab atau pilihan jawaban. `ClientReady` menahan kontrol akademik, pembelajaran, absensi, serta kuis sampai handler terpasang. Ini penting agar pilihan awal kuis tidak terlihat diterima sebelum antrean jawaban aktif.

Nama API, formula nilai, validasi server, persyaratan aktivasi, batas Auth, dan RLS tetap berlaku. Tidak ada perubahan schema produksi pada kelanjutan ini.

## Bukti browser

**Hasil: 11/11 skenario lulus, tanpa JavaScript error teridentifikasi.** Hasil aktual per skenario: `verification/stage6-browser-results.json`. Pengujian menggunakan Chromium desktop dan viewport ponsel, bukan perangkat fisik. Kasus meliputi pembuatan kuis guru melalui UI, penyimpanan/refresh siswa, offline sebelum ACK, respons hilang setelah commit server, konflik dua tab, finalisasi, buka/tutup nilai, tenggat offline, orang tua beberapa anak, ekspor XLSX/PDF, batas menu admin, serta password baru dan login ulang.

Kehilangan respons disimulasikan dengan membiarkan request benar-benar mencapai server lalu memutus respons browser. Ini berbeda dari mengganti respons API dengan data mock. Status pengujian perangkat fisik dan jaringan sekolah tetap terpisah.

## Diagnostik latensi

Laporan: `verification/stage6-latency-control-latest.json`. Sampel kontrol membandingkan endpoint health tanpa database dan daftar kuis terautentikasi, masing-masing lima request berurutan dan lima serentak. Ini bukan pengujian ulang kapasitas 132 sesi.

Pada run ini, request berurutan yang sudah hangat jauh lebih cepat daripada sebagian request serentak. Sebagian request daftar kuis memerlukan sekitar 8–10 detik dari client sementara `Server-Timing total` hanya sekitar 0,2–0,5 detik. Endpoint health juga mengalami penundaan client besar. Waktu di luar handler mencakup koneksi, proxy lingkungan uji, middleware, platform dan jaringan; bukti ini belum mengisolasi kontribusi masing-masing.

Jangan menyatakan masalah p95 132 siswa telah selesai berdasarkan sampel kontrol ini. Gate p95 client <2 detik tetap mengikuti hasil kapasitas historis yang gagal sampai pengujian terkontrol pada jalur akses sekolah membuktikan sebaliknya.

## Cadangan Storage yang sebelumnya belum mempunyai alat

- `npm run backup:storage`: inventaris dan unduhan seluruh `lms-private`, enkripsi AES-256-GCM per objek dan manifest, checksum, direktori/berkas privat. Tidak ada nama objek atau data pribadi dalam index yang tidak terenkripsi.
- `npm run restore:storage:test -- <index.json> <direktori-baru>`: pemulihan **lokal** ke direktori baru `lms_storage_restore_*`, pemeriksaan checksum, autentikasi enkripsi, ukuran dan hash. Menolak overwrite dan traversal path. Tidak menulis ke Storage produksi.
- Tes menguji byte roundtrip, permission, duplikasi/path berbahaya, kerusakan arsip dan pembersihan hasil parsial. Ini bukan bukti bahwa Storage produksi telah diekspor.
- `node scripts/stage6-preflight.mjs`: hanya melaporkan keberadaan alat dan konfigurasi; tidak mencetak kredensial.

### Prosedur operator

1. Gunakan komputer operator tepercaya dengan pg_dump/pg_restore yang kompatibel dengan PostgreSQL 17.11. Atur PGHOST, PGPORT, PGDATABASE, PGUSER dan autentikasi secara lokal. Jangan kirim password atau server key melalui chat.
2. Tentukan `LMS_BACKUP_DIR` di luar repository dan kunci acak 32 byte dalam `LMS_BACKUP_KEY_BASE64`. Simpan kunci terpisah dari cadangan. Pada Windows, pastikan ACL direktori membatasi akses ke operator.
3. Jalankan `npm run backup:db`. Dump database dan ACL terenkripsi ini tidak memuat biner Storage.
4. Untuk Storage, atur `SUPABASE_URL`, kredensial server dalam `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY`, serta `LMS_STORAGE_BACKUP_ACK=authorized-private-storage-export` pada lingkungan lokal. Jalankan `npm run backup:storage`. Hentikan perubahan lampiran selama inventaris bila membutuhkan snapshot yang konsisten; database dan Storage bukan snapshot atomik bersama.
5. Jalankan restore database pada target lokal terisolasi sesuai panduan Tahap 6, serta `npm run restore:storage:test -- <folder-cadangan/index.json> <folder-baru/lms_storage_restore_drill>` dengan `LMS_STORAGE_RESTORE_ACK=isolated-local-storage-test` dan kunci yang benar.
6. Cocokkan inventaris database dan objek. Restore lokal Storage membuktikan byte hasil dekripsi; uji lanjutan pada proyek uji terisolasi harus memulihkan bucket privat, metadata, serta izin aplikasi sebelum gate produksi diterima. Jangan menggunakan target produksi sebagai drill.
7. Catat RTO/RPO, waktu cadangan terakhir, jumlah/hash tanpa menyalin isi data pribadi ke laporan publik.

Preflight lingkungan agen menunjukkan pg_dump dan kredensial operator tidak tersedia. Karena itu ekspor serta pemulihan **data produksi** tetap belum dijalankan; tidak ada rahasia operator yang diambil dari Vercel atau dikirim ke chat.

## Mengulang pemeriksaan yang tersedia

```sh
npm run typecheck
npm test
npm run build
npm run test:http
npm run test:ui
npm run verify:stage6
```

Harness hosted tambahan:

```sh
npm run test:browser:hosted
npm run diagnose:hosted
```

Keduanya memerlukan `LMS_BROWSER_FIXTURE` yang menunjuk konfigurasi privat sintetis di luar repository. Harness menolak konfigurasi tidak bertanda atau berizin terlalu terbuka. Cookie diagnostik hanya untuk akun sintetis; jangan menggantinya dengan akun nyata.

## Keputusan

Lihat `verification/stage6-readiness.json` dan laporan browser terbaru. Kelulusan browser otomatis tidak menghapus kebutuhan perangkat/jaringan fisik, kapasitas client, atau drill pemulihan produksi. Fixture telah dibersihkan: sekolah, tujuh akun, profil, sesi dan refresh token sintetis tersisa nol. Sekolah asli tetap tersedia. Bukti: `verification/stage6-cleanup-latest.json`. Pemeriksaan lokal terbaru juga lulus pada 60/100/132 klien virtual dan pemulihan fixture; hasil tersebut bukan pengukuran kapasitas hosted.

## Pemeriksaan advisor keamanan

Advisor menunjukkan RLS tanpa policy pada tabel RPC-only. Akses langsung memang ditolak dan fungsi tetap memeriksa akun/peran/keanggotaan; tidak dibuat policy terbuka hanya untuk menghilangkan notifikasi. [Penjelasan linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Ada peringatan bahwa leaked-password protection belum aktif pada konfigurasi Auth saat ini. Pengaturan proyek tidak diubah diam-diam; persyaratan password aplikasi tetap berlaku. [Panduan keamanan password Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
