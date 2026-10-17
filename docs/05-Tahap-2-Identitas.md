# Tahap 2 — Identitas dan Akses

Tanggal pengerjaan: 17 Oktober 2026 (Asia/Jakarta). Target produksi: proyek Vercel lms-nurul-falah, repositori kamadmtsnf-ai/lms-nurul-falah, Supabase slppnagegknxsjhfqthm.

## Fitur

- Login hanya dengan username/password. Pesan kegagalan umum; tidak ada registrasi mandiri di antarmuka.
- Akun default/baru wajib mengganti password. Password minimal 8 karakter, maksimal 128, tidak boleh sama dengan password awal, harus dikonfirmasi dan berbeda dari password saat ini.
- Saat mengganti password, aplikasi memeriksa password saat ini, memblokir sesi terlebih dahulu, memperbarui password melalui Auth Admin API, mencabut sesi dan mengakhiri cookie. Wajib login ulang sebelum langkah verifikasi email.
- Email wali dapat sama pada beberapa akun; verifikasi tetap terikat akun dan alamat email masing-masing.
- Token email acak 256-bit, masa berlaku 15 menit, sekali pakai. Hanya hash SHA-256 disimpan. Token pada fragment URL menghindari masuknya token ke request URL server; fragment dibersihkan di browser setelah dibaca.
- Tautan verifikasi memerlukan akun yang sesuai tetap login. Setelah login, pengguna dapat membuka kembali tautan email bila perlu.
- Pemulihan dimulai dari username dan dikirim hanya ke email terverifikasi. Respons tidak mengungkap ada/tidaknya akun. Pemulihan menutup sesi lama dan wajib login ulang.
- Admin sekolah dapat membuat pengguna lewat form, memberi beberapa peran, mengganti peran dan menonaktifkan akun dalam sekolahnya. Admin pusat tidak dapat diberikan melalui form sekolah. Admin terakhir yang aktif dan terverifikasi dilindungi.
- Daftar pengguna dipaginasi 50 baris. Perubahan admin dicatat pada audit. Impor Excel dan template belum termasuk tahap ini; mengikuti Tahap 3.
- Bootstrap admin pertama dilindungi kode server dan lease database. Pendaftaran awal dikunci permanen setelah admin pertama tersedia.

## Kontrol server

RPC public.identity_command hanya dapat dipanggil service_role. Implementasi SECURITY DEFINER berada di schema private, search_path kosong, tidak menggunakan user_metadata. Endpoint memeriksa identitas melalui getUser, claims terverifikasi, RLS profil dan status sesi yang mutakhir; token dari getSession hanya digunakan untuk mengirim permintaan signOut setelah identitas terbukti.

Semua POST memeriksa Origin, jenis JSON, ukuran body dan schema input. Percobaan login dibatasi per username dan jaringan melalui counter PostgreSQL atomik yang berlaku lintas instance Vercel. Halaman, API dan cookie sensitif tidak di-cache. Cookie sesi HttpOnly dan Secure di produksi.

Perubahan password memakai lock nonce berumur lima menit. Jika provider gagal setelah sesi diblokir, akses akademik tetap tertutup. Pengguna dapat login ulang dan mencoba lagi setelah lock berakhir atau menggunakan pemulihan. Tidak mengaktifkan akun hanya karena password provider berubah sebagian.

Sesi lama ditolak RLS berdasarkan auth.sessions dan credentials_changed_at meskipun JWT belum kedaluwarsa. Jangan mengubah flag aktivasi secara manual untuk mengatasi gangguan SMTP.

## Email

Isi SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD dan EMAIL_FROM pada environment production Vercel. APP_URL harus https://lms-nurul-falah.vercel.app. Simpan password SMTP langsung sebagai secret di Vercel.

Layanan email belum disediakan saat implementasi ini. Pengiriman nyata, verifikasi melalui inbox dan pemulihan ujung ke ujung belum dapat dinyatakan berhasil. Tanpa konfigurasi, endpoint menampilkan pesan layanan belum tersedia dan tidak menandai akun terverifikasi.

Pengiriman verifikasi dijalankan langsung dan dicatat pada outbox. Pemulihan memakai after() agar respons akun ada/tidak ada seragam; kiriman gagal membatalkan token. Outbox menyimpan status dan ID token, bukan token mentah. Tidak ada retry otomatis untuk token mentah yang tidak disimpan; pengguna meminta tautan baru bila gagal.

## Pengujian

- 35 pengujian otomatis lulus: migrasi PostgreSQL, RLS, counter atomik, bootstrap sekali pakai, email wali bersama, token salah akun/kedaluwarsa/terpakai/gagal kirim, penolakan admin pusat dan admin terakhir, serta urutan pemutusan sesi.
- Build produksi dan TypeScript lulus.
- Tujuh kelompok smoke test HTTP lulus: beranda/header, login, liveness, ruang privat, 404, seluruh halaman akun privat, dan CSRF lintas situs.
- Pengujian database lokal memakai Auth/Storage stub pada PostgreSQL tertanam. Tidak menyamakan hasil tersebut dengan uji email atau sesi hosted nyata.
- Migrasi hosted 20261017163436_identity_workflows diterapkan. SQL hosted mengonfirmasi anon/authenticated tidak mendapat hak menjalankan RPC identitas; service_role mendapat hak. Seluruh tabel aplikasi/privat memakai RLS.
- Advisors keamanan hanya melaporkan INFO untuk tabel private tanpa policy; ini disengaja untuk menolak akses user. Referensi: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Batas rilis

Halaman akademik, pembelajaran dan PWA belum termasuk. Pendaftaran mandiri hosted perlu tetap dinonaktifkan pada pengaturan Auth; aplikasi tidak menyediakan sign-up dan tidak memberi akses database kepada Auth user tanpa profil/keanggotaan. Akun admin baru tetap wajib menjalani seluruh aktivasi, termasuk verifikasi email nyata.

## Deployment dan source

Deployment produksi Tahap 2: dpl_4GZ3iFpt5EBGudFPoT35W6Smu7Vc, berstatus READY. URL aplikasi tetap https://lms-nurul-falah.vercel.app. Aplikasi diterapkan langsung melalui Vercel API dari source yang sudah diuji.

Penulisan source ke GitHub ditolak integrasi dengan 403 Resource not accessible by integration. Branch main tetap pada b8d7baeabd69ea9a067cb5fd83fbe638c1ad9e00. Source repositori perlu diselaraskan menggunakan patch Tahap 2 sebelum push Git berikutnya agar deployment otomatis tidak mengembalikan versi lama.

Akun admin pertama telah dibuat dengan username admin. Password awal mengikuti keputusan pengguna, dan must_change_password=true serta email_verified_at=null tetap dipertahankan. Penyiapan database sudah dikunci, dan LMS_SETUP_TOKEN di konfigurasi deployment berikutnya dikosongkan. Pengujian tidak mengganti password admin atau memverifikasi email secara manual.

## Pembaruan 18 Oktober 2026

Akses tulis GitHub telah berhasil pada percobaan ulang. Source Tahap 2 disinkronkan ke branch main tanpa mengubah alur aktivasi atau database. Catatan penolakan 403 dan patch di atas merupakan riwayat percobaan sebelumnya. Deployment Git berikutnya memakai konfigurasi LMS_SETUP_TOKEN kosong; bootstrap tetap terkunci oleh database. SMTP nyata tetap belum dikonfigurasi.
