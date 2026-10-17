# Tahap 6 — Kelayakan uji coba

## Cakupan dan keputusan

Tahap ini memisahkan empat bukti: tes otomatis, simulasi PostgreSQL lokal, beban API hosted dengan sesi Auth asli, dan uji manusia di browser/perangkat. Angka 132 pada simulasi lokal bukan bukti 132 koneksi PostgreSQL produksi. Hasil aktual disimpan pada `docs/verification/`.

Keputusan kelayakan dicatat pada [hasil hosted](verification/10-Hasil-Uji-Hosted-Tahap-6.md) dan `verification/stage6-readiness.json`. Gate yang belum lulus tidak boleh ditafsirkan sebagai persetujuan penggunaan massal. Pengujian browser tidak dapat dijalankan karena layanan browser mengalami timeout dan kemudian tidak tersedia. Cadangan produksi lengkap serta pemulihan berkas Storage belum diklaim berhasil hanya karena pemulihan fixture lokal berhasil.

## Perbaikan sinkronisasi

- Antrean menyimpan paket yang belum pasti diterima server dengan ID, revisi dan isi yang sama untuk retry. Pilihan baru yang masuk selama request berjalan tetap menjadi antrean berikutnya.
- Poll yang datang terlambat diabaikan ketika ada perubahan lokal/request berjalan, atau revisi lokal telah bergerak. Ini mencegah konflik semu akibat urutan respons jaringan.
- Setelah status selesai/kedaluwarsa, pilihan yang ditampilkan diambil ulang dari jawaban server. Pilihan lokal yang tidak pernah diterima tidak ditampilkan seolah-olah ikut dinilai.
- Tidak ada perubahan persyaratan password, verifikasi email, hak akses atau batas kuis untuk akun madrasah.

Tes regresi mencakup respons simpan hilang, retry paket identik, perubahan selama autosave, penggabungan jawaban saat offline, poll basi dan pilihan lokal setelah deadline.

## Cara mengulang pemeriksaan lokal

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:http
npm run verify:stage6
```

`verify:stage6` membuat 132 siswa sintetis di PGlite dalam memori, memuat seluruh migrasi, kemudian mengantrekan klien virtual 60 → 100 → 132. Setiap gelombang mengerjakan 30 soal, lima batch autosave, retry ID yang sama, finalisasi dan finalisasi berulang. JWT fixture disetel **hanya di dalam transaksi uji lokal**; tidak digunakan sebagai token untuk hosted.

PGlite menggunakan satu koneksi dan menserialkan transaksi. p50/p95 pada laporan lokal mencakup waktu antrean, tetapi tidak mencakup jaringan, Vercel, Supabase Auth hosted atau pool koneksi PostgreSQL. Jangan memasarkan hasil ini sebagai kapasitas produksi.

Drill cadangan lokal mengenkripsi direktori data sintetis dengan AES-256-GCM, mendekripsi dan memuatnya ke instance baru. Hash seluruh percobaan/jawaban/snapshot dibandingkan, akses tabel langsung tetap ditolak, dan laporan siswa terautentikasi tetap dibatasi pada diri sendiri.

## Pengujian hosted

Harness `scripts/testing/load-hosted.mjs` membutuhkan konfigurasi fixture privat di luar repository dengan permission `0600`, publishable key, sekolah sintetis bernama `[UJI-TAHAP6]`, 132 akun siswa dan satu pengampu yang tidak memiliki akses madrasah nyata. Pengaturan verifikasi fixture tersebut hanya berlaku pada identitas sintetis tanpa data pribadi. Akun nyata tidak diaktifkan ulang, diubah passwordnya, atau dipakai sebagai siswa uji.

Sesi diperoleh melalui Supabase Auth dengan password acak fixture. Cookie sesi tidak ditulis ke laporan atau Git. Pengujian memanggil `/api/kuis/*` pada Vercel dengan cookie terautentikasi dan Origin yang benar; ini bukan pemanggilan SQL sebagai superuser. Persiapan sesi dilakukan bertahap setelah lonjakan awal menghasilkan HTTP 429. Batas Auth tidak dinaikkan atau dimatikan.

Untuk setiap gelombang: 30 soal; mulai serentak; lima batch simpan; request ulang identik; submit serentak; submit ulang; verifikasi semua jawaban, identitas pemilik, kunci tersembunyi, skor guru dan timestamp finalisasi tetap sama. Harness berhenti bila ada error atau sasaran p95 autosave tidak terpenuhi. Untuk melanjutkan pemeriksaan keutuhan saja, opsi eksplisit `LMS_LOAD_RECORD_SLOW_CLIENT=record-with-failed-latency-gate` tetap mencatat gate latensi sebagai gagal; opsi ini tidak mengubah hasil gagal menjadi lulus. Pengunci eksklusif mencegah dua proses menggunakan fixture yang sama. Konsumsi payload aplikasi hanya estimasi dan bukan angka tagihan/egress total.

Sasaran: error server <1%, p95 autosave <2 detik dalam lingkungan yang dicatat, semua jawaban yang diakui server tetap ada, dan nol finalisasi ganda. Pengujian ini bukan SLA atau jaminan koneksi/perangkat setiap siswa.

Sampel diagnostik yang sempat bertumpuk tidak digunakan untuk keputusan kapasitas; rangkaian yang dipakai diulang dengan satu pengunci proses. Setelah fungsi dipindah ke sin1, waktu route diukur melalui Server-Timing. Waktu client dan route tidak boleh disamakan atau disimpulkan seluruh selisihnya berasal dari jaringan tanpa pengukuran tambahan.

Referensi batas Auth: https://supabase.com/docs/guides/auth/rate-limits . Token endpoint memakai batas berkelanjutan dan kapasitas lonjakan. Untuk kegiatan sekolah, minta siswa login sebelum jadwal kuis; jangan mengasumsikan 132 login baru serentak dari satu alamat jaringan telah lolos. Aplikasi juga membatasi login per jaringan dan per username.

## Cadangan produksi pada paket gratis

Supabase menyarankan proyek Free melakukan ekspor mandiri berkala. Backup database tidak mencakup isi biner Storage; metadata saja tidak cukup untuk memulihkan lampiran. Sumber: https://supabase.com/docs/guides/platform/backups .

Sediakan komputer operator dengan `pg_dump`/`pg_restore` yang kompatibel dengan versi server. Gunakan koneksi langsung atau session pooler sesuai dokumentasi resmi; jangan menggunakan transaction pooler untuk dump. Masukkan kredensial langsung pada lingkungan komputer operator, bukan melalui chat, Git, screenshot atau formulir LMS.

Skrip `npm run backup:db` memakai PGHOST, PGPORT, PGDATABASE, PGUSER dan PGPASSWORD dari lingkungan. Tentukan LMS_BACKUP_DIR di luar repository dan LMS_BACKUP_KEY_BASE64 berupa kunci acak 32 byte dalam base64. Buat kunci dengan pengelola rahasia atau alat kriptografi komputer operator; simpan kunci terpisah dari cadangan. Kehilangan kunci membuat arsip tidak dapat dipulihkan.

Skrip menghasilkan arsip AES-256-GCM dan manifest checksum SHA-256. Direktori/berkas dibatasi 0700/0600; dump sementara dihapus ketika proses selesai normal. Jika proses dihentikan paksa, operator perlu memeriksa folder sementara privat sebelum menghapus sisa berkas. Jangan menyimpan arsip nyata atau kunci di repository ini. ACL ikut dipertahankan; definisi role tingkat cluster tidak disertakan oleh `pg_dump`. Simpan inventaris role/extension secara terpisah. Cadangan penuh memuat data sensitif termasuk Auth dan harus diperlakukan sebagai data rahasia.

Skrip masih memerlukan akses database operator dan belum dijalankan untuk mengekspor data produksi dalam tahap ini. Pengujian kriptografi/fixture tidak menggantikan pembuktian ekspor dan restore produksi.

### Drill pemulihan operator

1. Catat waktu mulai, proyek sumber, jumlah tabel/baris dan hash sampel terotorisasi. Jangan menyalin data pribadi ke laporan publik.
2. Salin database dan berkas Storage melalui akses operator yang sah. Simpan inventaris path, ukuran, MIME dan SHA-256 setiap berkas secara privat. Jangan mengandalkan URL unduhan sementara sebagai cadangan.
3. Buat target uji kosong dengan role dan extension yang sesuai. Hindari target produksi. Ikuti panduan Supabase untuk migrasi/restore pada proyek Supabase baru: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore .
4. Untuk target PostgreSQL **lokal** yang sudah disiapkan, `npm run restore:db:test -- /path/manifest.json` hanya menerima host loopback, nama database `lms_restore_*`, kunci yang benar dan `LMS_RESTORE_ACK=isolated-test-database`. Pemeriksaan checksum/dekripsi selesai sebelum `pg_restore` dijalankan. Skrip tidak menjalankan `--clean`, tidak membuat role, dan tidak mengizinkan pemulihan otomatis ke produksi.
5. Cocokkan jumlah dan hash, lalu uji login/aktivasi, kelas, file privat, tugas, hasil kuis, hak orang tua dan penolakan lintas kelas. Pastikan GRANT/REVOKE dan RLS tetap benar; jangan menghilangkan ACL demi membuat restore terlihat berhasil.
6. Ukur RTO (waktu pulih) dan RPO (selisih cadangan terakhir). Tetapkan jadwal operator, misalnya sebelum kuis penting dan setiap akhir hari sekolah; jadwal ini belum diotomatisasi.
7. Terima cadangan hanya setelah data dan alur aplikasi berhasil dipakai pada target uji. Pemulihan ke produksi memerlukan prosedur terpisah saat benar-benar diperlukan.

## Checklist penerimaan browser dan perangkat — masih terbuka

| Skenario | Bukti yang harus dicatat | Status |
|---|---|---|
| Guru membuat kuis, rilis nilai dan pembahasan | Alur nyata dan tidak ada error konsol | Belum diuji browser |
| Siswa mulai, refresh dan melanjutkan | ID percobaan/jawaban tetap sama | Belum diuji browser |
| Dua tab/perangkat | Konflik terlihat; tidak ada jawaban tertimpa diam-diam | Logika antrean diuji; browser belum |
| Putus jaringan sebelum/selepas ACK | Status jujur; retry tidak menggandakan revisi | Logika retry diuji; jaringan nyata belum |
| Waktu habis saat offline | Jawaban terlambat tidak dianggap tersimpan | Backend diuji; browser belum |
| Ponsel dan laptop | Tidak terpotong; tab, radio, tombol dan tabel dapat digunakan | Belum diuji perangkat |
| Password baru dan login ulang | Sesi lama ditolak | Tes otomatis; browser ulang belum |
| Orang tua beberapa anak | Hanya anak tertaut; nilai tertutup tidak bocor | Tes database; browser belum |
| Lampiran privat dan ekspor | File hanya untuk pihak berizin; nama dan tabel terbaca | Excel/PDF otomatis; Storage hosted belum |
| Cadangan produksi + Storage dipulihkan | Hash/jumlah dan penggunaan nyata sesuai | Fixture lokal lulus; produksi belum |

Selesaikan checklist tersebut sebelum menyatakan aplikasi lolos seluruh gerbang penggunaan sekolah. Jangan menandai baris sebagai lulus hanya karena halaman berhasil mengembalikan HTTP 200.
