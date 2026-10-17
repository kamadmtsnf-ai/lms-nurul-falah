# Keputusan keamanan fondasi

## Batas implementasi

Tahap 1 memberi akses baca terbatas melalui RLS. Tidak ada izin insert/update/delete bagi role authenticated pada tabel fondasi, termasuk untuk admin sekolah; mutasi administratif akan dilaksanakan melalui endpoint/RPC terotorisasi dan diaudit pada tahap terkait. Jangan mengatasi penolakan ini dengan membuka akses tabel menyeluruh.

Profil boleh dibaca oleh pemilik akun yang sesinya masih valid, termasuk saat wajib mengganti password, agar proses aktivasi dapat menentukan langkah berikutnya. Data sekolah dan akademik membutuhkan akun aktif, sudah mengganti password, email terverifikasi dan keanggotaan sekolah yang aktif. Tabel email token/outbox dan admin platform tidak dapat dibaca user.

Schema private hanya memuat helper dan data privat. Fungsi SECURITY DEFINER memakai search_path kosong, referensi schema eksplisit dan pembatasan EXECUTE; helper memeriksa identitas JWT yang ditandatangani Supabase, bukan input user bebas.

## Sesi dan perubahan password

RLS memeriksa auth.sessions berdasarkan session_id JWT dan auth.uid(). Sesi dicabut, kedaluwarsa menurut not_after, akun dinonaktifkan, atau sesi dibuat sebelum credentials_changed_at akan ditolak. Ini mencegah JWT lama yang belum kedaluwarsa tetap membaca database setelah pemutusan sesi.

Pada Tahap 2, pergantian/reset password harus memperbarui password Auth, memperbarui credentials_changed_at dari waktu server, mencabut sesi, menghapus cookie, lalu mewajibkan login ulang. Semua endpoint istimewa wajib mengulang pemeriksaan akun; secret key melewati RLS sehingga bukan pengganti otorisasi.

Alur perubahan password lintas Auth dan profil bukan transaksi database tunggal. Tahap 2 harus menangani kegagalan parsial secara tertutup, membatalkan token dan menguji ulang sesi nyata. Pada Tahap 1 belum ada endpoint perubahan password atau token; jangan menyatakan alur tersebut sudah operasional hanya karena helper RLS lulus tes.

## Isolasi sekolah dan peran

Foreign key komposit membatasi relasi semester–tahun ajaran dan peran–membership dalam sekolah yang sama. Peran admin pusat ada dalam katalog tetapi tidak dapat dimasukkan ke membership sekolah. Tabel platform_admins terpisah dan tidak memberi hak baca akademik otomatis.

Admin/operator dapat membaca keanggotaan/peran dalam sekolahnya. Pembacaan profil user lain belum dibuka; endpoint administrasi terlingkup akan dibuat pada Tahap 2. Pengguna tidak dapat mengubah email_verified_at, must_change_password atau statusnya lewat SDK.

Kolom school_settings hanya untuk konfigurasi nonrahasia yang boleh dibaca anggota sekolah. Jangan menyimpan SMTP password, Supabase secret atau token di tabel tersebut.

## Berkas

Bucket privat memiliki plafon global 5.000.000 byte, tetapi belum ada policy Storage untuk user atau endpoint signed-upload. Batas gambar 3 MB dan audio/video <5 MB saat ini berupa fungsi kebijakan yang diuji; tahap unggahan wajib memvalidasi signature/MIME, ukuran aktual, pemilik serta akses kelas sebelum/selesai upload. Jangan menganggap bucket 5 MB otomatis menegakkan batas 3 MB gambar.

## Perlindungan web

Header nosniff, frame DENY, referrer policy dan permissions policy diterapkan. Respons ruang belajar dan health tidak di-cache. Belum ada form mutasi publik; CSRF/origin checks, pembatasan percobaan login dan deduplikasi email dibangun bersama endpoint pada Tahap 2. PWA/service worker belum dipasang sehingga tidak ada cache offline data pribadi.

## Pengujian database

Pengujian memakai PGlite (PostgreSQL tertanam), mengeksekusi SQL migrasi yang sama. Schema Auth dan Storage dibuat sebagai stub minimum agar migrasi dan RLS dapat diuji tanpa akun atau Docker. Ini bukan pengujian integrasi Supabase hosted: kesesuaian Auth sessions, SDK, PostgREST, bucket, API keys dan sesi nyata wajib diuji sesudah proyek terhubung. Jangan memakai stub pengujian untuk database produksi.
