# Halaman Profil

Halaman `/profil` tersedia dari navigasi utama dan tombol Kelola profil di Ruang Akun. Link Ubah password yang sudah ada tetap tersedia. Halaman Ganti Password menerima asal Profil dan hanya menawarkan kembali untuk akun yang selesai aktivasi.

## Tab dan hak akses

| Tab | Isi |
|---|---|
| Data pribadi | Foto profil privat, nama lengkap, nomor HP/WhatsApp |
| Identitas | Siswa: nomor induk readonly. Tenaga pendidik: kode pegawai readonly, NIP/NPK/NIK. Peran lainnya: NIK |
| Akun & keamanan | Username, email pemulihan, status verifikasi, status akun, peran, tanggal pembuatan, tautan ganti password |
| Informasi peran | Siswa: rombel semester aktif serta nama/HP wali. Guru: mengajar, kepala madrasah, wali kelas, jadwal piket. Wali: daftar anak tertaut bernomor bila lebih dari satu |

Semua peran pada akun ditangani bersamaan; guru yang juga wali tetap melihat informasi yang relevan. Siswa berakun Nonaktif tidak muncul pada daftar anak. Data kelas dan tautan keluarga dibatasi sekolah milik pengguna yang dipilih, dengan status akun aktif dan tautan aktif. NIP/NPK/NIK dan nomor telepon disimpan sebagai teks.

## Aturan perubahan

| Bidang | Ketentuan |
|---|---|
| Foto | Tambah/ganti/hapus masing-masing memulai masa tunggu 90 hari. Membaca foto tidak dibatasi masa tunggu |
| Nama lengkap | 45 hari |
| NIP, NPK, NIK | Satu kelompok identitas, masa tunggu bersama 45 hari. NIP 18 digit, NPK 13 digit, NIK 16 digit; boleh kosong jika belum memiliki |
| Email | 60 hari; password saat ini wajib benar. Verifikasi email baru wajib diselesaikan sebelum memakai halaman lainnya |
| Username | Siswa readonly, termasuk akun multi-peran yang memiliki peran siswa. Peran lain: 40 hari dan password saat ini wajib benar; harus unik |
| HP/WA | Dapat diperbarui tanpa masa tunggu; 8–15 digit, boleh diawali + |
| Peran/status akun/nomor induk/rombel/penugasan/keluarga | Readonly; tidak dapat diubah melalui API profil |

Pengguna dapat melakukan perubahan pertama segera. Masa tunggu dihitung dari perubahan nyata yang berhasil, bukan dari umur akun atau penyimpanan tanpa perubahan. Waktu server dan row lock menegakkan aturan; revision menolak penyimpanan berdasarkan data kedaluwarsa. Tanggal akses berikutnya ditampilkan dalam WIB. Akses akun Nonaktif tetap ditolak mengikuti aturan login yang sudah ada.

Email Auth internal tetap memakai alamat UUID sintetis; perubahan email kontak tidak mengubah pemetaan login. Username baru dipakai melalui lookup login yang sudah ada. Semua jalur `email_issue`, termasuk halaman verifikasi lama, mengikuti masa tunggu. Mengirim ulang tautan ke alamat baru yang sama tetap diperbolehkan. Jika pengiriman SMTP gagal setelah alamat diubah, pengguna berada di halaman verifikasi dan dapat mengirim ulang ke alamat yang sama; alamat tidak dapat diganti untuk melewati masa tunggu. Konfirmasi UI menegaskan agar alamat diperiksa sebelum menyimpan.

## Penyimpanan dan keamanan

Migrasi `20261018104028_profile_self_service.sql` diterapkan pada proyek Supabase yang sama. Tabel `private.profile_details` dan `private.profile_audit` memakai RLS serta menolak akses langsung anon/authenticated. Fungsi publik profile_command bersifat invoker, hanya dapat dieksekusi service_role; fungsi privat memeriksa sesi hidup, aktivasi, pemilik akun, dan sekolah. Audit hanya menyimpan bidang yang berubah, tidak menyalin NIK/password/token.

Foto maksimal 3 MB, format statis JPG/PNG/WebP, maksimal 16 megapiksel. Sharp memvalidasi, memperbaiki orientasi, memperkecil hingga sisi 640 piksel, membuang metadata, dan menyimpan WebP. Bucket `profile-photos` privat. Foto hanya dibaca melalui endpoint pemilik yang terautentikasi dengan private/no-store dan nosniff. Jalur objek dibuat server, tidak diterima dari klien. Unggahan yang gagal tersimpan di DB dibersihkan; foto lama dibersihkan setelah pointer baru berhasil disimpan.

Penghapusan alumni yang telah diotorisasi kini membersihkan foto profil sebelum menghapus Auth. Jika pembersihan gagal, Auth tidak dihapus dan operasi dapat diulang. Pembacaan internal catatan retensi tetap dapat memeriksa siswa yang dinonaktifkan oleh proses penghapusan; daftar yang ditampilkan ke pengguna tetap disaring. Backup database yang ada mencakup tabel baru. Backup Storage mendukung `LMS_STORAGE_BUCKET=profile-photos` (default tetap lms-private); gunakan direktori privat terpisah untuk setiap bucket serta konfigurasi enkripsi/ACK operator yang sudah ada. Tidak ada backup data pribadi yang dijalankan pada pekerjaan ini.

Pemeriksaan advisor cloud: tidak ada masalah keamanan baru selain INFO RLS tanpa policy pada dua tabel privat yang memang deny-by-default. Peringatan leaked-password protection sudah ada sebelumnya dan tidak diubah. Referensi: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy dan https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Validasi

- 146 pengujian otomatis lulus, termasuk relasi nyata melalui migrasi database lokal, masa tunggu setiap bidang, edit tanpa perubahan, revisi kedaluwarsa, username unik, larangan siswa, batas/pemrosesan foto, kepemilikan foto, verifikasi ulang/resend email, izin fungsi dan isolasi sekolah, serta cleanup foto retensi.
- 295 pemeriksaan UI lulus pada 320, 390, 768, dan 1440 piksel, termasuk peran siswa/guru/wali/admin, tab keyboard, form readonly/terkunci, konfirmasi batal/simpan, unggah/hapus foto dan pengalihan verifikasi email. Browser menggunakan data sintetis dan mock API.
- 19 skenario HTTP lulus, termasuk halaman dan API Profil anonim tertutup, CSRF ditolak, serta respons privat tanpa cache.
- Build/typecheck lulus; bucket dan izin tabel/fungsi diperiksa langsung di cloud. Tidak ada akun produksi yang diubah, foto pribadi diunggah, atau email sungguhan dikirim untuk pengujian. Penerimaan alur pengguna produksi tetap perlu dilakukan oleh pengguna yang login.
