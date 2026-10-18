# Retensi lampiran pembelajaran

## Akses dan kondisi awal

Buka **Ruang belajar → Retensi data & lampiran → Lampiran pembelajaran**, atau `/admin/retensi`. Hanya admin sekolah aktif yang dapat mengatur dan memprosesnya. Tab **Data alumni** mempertahankan mekanisme retensi alumni yang sudah ada.

Kondisi awal aman: otomatisasi **nonaktif**, backup lampiran akademik diwajibkan, masa tenggang 14 hari. Belum ada berkas sekolah asli yang diantrekan atau dihapus sebagai bagian pengujian implementasi.

| Kategori | Bawaan | Dasar kelayakan |
|---|---:|---|
| Unggahan gagal/tidak terpakai | 2 hari | Umur unggahan dan izin upload sudah kedaluwarsa; berkas pengumpulan yang telah dirujuk tidak dianggap tidak terpakai |
| Lampiran materi guru | 365 hari | Semester arsip; dihitung dari waktu yang paling akhir antara akhir periode, pembaruan arsip semester, dan pembaruan materi |
| Lampiran tugas, termasuk pengumpulan siswa | 365 hari | Semester arsip, nilai final terkunci, tidak ada tindak lanjut direncanakan; semua referensi pengumpulan berada pada kegiatan yang juga memenuhi syarat |
| Masa tenggang antrean | 14 hari | Dihitung sejak berkas diantrekan, bukan sejak tanggal unggahan |

Admin dapat mengubah umur kategori menjadi 1–3.650 hari dan masa tenggang 1–90 hari. Semester arsip menjadi batas kegiatan aktif: materi/tugas boleh tetap berstatus terpublikasi agar arsip masih dapat dibaca. Sistem tidak mensyaratkan perubahan status tugas setelah finalisasi nilai.

Foto profil aktif tidak termasuk retensi lampiran. Foto lama tetap dibersihkan oleh mekanisme penggantian profil yang sudah ada. Tautan Drive/layanan lain tidak menyebabkan berkas di layanan asal dihapus. Kebijakan lampiran tidak menggantikan batas retensi data alumni maupun prosedur penghapusan akun.

## Pratinjau dan pengaktifan

1. Periksa daftar dan pengaturan. Berkas yang belum memenuhi syarat tidak diproses.
2. Klik **Pertahankan berkas** untuk pengecualian. Pelindungan ini membatalkan antrean yang belum dimulai. Lepas pelindungan lalu pilih **Antrekan ulang** jika berkas ingin diproses lagi dan sudah memenuhi syarat.
3. Klik **Pindai dan antrekan kandidat**. Tindakan ini aman saat otomatisasi nonaktif: hanya menambahkan kandidat ke antrean dengan masa tenggang, tanpa menghapus objek.
4. Periksa tenggat serta kebutuhan backup. **Batalkan antrean** menyimpan pembatalan; pemindaian berikutnya tidak otomatis mengantrekannya kembali.
5. Setelah kebijakan disetujui, centang otomatisasi, simpan, lalu ketik **AKTIFKAN RETENSI** pada dialog. Mengubah kebijakan yang aktif juga memerlukan konfirmasi.

Perubahan kebijakan memperbarui revisi; pemindaian berikutnya memperpanjang masa tenggang antrean lama sehingga perubahan tidak langsung menghapus berkas yang sudah lama diunggah. Ketidaklayakan baru diperiksa ulang sebelum penghapusan. Contoh: berkas pengumpulan yang baru dirujuk selama masa tenggang tidak lagi dianggap unggahan tidak terpakai, sehingga antreannya dibatalkan.

## Backup

Pengaturan **Wajib verifikasi backup** berlaku untuk lampiran akademik. Unggahan gagal/tidak terpakai tidak memerlukan backup akademik, tetapi tetap tunduk pada umur, pelindungan, dan masa tenggang.

Pada antrean akademik klik **Catat verifikasi backup**, isi referensi arsip, dan nyatakan backup berkas tersebut sudah diperiksa serta dapat dipulihkan. Ini adalah **pernyataan admin yang diaudit**, bukan pemeriksaan otomatis ke layanan backup. Jangan mengisinya bila backup belum tersedia. Referensi dapat menunjuk salinan lokal terenkripsi yang disimpan aman dan sudah diuji pemulihannya; tidak harus menggunakan penyimpanan eksternal. Jangan memasukkan password atau kunci backup pada referensi. Alur backup produksi pada panduan operasional masih memerlukan konfigurasi tujuan privat dan kredensial.

Admin dapat menonaktifkan kewajiban backup, dengan peringatan pada dialog pengaturan. Ini berarti penghapusan permanen dapat berlangsung tanpa salinan pemulihan. Kondisi awal tetap mewajibkan backup.

## Eksekusi harian dan manual

Vercel Cron memanggil endpoint privat `/api/cron/retensi-lampiran` sekali sehari, ekspresi `23 19 * * *` UTC (sekitar pukul 02 WIB). Ketepatan menit mengikuti paket/jadwal Vercel; jangan menganggapnya SLA. Secret hanya berada di environment produksi dan tidak diberikan ke browser. Preview tidak menggunakan secret produksi.

Pemrosesan otomatis hanya memilih pekerjaan baru untuk kebijakan aktif. Admin juga dapat memilih **Jalankan satu batch** setelah kebijakan aktif dan mengonfirmasi penghapusan. Maksimal 10 objek per sekolah/batch dengan anggaran waktu terbatas. Pemindaian menambahkan maksimal 200 kandidat per sekolah, sehingga antrean besar diproses bertahap; admin dapat mengulang pemindaian/batch sesuai kebutuhan. Penjadwal mengunjungi maksimal 20 sekolah per pemanggilan; proyek saat implementasi ditujukan untuk satu sekolah.

Alur worker:

- Kunci kebijakan, periksa tenggat/revisi/backup/pelindungan/referensi.
- Ambil lease satu objek dan tutup akses lampiran di metadata.
- Hapus objek melalui **Supabase Storage API**; tidak menghapus baris `storage.objects` memakai SQL.
- Setelah Storage berhasil, tandai selesai dan simpan waktu penghapusan akademik.
- Jika penghapusan gagal, pertahankan pekerjaan gagal dengan jeda 15 menit. Setelah lima percobaan, admin perlu memilih **Jadwalkan ulang percobaan**.
- Jika respons hilang, lease 20 menit memungkinkan rekonsiliasi/percobaan idempoten. Kegagalan pengakuan database tidak mengembalikan akses objek yang mungkin sudah terhapus.

Pekerjaan yang sudah dimulai bersifat tidak dapat dibatalkan: mematikan otomatisasi menghentikan pekerjaan baru, sedangkan pekerjaan yang sudah dimulai dituntaskan/reconciled. Pelindungan/pembatalan tidak tersedia setelah tahap ini. Pembukaan kembali semester/nilai ditahan selama masih ada pekerjaan terkait yang sedang diproses/gagal, sehingga berkas tidak digunakan ulang saat penghapusan belum pasti. Selesaikan retry atau hubungi operator jika pekerjaan tidak pulih.

## Riwayat dan ruang penyimpanan

Objek berkas dihapus, sedangkan nilai, teks pengumpulan, versi, waktu, dan metadata akademik dipertahankan. Daftar yang berhak melihat arsip menampilkan **“Lampiran telah dihapus sesuai kebijakan penyimpanan.”** tanpa tombol unduh/pratinjau rusak. Riwayat unggahan yang benar-benar tidak terpakai tidak ditampilkan sebagai lampiran akademik baru.

Ringkasan ukuran berasal dari metadata, bukan pengukuran kuota Storage. Antrean/pelindungan tidak membebaskan ruang. Ruang baru berkurang setelah objek berhasil dihapus; laporan kuota provider dapat memerlukan waktu untuk diperbarui. Penghapusan tidak dapat dibatalkan lewat tombol aplikasi. Pemulihan memerlukan salinan backup, pemulihan objek yang cocok, dan rekonsiliasi metadata oleh operator.

## Validasi

Tes memakai seluruh migrasi dan identitas sintetis: admin/non-admin, RLS, default nonaktif, tenggat, revisi kebijakan, pelindungan, pembatalan dan antre ulang, referensi baru, backup, lease usang, kegagalan Storage, respons hilang, pembukaan semester/nilai, penolakan penggunaan ulang objek, serta nilai/riwayat yang tidak berubah. Browser menguji formulir, dialog, tabel, pagination, kondisi kosong, dan penanda lampiran terhapus pada 320/390/768/1440 piksel. Snapshot objek Storage sekolah asli tidak digunakan untuk uji penghapusan.
