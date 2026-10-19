# Feedback verifikasi email dan reset password admin

## Verifikasi email

Form menampilkan pesan berbahasa Indonesia untuk isian kosong/alamat tidak valid, indikator pengiriman, keberhasilan (beserta alamat tujuan, masa berlaku 15 menit dan petunjuk spam), kegagalan pengiriman, koneksi terputus, serta pembatasan percobaan. Email dinormalisasi sebelum validasi server. Permintaan ganda dicegah selama pengiriman.

Keberhasilan berarti server SMTP menerima alamat tujuan dan status outbox berhasil dicatat; bukan jaminan email sudah masuk kotak utama. Penolakan SMTP membatalkan token dan menghasilkan feedback gagal. Pengiriman email pemulihan tetap memakai respons umum untuk melindungi keberadaan akun.

## Reset oleh admin

1. Buka Manajemen Pengguna dan cari pengguna.
2. Klik **Reset password [username]**, periksa identitas di dialog, lalu konfirmasi.
3. Setelah berhasil, sampaikan password awal **12345678** kepada pemilik akun secara pribadi.
4. Pengguna login, wajib mengganti password, lalu login ulang menggunakan password barunya.

Admin tidak bisa mereset akun sendiri melalui tombol ini; gunakan Ubah Password. Reset hanya untuk anggota sekolah yang dikelola. Akun lintas sekolah/peran pusat ditolak agar admin satu sekolah tidak mengubah kredensial bersama. Status nonaktif, email terverifikasi, username, kelas dan peran dipertahankan.

Server memeriksa sesi aktif, aktivasi admin, MFA bila terpasang, peran dan cakupan sekolah sebelum memanggil Auth Admin API. Permintaan dilindungi Origin, pembatasan percobaan, konfirmasi eksplisit dan mutex server per akun. RPC istimewa hanya dapat dijalankan service_role; kunci tidak dikirim ke browser.

Sebelum perubahan password, cutoff sesi diperbarui dan token email sebelumnya dibatalkan. Password Auth diperbarui melalui API resmi, refresh session dicabut, kemudian cutoff diperbarui kembali dengan flag wajib ganti password tetap aktif. Audit mencatat aktor dan target tanpa password/token. Jika jaringan terputus di tengah proses, akses lama tetap diblokir; ikuti pesan dan ulangi setelah kunci operasi kedaluwarsa (5 menit). Reset tidak menonaktifkan MFA pengguna.

## Validasi

198 tes otomatis lulus, termasuk cakupan admin/sekolah, MFA, reset diri sendiri, akun bersama, kunci operasi ganda, nonce salah/ulang, status nonaktif, preservasi email dan penolakan sesi lama. 40 pemeriksaan UI mencakup validasi/gagal/berhasil, batal reset, konfirmasi dan kegagalan reset pada 320/390/768/1440 px. Data uji sintetis; password akun produksi dan email penerima asli tidak digunakan untuk pengujian.
