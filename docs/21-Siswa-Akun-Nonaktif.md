# Visibilitas siswa berdasarkan status akun

## Temuan dan perubahan

Keanggotaan kelas dan roster pertemuan tersimpan terpisah dari status akun. Akibatnya, menonaktifkan akun tidak otomatis menghilangkan nama dari absensi dan laporan.

Empat layanan server (akademik, pembelajaran, kuis, lanjutan) sekarang menyaring koleksi siswa setelah RPC yang sudah memeriksa sesi dan hak akses berhasil. Pemeriksaan hanya membaca ID profil yang sudah ada dalam respons terotorisasi, melalui client server privat, dalam batch maksimal 150 ID. Tidak ada query seluruh sekolah/global atau cache status lintas permintaan. Kegagalan memeriksa status menghasilkan error, bukan menampilkan data tanpa filter.

Cakupan: roster absensi harian/pertemuan, rekap kehadiran, pengumpulan dan nilai tugas, ringkasan/hasil kuis, nilai berbobot, laporan Excel/PDF, anak tertaut di pemantauan, anggota kelompok, progres materi, identitas/keanggotaan kelas/tautan wali dan daftar retensi siswa. Koleksi memakai student_id atau koleksi siswa yang jelas; ID mapel, berkas, soal, guru dan peran lain tidak diperlakukan sebagai siswa.

Manajemen Pengguna menggunakan layanan identity terpisah dan tidak disaring: akun Nonaktif tetap tersedia untuk admin. Data tersimpan, status keanggotaan, catatan nilai dan absensi tidak dihapus/diubah. Mengaktifkan akun kembali memulihkan visibilitas pada pemuatan berikutnya. UI yang sudah terbuka mengikuti status terbaru saat data dimuat ulang; tidak ditambahkan langganan realtime. Metadata has_more/offset dipertahankan, sehingga halaman kosong akibat filter tidak menghentikan ekspor atau menutup akses ke halaman berikutnya.

Tidak diperlukan migrasi atau perubahan kebijakan database. Penyaringan ini berlaku pada respons aplikasi dan ekspor, bukan penghapusan arsip atau perubahan hak akses database.

## Validasi

Pengujian unit mencakup semua jenis koleksi, kelompok bertingkat, pengecualian guru, data tidak bermutasi, status kembali aktif, batch 301 ID, deduplikasi, respons tanpa siswa dan kegagalan pemeriksaan status.

Pengujian dengan migrasi database lokal memastikan status disabled menghilangkan siswa dari respons course, absensi harian, laporan kuis, nilai berbobot dan state akademik; admin_list tetap memuat akun tersebut. Keanggotaan kelas tetap tersimpan dan aktivasi kembali memulihkan roster.

Pengujian browser memakai komponen nyata/API mock dan data sintetis, termasuk siswa Nonaktif di absensi harian, rekap harian, laporan dan hasil kuis pada mobile/desktop. Tidak ada akun produksi yang diubah untuk pengujian.

Hasil akhir: 135 pengujian otomatis, 223 pemeriksaan UI, 17 skenario HTTP, build dan typecheck lulus. Tidak ada JavaScript error yang teridentifikasi pada pengujian browser.
