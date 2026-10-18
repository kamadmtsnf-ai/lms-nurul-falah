# Uji penerimaan, backup, pemulihan, dan insiden

## Status dan batas bukti

Uji penerimaan otomatis memakai database aplikasi dengan seluruh migrasi dan identitas sintetis: admin, guru pengampu, siswa, orang tua/wali, kepala sekolah, wali kelas, guru piket, guru tanpa penugasan, multi-peran, akun nonaktif, dan sesi dicabut. Data dibaca dan ditulis melalui RPC asli. Ini bukan pengganti persetujuan operator sekolah pada perangkat nyata.

Drill citra aplikasi lokal mencadangkan database PGlite lengkap, mengenkripsi, mendekripsi, membuka citra baru, lalu memeriksa data, laporan berizin, dan penolakan tabel privat. Workflow **Native synthetic restore drill** menguji `pg_dump`/`pg_restore` PostgreSQL 17 sungguhan pada database lokal disposable, beserta data, foreign key, RLS dan ACL. Drill native memakai data sintetis, bukan backup produksi.

Backup produksi belum dapat dinyatakan berjalan sebelum konfigurasi di bawah tersedia dan satu run selesai dengan checksum remote cocok. Restore backup produksi ke lingkungan Supabase terpisah tetap harus diuji sebelum menerima target RTO. Jangan menjalankan restore uji ke produksi.

## Uji penerimaan sekolah

| Peran | Alur yang diperiksa | Batas akses |
|---|---|---|
| Admin | Akademik, pengguna, penugasan, koreksi/finalisasi | Sekolah aktif yang diizinkan |
| Guru pengampu | Materi, tugas, absensi pertemuan, kuis, nilai | Kelas/mata pelajaran pengampu |
| Siswa | Materi terpublikasi, tugas, autosave/akhir kuis | Data sendiri; nilai sesuai publikasi |
| Orang tua/wali | Anak tertaut dan laporan | Anak yang ditautkan admin |
| Kepala sekolah | Laporan dan pembukaan finalisasi | Tidak otomatis menjadi pengampu |
| Wali kelas | Rekap kelas dan laporan | Kelas penugasan |
| Guru piket | Absensi harian pada jadwal semester | Tidak otomatis boleh mengajar/menilai |
| Multi-peran | Gabungan hak yang diberikan admin | Tetap memerlukan aktivasi akun dan sesi valid |

Suite yang sudah ada juga memeriksa password awal, verifikasi email, MFA, profil, unggahan, arsip, dan retensi. Jalankan `npm test`, `npm run build`, `npm run test:http`, `npm run test:ui`, serta `npm run test:quiz:reliability`. Pengujian browser memerlukan build CSS dan Chromium.

Checklist penerimaan manusia: login tiap peran pada desktop/mobile; periksa akun/email/MFA; jalankan satu pertemuan, satu tugas, dan satu kuis sintetis; buka/tutup nilai; periksa anak/kelas yang tidak berhak tidak terlihat; putus/pulihkan jaringan; ekspor laporan; logout; catat tanggal, versi, hasil, dan penanggung jawab. Jangan memakai nilai siswa asli untuk uji mutasi.

## Backup otomatis produksi

Workflow `.github/workflows/backup.yml` berjalan harian pukul **02.17 WIB** dan dapat dijalankan manual pada `main`. GitHub dapat menunda jadwal; ini bukan jaminan tepat waktu. Repo publik: tidak ada unggahan backup ke artifact publik atau git.

Alur: `pg_dump` custom terenkripsi AES-256-GCM → kedua bucket privat (`lms-private`, `profile-photos`) beserta manifest terenkripsi → unggah ke bucket S3 kompatibel privat → unduh ulang → cocokkan seluruh inventaris dan checksum → bersihkan berkas sementara. Kegagalan salah satu langkah menggagalkan run; upload parsial tidak boleh dianggap recovery point. Data DB dan Storage tidak memiliki snapshot atomik bersama; pilih jendela sepi, pertahankan berkas versi lama selama backup, dan rekonsiliasi referensi sebelum menerima restore.

Operator perlu mengisi **Settings → Secrets and variables → Actions** di GitHub. Jangan kirim rahasia melalui chat, issue, log, atau repository.

Secrets:

- `LMS_BACKUP_PGHOST`, `LMS_BACKUP_PGPORT`, `LMS_BACKUP_PGUSER`, `LMS_BACKUP_PGPASSWORD`: koneksi PostgreSQL yang mendukung dump lengkap. Untuk runner IPv4 gunakan session pooler yang sesuai, bukan transaction pooler.
- `LMS_BACKUP_KEY_BASE64`: kunci acak **32 byte**, base64. Simpan salinan pemulihan di password manager terpisah; kehilangan kunci membuat backup tidak dapat dipulihkan. Jangan mengganti tanpa menyimpan kunci versi lama.
- `LMS_BACKUP_SUPABASE_KEY`: kredensial server operator untuk membaca kedua bucket. Tidak pernah menjadi `NEXT_PUBLIC_*`.
- `LMS_BACKUP_ACCESS_KEY_ID`, `LMS_BACKUP_SECRET_ACCESS_KEY`: kredensial S3 terbatas ke bucket backup privat, dengan izin upload/download/list yang diperlukan.

Variables:

- `LMS_BACKUP_BUCKET`: nama bucket privat tujuan di layanan terpisah.
- `LMS_BACKUP_ENDPOINT`: origin HTTPS layanan S3 kompatibel.
- `LMS_BACKUP_REGION`: region provider (`auto` bila provider memerlukannya).
- `LMS_BACKUP_DESTINATION_ACK`: isi `private-bucket-verified` **setelah** mematikan akses publik dan memeriksa izin bucket.

PostgreSQL memakai TLS `verify-full`. Workflow menggunakan klien PostgreSQL 17 sesuai server saat implementasi. Perubahan mayor server perlu tinjauan klien. Tidak ada akun penyimpanan, paket berbayar, atau penagihan yang diaktifkan otomatis.

Pilih tujuan privat yang sudah dimiliki atau penyedia dengan kuota gratis yang mencukupi; periksa kuota dan biaya aktual sebelum mengaktifkan. Backup + verifikasi mengonsumsi egress/penyimpanan; GitHub Actions juga mempunyai batas penggunaan. Retensi awal yang disarankan: 7 backup harian dan 4 mingguan jika kuota cukup. Atur lifecycle pada provider setelah menimbang kebutuhan arsip/retensi data siswa. Script tidak menghapus backup lama secara otomatis.

Setelah konfigurasi: jalankan **Encrypted production backup → Run workflow**; wajib lulus, lalu unduh backup secara privat dan lakukan restore terisolasi. Tidak ada status hijau palsu saat rahasia belum tersedia.

## Latihan pemulihan

Workflow native berjalan pada push yang relevan, bulanan tanggal 2 pukul 03.47 WIB, atau manual. Hasil otomatis dilihat di Actions. Local command: `LMS_NATIVE_DRILL_ACK=disposable-local-postgres PGHOST=127.0.0.1 ... node scripts/operations/native-restore-drill.mjs` pada server disposable baru, PostgreSQL/client 17 tersedia.

Untuk backup produksi, gunakan proyek/database pemulihan terpisah. Siapkan roles/extensions, periksa hash dan kunci, pulihkan schema/data/ACL, pulihkan objek ke bucket privat yang benar, lalu rekonsiliasi referensi dan hash. Backup database saja tidak memuat byte objek Storage. Drill CLI otomatis sengaja menolak host remote dan database produksi; restore Supabase staging adalah prosedur operator tersendiri.

Validasi: jumlah record dan relasi, RLS/ACL, pengguna/peran, arsip, tugas/nilai/kuis, kedua bucket, URL lampiran/foto, dan sesi. Jangan membuka sesi autentikasi lama dari backup ke pengguna; cabut sesi dan validasi keamanan akun sebelum cutover. Jangan menerima backup hanya karena proses restore selesai. Target awal RPO 24 jam dan RTO 4 jam adalah **target**, belum terbukti untuk produksi sampai pengukuran drill nyata selesai.

## Monitoring dan penanganan insiden

**Production public monitoring** berjalan per jam pada menit 17, serta manual/push relevan. Memeriksa identitas respons health, penolakan anonim, CSRF, dan cache privat. Run gagal jika pemeriksaan tidak sesuai. Ini mendeteksi kegagalan aplikasi/proteksi publik; tidak membuktikan database, email, Storage, atau kapasitas kuis. Pemeriksaan ini bukan monitoring real-time. Jika secret `LMS_BACKUP_SUPABASE_KEY` sudah tersedia, workflow juga memeriksa RPC database dan kedua bucket privat. Jika belum tersedia, ringkasan run secara eksplisit menandai readiness privat BLOCKED. SMTP dan penerimaan notifikasi tetap memerlukan pemeriksaan operator.

Aktifkan notifikasi kegagalan GitHub Actions pada akun penanggung jawab dan pastikan pesan uji benar-benar diterima. Pengiriman notifikasi/email ke penerima nyata tidak dilakukan oleh implementasi ini. Untuk deteksi lebih cepat, gunakan pemantau eksternal dengan interval lebih pendek sesuai kuota; untuk backend gunakan Vercel Runtime Logs dan Supabase Logs/Advisors. Tidak ada kredensial, jawaban, nama/NIS, nilai, atau token dalam hasil probe publik.

| Tingkat | Contoh | Tindakan awal |
|---|---|---|
| SEV1 | Kebocoran atau kehilangan data terkonfirmasi | Admin/operator memimpin; batasi akses terdampak, cabut sesi/kunci terkait, simpan bukti privat |
| SEV2 | Login/kuis/layanan utama gagal | Hentikan perubahan, lihat deploy/log/health, gunakan prosedur pembelajaran cadangan |
| SEV3 | Gangguan sebagian fitur | Isolasi modul, catat reproduksi sintetis, prioritaskan perbaikan |

Urutan respons: catat waktu WIB dan versi → tentukan dampak → tunjuk admin sebagai penanggung jawab dan guru/kepala sekolah sebagai pemeriksa akademik → batasi dampak → korelasikan Vercel/Supabase logs tanpa menyebar PII → pilih perbaikan/rollback → uji akses, autosave, nilai, dan lampiran → pantau pemulihan → tulis akar masalah dan pencegahan.

Rollback aplikasi tidak membatalkan migrasi/data. Periksa kompatibilitas schema sebelum rollback; jangan menghapus atau menimpa nilai untuk memulihkan layanan. Jangan memperpanjang atau mengubah skor kuis massal tanpa keputusan akademik yang tercatat. Informasikan status melalui kanal sekolah yang diotorisasi; implementasi tidak mengirim pesan otomatis ke orang tua/siswa.

Template issue **Insiden operasional** tersedia. Repo publik: hanya gunakan ID kejadian acak, waktu, modul, dan dampak agregat. Bukti sensitif, identitas korban, dan pemberitahuan insiden harus ditangani secara privat sesuai prosedur sekolah.
