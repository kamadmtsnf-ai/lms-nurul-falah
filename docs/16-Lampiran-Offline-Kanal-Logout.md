# Lampiran, offline, kanal pesan dan logout — 18 Oktober 2026

## Perubahan

- Materi dan Tugas menampilkan daftar berkas dengan ikon, ukuran, unduhan dan tombol hapus bagi pengampu/admin yang dapat mengelola semester tersebut. Lampiran kiriman siswa tetap dipertahankan sebagai bukti versi pengumpulan.
- Konfirmasi hapus menjelaskan dampak tindakan. Server mengulang pemeriksaan aktivasi/peran/kelas melalui RPC `learning_command('course')` yang sudah ada, memeriksa sekolah, jenis, tujuan dan path objek. Permintaan dicatat pada audit. Metadata ditandai `removed` sebelum Storage dihapus; kegagalan Storage dapat dicoba ulang. Tidak menerima path objek dari browser dan tidak membuka policy RLS.
- Uploader memakai tombol Pilih berkas, ikon, nama file, status proses, pesan kesalahan dan batas format/ukuran. Validasi ukuran dilakukan sebelum izin unggah dibuat, lalu signature dan otorisasi tetap diperiksa server.
- Subtab Lanjutan memakai dua kolom pada layar sempit dan membungkus pada layar besar, dengan status pilihan dan fokus yang jelas.
- Logout memerlukan modal konfirmasi. Fokus dimulai pada Batal, terkurung dalam modal, Escape membatalkan saat tidak sibuk, dan fokus kembali ke pemicu. Error logout tetap tampil dalam modal; klik membuka atau membatalkan tidak memutus sesi. Salinan offline dibersihkan pada konfirmasi keluar sesuai alur sebelumnya.

## Analisis dan perbaikan offline

Offline terkontrol memang sudah mempunyai implementasi, tetapi memerlukan aktivasi admin. Ruang lingkupnya materi teks/tautan dan draf tugas individu teks/tautan, maksimal 30 menit dalam sesi tab; berkas privat, kuis, nilai dan kredensial sesi tidak disalin. Masa berlaku dan pemeriksaan server tidak dihilangkan.

Temuan yang diperbaiki:

1. Simpan/bersihkan/hapus/baca yang berjalan bersamaan dapat berlomba membuat kunci dan vault, menghitung kuota atau menghapus data. Operasi sekarang diantrekan dalam tab. Tes mencakup 20 penyimpanan serentak, kuota, logout dan isolasi akun/tab.
2. Menyimpan materi tidak membuktikan halaman pembacanya tersedia tanpa internet. Persiapan kini menunggu service worker dan cache halaman offline yang sesuai versi, dengan timeout dan pesan tindak lanjut.
3. Halaman offline lama bisa terus tersimpan sesudah rilis baru. Cache publik dinaikkan ke v3. Bila pembaruan service worker menunggu, pengguna diarahkan menyelesaikan draf lalu menutup tab LMS lain sebelum mencoba kembali. Data IndexedDB tidak diganti formatnya.
4. Link menuju Ruang offline memakai navigasi dokumen agar fallback service worker dapat bekerja ketika jaringan tidak tersedia. UI membedakan keadaan koneksi dan menonaktifkan pengumpulan ketika perangkat offline.
5. Pengumpulan memakai transport JSON aplikasi yang konsisten, memeriksa masa tiket, identitas/sekolah dan konteks server; ID request dan revisi dipertahankan untuk retry. Draf dihapus hanya setelah ACK. Konfirmasi memakai modal. Lokasi fitur pada empty state dikoreksi menjadi tab Pengembangan.
6. Tombol dan panduan aktivasi kini membedakan belum aktif, sedang memeriksa, serta semester yang tidak dapat diubah. Draf untuk tugas tanpa format teks/tautan tidak ditawarkan.

Tes browser memakai build Next.js produksi, service worker dan IndexedDB asli dengan record lokal sintetis. Server lokal benar-benar dihentikan setelah cache dipasang, sehingga tes tidak bergantung pada emulasi offline yang mungkin tidak memutus fetch service worker. Materi terbaca, draf diedit/disimpan/muat ulang, navigasi halaman akun jatuh ke shell offline, dan cache hanya berisi `/offline` serta `/_next/static/`. Ini bukan uji pengumpulan terautentikasi di produksi atau perangkat fisik. Tiket dan pengumpulan terotorisasi juga diperiksa oleh tes database lokal yang memakai seluruh migrasi.

## Analisis dan perbaikan WhatsApp / Telegram

Adapter penyedia, kontak dengan persetujuan, antrean unik, klaim maksimal tiga penerima dan ACK server sudah ada. Fitur tetap perlu diaktifkan admin dan kredensial penyedia dipasang oleh operator; tidak dibuat bot/akun/layanan berbayar secara otomatis.

- Menambahkan endpoint readiness yang memeriksa akses pengelola dan mengembalikan status konfigurasi saja, tanpa token. UI membedakan fitur belum aktif, konfigurasi belum tersedia, belum ada pesan dan belum ada tujuan yang memenuhi syarat.
- Konfigurasi tiap kanal divalidasi terpisah; konfigurasi WhatsApp yang keliru tidak mematikan Telegram yang valid.
- Notifikasi memuat ringkasan serta tautan ke kelas di LMS. Pesan panjang disingkat tanpa memotong pasangan Unicode agar muat dalam batas kanal; pesan lengkap tetap berada di LMS. Pemeriksaan panjang tetap dilakukan sebelum request penyedia. Ini menghindari pesan panjang masuk ke status tidak pasti hanya karena parameter template terlalu panjang.
- Respons Telegram baru dianggap diterima jika ada `ok` dan `message_id`. Request timeout/error tidak membocorkan URL/token penyedia.
- Perhitungan hasil diperbaiki: penerimaan penyedia yang gagal dicatat ACK tidak dihitung ganda sebagai diterima dan tidak pasti.
- Antrean menampilkan jumlah tujuan aktual; pengiriman memerlukan modal konfirmasi. Status tidak pasti tidak dikirim ulang otomatis, agar respons hilang tidak menghasilkan pesan ganda. Operator harus memeriksa riwayat penyedia untuk status tersebut.
- Permintaan yang selesai setelah panel ditinggalkan tidak mengganti state panel yang baru.

### Menggunakan kanal

1. Admin membuka Pengaturan pengembangan, mengaktifkan kanal setelah validasi sekolah, lalu menyimpan tujuan siswa beserta persetujuan/verifikasinya.
2. Operator memasang `LMS_CHANNEL_CONFIG_JSON` pada environment **server** Vercel dan melakukan redeploy, mengikuti contoh di [panduan Tahap 9](12-Tahap-9-Pengembangan.md#kredensial-server). Jangan memasukkan token ke chat, form pengguna, atau variabel `NEXT_PUBLIC_*`.
3. Telegram membutuhkan token bot dan chat ID pribadi pengguna yang sudah memulai bot. WhatsApp membutuhkan token, phone number ID, versi Graph, nama/bahasa template yang disetujui dengan satu parameter body.
4. Guru membuat pesan di Lanjutan → Notifikasi kegiatan, membuka Pengembangan, memilih pesan/kanal dan mengantrekannya. Periksa jumlah tujuan lalu Kirim batch. Ulangi batch hanya untuk tujuan yang masih menunggu.

Pengiriman nyata tidak diuji karena tidak ada penerima uji dan kredensial penyedia yang diberikan untuk tugas ini. Tes adapter memakai HTTP simulasi; tes UI antrekan/konfirmasi/status juga memakai API simulasi. Jangan menafsirkan status konfigurasi sebagai verifikasi token oleh penyedia atau bukti pesan dibaca. Webhook delivery/read belum menjadi bagian implementasi ini.

Dokumentasi resmi: [Storage remove Supabase](https://supabase.com/docs/reference/javascript/storage-from-remove), [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage), [template WhatsApp Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/).

## Validasi dan batas pengujian

Bukti: `verification/ui-audit-results.json`, `verification/offline-browser-latest.json`, serta bagian `learning_improvements` pada `VERIFICATION.json`.

- Tes otomatis: izin pengelola vs siswa, kelas lain, semester arsip, penutupan akses sebelum penghapusan Storage, retry gagal parsial, enkripsi/kuota/race offline, kontak dan klaim kanal, konfigurasi serta payload penyedia.
- UI: viewport 320/390/768/1440, orientasi melebar, konfirmasi batal/lanjut/error, hapus Materi/Tugas, penolakan ukuran sebelum upload, tombol siswa, dan alur kanal.
- Offline: delapan pemeriksaan browser nyata dengan server lokal dihentikan.
- Typecheck, build produksi dan 17 kelompok HTTP smoke test.
- Tidak menghapus berkas/data sekolah nyata, tidak mengirim pesan nyata, tidak mengubah konfigurasi fitur sekolah secara otomatis, dan tidak menyatakan gate latensi/restore Tahap 6 telah selesai.

## Database dan deployment

Implementasi akhir memakai RPC, tabel dan akses server yang sudah ada; **tidak memerlukan migrasi schema**. Permintaan migrasi sebelumnya gagal dengan `Invalid or expired requestState`. Percobaan DDL melalui SQL langsung ditolak auto-review karena mekanisme tersebut tidak tepat. Jalur tersebut dihentikan, tidak dijalankan secara tidak langsung; rancangan akhir menghilangkan kebutuhan perubahan struktur database.

Advisor produksi tetap menunjukkan informasi tabel RPC-only tanpa policy langsung dan peringatan leaked-password protection yang sudah ada. Tidak ditambahkan policy terbuka atau diubah layanan berbayar. Referensi: [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [keamanan password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
