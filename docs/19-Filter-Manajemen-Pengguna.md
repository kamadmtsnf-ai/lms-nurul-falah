# Filter Manajemen Pengguna

Daftar pengguna mendukung pencarian username/nama, filter akun Aktif/Nonaktif, filter aktivasi, serta pengurutan username naik/turun. Filter diterapkan pada seluruh pengguna sekolah sebelum pagination 50 baris.

- Status aktivasi: wajib ganti password diprioritaskan, lalu menunggu verifikasi email atau akun terverifikasi. Status aktif/nonaktif tetap terpisah.
- Huruf selalu mendahului angka pada kedua arah; bagian angka diurutkan secara natural (guru2 sebelum guru10 pada urutan naik), termasuk angka panjang tanpa kehilangan presisi.
- Data dimuat sekali dan dimuat ulang setelah perubahan. Setiap halaman RPC tetap memeriksa sesi, aktivasi dan hak admin sekolah. Batas pengaman 2.000 pengguna menghasilkan pesan kesalahan eksplisit jika terlampaui, bukan hasil terpotong.
- Form Tambah Pengguna tertutup secara default. Menutup/membuka mempertahankan draf; berhasil menambahkan akun menutup dan mereset form serta mengembalikan fokus ke tombol.
- Tidak ada perubahan skema database maupun alur aktivasi dan hak akses.

Validasi: build dan typecheck lulus; 132 pengujian otomatis lulus; 191 pemeriksaan UI lulus pada 320, 390, 768, dan 1440 piksel, tanpa JavaScript error atau overflow yang terdeteksi; 17 skenario HTTP lulus. UI menggunakan data sintetis dan API mock, sedangkan pengujian otorisasi menggunakan migrasi database lokal. Pengujian ini tidak menggantikan penerimaan dengan akun pengguna produksi.
