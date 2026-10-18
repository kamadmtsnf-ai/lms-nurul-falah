# Penguatan keamanan akun dan data siswa

Tanggal: 18 Oktober 2026. Stack tetap Next.js di Vercel + Supabase. Tidak ada paket berbayar atau akun nyata yang diubah untuk pengujian ini.

## Perubahan

| Area | Perilaku |
|---|---|
| Autentikator TOTP | `/keamanan` tersedia dari Ruang Akun dan Profil. Penyiapan memerlukan password saat ini, pemindaian QR/kunci manual, lalu kode 6 digit. Faktor belum aktif sebelum kode benar. Sangat disarankan bagi admin. |
| Login dua langkah | Akun yang sudah mengaktifkan TOTP diarahkan ke `/verifikasi-keamanan`. Sebelum AAL2, data aplikasi diblokir oleh guard halaman/API dan aturan database, bukan hanya navigasi UI. Profil dasar milik sendiri tetap dibaca untuk menjalankan challenge/aktivasi. |
| Database | `private.account_ready`, RPC akademik/pembelajaran/kuis/lanjutan/pengembangan, serta jalur akun/profil berbasis service memeriksa faktor terverifikasi dan sesi yang sesuai. RPC langsung membutuhkan klaim JWT AAL2 serta sesi Auth AAL2. |
| Sesi | Daftar sesi milik sendiri, perangkat saat ini, waktu pembuatan/pembaruan, tanpa mengekspos IP. Password wajib untuk mengakhiri sesi perangkat lain atau semua perangkat. Token lama kehilangan akses aplikasi setelah sesi dicabut. |
| NIK | Respons profil biasa tidak mengirim NIK lengkap; hanya penanda keberadaan dan empat digit terakhir. Membuka NIK memerlukan password, dicatat, ditutup setelah 60 detik, saat tab berubah/halaman tersembunyi, dan respons terlambat tidak membuka ulang NIK. |
| Edit identitas | Password saat ini wajib. Input NIK kosong mempertahankan nilai lama; penghapusan membutuhkan centang eksplisit. Batas 45 hari serta revision tetap berlaku. |
| Pembatasan percobaan | Semua pembuktian password berbagi satu kuota per akun (6/15 menit); jalur keamanan dan verifikasi kode memiliki pembatas tambahan. Tidak ada retry otomatis pada mutasi. |
| Audit | Riwayat 20 perubahan profil/keamanan akun sendiri. Audit tidak menyimpan password, kode, secret autentikator, atau nilai NIK lengkap. |
| Browser | Refresh cookie kini mencakup `/profil`, API profil, dan halaman/API keamanan. Ditambah HSTS dan CSP untuk frame ancestors/object/base/form; ini bukan CSP skrip ketat. |

Role, relasi wali–anak, filter siswa nonaktif, aturan arsip, aktivasi password/email, dan alur SMTP yang sudah ada dipertahankan. Password awal yang sebelumnya ditetapkan pengguna tidak diganti pada tahap ini; kewajiban mengganti password dan login ulang tetap berlaku. Penyiapan/kunci autentikator disimpan sementara di state komponen, bukan localStorage, sessionStorage, IndexedDB, log, atau cache service worker.

## Mengaktifkan autentikator

1. Login dan selesaikan aktivasi akun.
2. Buka **Ruang Akun → Autentikator & sesi**, atau **Profil → Akun & keamanan → Keamanan akun & sesi**.
3. Masukkan password saat ini, pilih **Siapkan autentikator**.
4. Pindai QR dengan aplikasi TOTP di perangkat pribadi. Bila perlu, masukkan kunci manual. Jangan membagikan QR/kunci atau menyimpannya di perangkat bersama.
5. Masukkan kode 6 digit lalu aktifkan. Login baru wajib melewati kode autentikator.
6. Penonaktifan memerlukan password dan kode terbaru dari faktor yang dipilih; seluruh sesi akan diakhiri. Bila ada faktor lain, faktor itu tetap aktif.

Aktivasi tidak dipaksakan untuk seluruh akun dan tidak dilakukan oleh agen atas nama pengguna. Gunakan fasilitas backup aman aplikasi autentikator pribadi; aplikasi LMS ini belum menerbitkan recovery code mandiri.

## Pemulihan kehilangan autentikator

Pemulihan password lewat email **tidak menghapus TOTP**. Pemulihan faktor hanya oleh operator teknis yang berwenang mengelola proyek Supabase, setelah verifikasi identitas melalui jalur sekolah yang sudah dikenal. Pengguna biasa/admin LMS tidak diberi secret key atau akses skrip ini.

Skrip `scripts/recover-mfa.mjs` memerlukan environment lokal:

- `NEXT_PUBLIC_SUPABASE_URL`: proyek yang benar.
- `SUPABASE_SECRET_KEY`: hanya pada lingkungan operator, jangan pernah dibagikan/browser/log/Git.
- `LMS_MFA_RECOVERY_USER_ID`: UUID pengguna yang identitasnya sudah diverifikasi.
- `LMS_MFA_RECOVERY_ACK=verified-offline-identity-and-authorized-reset`.

Jalankan `node --env-file=.env.local scripts/recover-mfa.mjs` hanya setelah semua pemeriksaan operator selesai. Skrip mencabut sesi dan operasi penggantian password/tautan pemulihan lama terlebih dahulu, mewajibkan ganti password, kemudian menghapus faktor TOTP melalui API admin native. Jika penghapusan gagal, selesaikan pemulihan; jangan membuka bypass login. Setelah berhasil, pengguna mengganti password, login ulang, dan memasang kembali autentikator. Skrip tidak dijalankan pada akun nyata dalam pekerjaan ini.

## Validasi dan batas cakupan

Migrasi cloud: `20261018113505_account_security_hardening.sql`. Hasil: 154 tes otomatis, 323 pemeriksaan UI, dan 21 skenario HTTP lulus; build produksi dan typecheck lulus. Hasil akhir dicatat di `VERIFICATION.json`. Tes database lokal menjalankan seluruh migrasi dan memakai identitas sintetis. Tes UI menjalankan komponen asli dengan API sintetis pada 320/390/768/1440 piksel; tes HTTP lokal memeriksa jalur anonim, CSRF, private/no-store dan header. Pemeriksaan cloud memastikan migrasi serta privilege fungsi sesuai. Pemindaian autentikator dan mutasi profil/login menggunakan akun produksi nyata tidak dijalankan.

Advisor Supabase masih menampilkan peringatan lama `auth_leaked_password_protection`. Fitur native tersebut memerlukan Pro atau lebih tinggi, sehingga tidak diaktifkan dan tidak ada upgrade paket. INFO RLS tanpa policy pada tabel deny-by-default tetap disengaja. TOTP tersedia tanpa SMS/layanan berbayar.

Referensi resmi: [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [penegakan MFA](https://supabase.com/docs/guides/auth/auth-mfa), [unenroll](https://supabase.com/docs/reference/javascript/auth-mfa-unenroll), [password security](https://supabase.com/docs/guides/auth/password-security).
