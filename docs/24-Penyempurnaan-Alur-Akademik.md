# Penyempurnaan alur akademik

## Akses
Pada ruang mata pelajaran buka tab **Alur akademik**. Pengampu/admin mengelola tujuan pembelajaran, pemetaan materi/tugas/kuis, remedial/pengayaan, dan finalisasi nilai. Siswa dan wali hanya melihat peserta serta nilai yang diizinkan dan sudah dibuka oleh guru. Pengguna nonaktif tidak ditampilkan.

## Tujuan pembelajaran
Buat kode, judul, dan ambang ketuntasan 0–100. Hubungkan aktivitas dari mata pelajaran yang sama. Ketuntasan memakai rerata nilai penilaian terpublikasi yang dinormalisasi; seluruh penilaian terkait harus memiliki nilai. Progres materi ditampilkan terpisah. Tujuan dapat diarsipkan tanpa menghapus riwayat.

## Remedial dan pengayaan
Buat rencana untuk siswa dengan nilai sumber yang tersedia. Hasil remedial disimpan terpisah dari nilai asli. Kebijakan: pertahankan nilai asli; nilai tertinggi; hasil terbaru (dapat menurunkan nilai); atau nilai tertinggi dengan batas hasil remedial. Pengayaan mempertahankan nilai asli. Hasil terbaru yang memenuhi syarat digunakan, bukan penggabungan seluruh remedial. Perubahan nilai sumber atau percobaan kuis baru membuat hasil remedial sebelumnya tidak lagi berlaku. Penyelesaian dan pembatalan membutuhkan catatan. Rerata laporan dan ekspor mengikuti nilai efektif yang sama.

## Koreksi dan finalisasi
Koreksi nilai tugas, rubrik, dan esai membutuhkan alasan minimal lima karakter. Riwayat menyimpan nilai lama/baru dan pelaku. Nilai lama yang sudah ada sebelum fitur ini mendapat catatan awal; riwayat koreksi lampau tidak direka ulang.

Finalisasi mensyaratkan bobot/nilai peserta aktif lengkap dan tidak ada percobaan kuis berjalan. Snapshot mencakup seluruh peserta aktif, termasuk lebih dari satu halaman. Setelah dikunci, perubahan penilaian dan pengumpulan diblokir di database; pengaturan publikasi nilai tetap dapat dibuka. Hanya admin/kepala sekolah berwenang yang dapat membuka kembali dengan alasan. Snapshot lama tetap tersedia bagi peninjau yang berwenang. Perubahan keanggotaan kelas setelah finalisasi perlu ditinjau dan dapat memerlukan pembukaan/finalisasi ulang.

## Pergantian periode dan kenaikan kelas
Buka **Manajemen Akademik → Pergantian periode & kenaikan kelas**. Pilih rombel asal, rombel tujuan pada semester Draf, dan peserta. Pergantian semester berlaku Ganjil ke Genap dalam tahun/tingkat sama; kenaikan kelas berlaku Genap ke Ganjil tahun berikutnya, tingkat sama (mengulang) atau naik satu tingkat.

Pratinjau server berlaku 20 menit. Periksa peserta dan peringatan kesiapan, kemudian konfirmasi dengan mengetik **PINDAHKAN PESERTA**. Server memeriksa ulang perubahan data, akun, peran, dan duplikasi. Seluruh peserta diproses dalam satu transaksi; pengulangan permintaan tidak menggandakan peserta. Rekonsiliasi menampilkan hasilnya. Pendaftaran lama dan arsip dipertahankan. Proses tidak mengaktifkan semester, menyalin konten/pengampu, menentukan kelulusan, atau menjadikan alumni secara otomatis.

## Keamanan dan validasi
RPC memakai identitas sesi dan pemeriksaan MFA; tabel internal tidak dapat diakses langsung oleh pengguna. Mutasi dilindungi validasi, pemeriksaan Origin, batas ukuran, pembatasan permintaan, revisi, serta penguncian transaksi. Tidak ada data akademik baru yang disimpan offline.

Pengujian mencakup database lokal dengan seluruh migrasi, data sintetis 132 siswa, komponen React dengan API tiruan pada lebar 320/390/768/1440, dan pemeriksaan HTTP tanpa konfigurasi database. Pengujian terautentikasi dengan mutasi data sekolah asli di produksi tidak dilakukan.
