# Panduan Konfigurasi Vercel–Supabase

## 1. Persiapan akun

Sediakan akun GitHub, Vercel dan Supabase. Integrasi Vercel/Supabase tersedia untuk dihubungkan dari percakapan, tetapi belum ada koneksi akun yang terkonfirmasi saat paket ini dibuat. Hubungkan akun untuk penerapan berbantuan; langkah manual berikut tetap disediakan sebagai panduan operator.

Tidak ada akun/proyek/domain yang dibuat dalam tahap lokal ini. Gunakan proyek Supabase baru khusus LMS. Tinjau kelayakan paket Vercel Hobby untuk penggunaan sekolah sebelum publikasi. Subdomain Vercel dapat dipakai untuk pengujian aplikasi; ini tidak otomatis menyediakan domain pengirim email.

## 2. Supabase

1. Buat proyek baru pada region yang sesuai pengguna Indonesia dan tersedia pada paket yang dipilih. Simpan password database di pengelola password.
2. Pada SQL Editor, jalankan isi `supabase/migrations/20261017152937_foundation.sql`, kemudian `20261017152957_private_storage.sql`, lalu `20261017153203_foundation_rls_indexes.sql`, dalam urutan tersebut.
3. Jalankan `supabase/seed.sql` pada proyek kosong untuk membuat profil MTs Nurul Falah. Seed tidak membuat pengguna atau tahun ajaran.
4. Kedua migrasi memakai transaksi masing-masing. Jika gagal, periksa hasil/migration history sebelum mencoba ulang; jangan menghapus tabel untuk memaksa ulang migrasi.
5. Bila menggunakan Supabase CLI, gunakan migration workflow sebagai pengganti SQL Editor. Jangan menerapkan migrasi yang sama melalui dua jalur tanpa mencocokkan riwayat. `supabase/config.toml` adalah konfigurasi pengembangan lokal; perubahan dashboard hosted tidak otomatis mengikuti file tersebut.
6. Pada Auth hosted, nonaktifkan pendaftaran mandiri. Jangan membuka sign-up hanya untuk menjalankan bootstrap; skrip memakai Admin API.
7. Pastikan Data API hanya mengekspos schema aplikasi yang dibutuhkan; `private` tidak boleh masuk exposed schemas.
8. Dapatkan URL proyek dan **publishable key** baru. Paket ini tidak menerima legacy anon JWT atau service-role JWT pada variabel publik. Simpan **secret key** baru hanya untuk server.
9. Bucket `lms-private` harus berstatus privat. Tidak ada kebijakan upload/download untuk pengguna pada Tahap 1; ini disengaja sampai kontrol per objek tersedia.

Migrasi fondasi berisi schools, profiles, roles, school_memberships, membership_roles, school_settings, academic_years, semesters, audit_logs, serta tabel privat email/platform. Kelas, pengampu, absensi, tugas dan kuis dibuat di tahap masing-masing.

## 3. Variabel lingkungan

| Variabel | Tempat | Keterangan |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Lokal dan Vercel | URL HTTPS proyek Supabase |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Lokal dan Vercel | Hanya key `sb_publishable_...` |
| SUPABASE_SECRET_KEY | Server lokal dan Vercel | Secret, tidak pernah menjadi variabel publik |
| APP_URL | Lokal dan Vercel | URL asal aplikasi; localhost saat pengembangan, HTTPS saat cloud |
| SMTP_HOST / SMTP_PORT | Server | Host dan port SMTP penyedia |
| SMTP_SECURE | Server | `true` untuk TLS langsung, misalnya 465; `false` untuk STARTTLS, misalnya 587 |
| SMTP_USER / SMTP_PASSWORD | Server | Credential pengirim, simpan sebagai secret |
| EMAIL_FROM | Server | Alamat pengirim yang telah diizinkan penyedia |
| BOOTSTRAP_USERNAME / BOOTSTRAP_FULL_NAME / BOOTSTRAP_SCHOOL_ID | Lokal saja | Identitas admin sekolah pertama dan UUID sekolah tujuan |

Nilai publik Supabase masuk ke hasil build; setelah mengubahnya, lakukan build/deploy ulang. Jangan mengandalkan nama variabel otomatis integrasi bila berbeda: cocokkan dengan tabel ini. `APP_URL` disiapkan untuk Tahap 2, belum digunakan untuk menciptakan tautan token di Tahap 1.

## 4. Email

Transport email mendukung SMTP dengan TLS wajib. Pilih penyedia yang menyediakan kuota gratis dan dapat mengirim ke alamat siswa/wali yang nyata. Periksa apakah penyedia memerlukan domain pengirim terverifikasi; pemilihan layanan dan verifikasi pengirim belum dilakukan. Tidak menganggap email bawaan Supabase cukup untuk operasional sekolah.

Jalankan `npm run check:services` setelah konfigurasi terisi. Keberhasilan SMTP verify hanya membuktikan koneksi/autentikasi, bukan reputasi pengirim, kuota maupun penerimaan email. Uji penerimaan ke alamat yang disetujui dilakukan pada Tahap 2 setelah endpoint token dan pembatasan pengiriman tersedia. Paket ini tidak mengirim email eksternal secara otomatis.

## 5. Admin pertama

Setelah migrasi, seed, dan konfigurasi Supabase siap, isi BOOTSTRAP_USERNAME, BOOTSTRAP_FULL_NAME dan BOOTSTRAP_SCHOOL_ID, kemudian:

```sh
npm run bootstrap:admin
```

Skrip membuat identitas internal unik pada domain `.invalid`, profil username, anggota sekolah dan peran admin sekolah. Password awal `12345678` hanya untuk aktivasi, tidak dicetak. Alamat internal tidak sama dengan email kontak wali dan tidak menerima email. Script Admin API mengonfirmasi identitas internal secara administratif; ini **bukan** verifikasi email kontak pengguna. Flag email_verified_at tetap kosong, must_change_password tetap true.

Jangan menggunakan bootstrap sebagai endpoint publik. Skrip menolak username yang sudah ada dan mencoba membersihkan identitas baru jika pembuatan profil/peran gagal. Jika pembersihan gagal, periksa konsistensi Auth dan profil sebelum mengulang. Skrip tidak membuat admin pusat, tidak mengaktifkan login, dan tidak melewati alur penggantian password/verifikasi pada Tahap 2.

## 6. Vercel

1. Masukkan kode ke repositori GitHub milik Bapak melalui proses yang Bapak pilih; belum ada push otomatis dari pengerjaan ini.
2. Import repositori ke Vercel sebagai Next.js. Root Directory harus menunjuk folder yang berisi package.json; bila hanya isi folder proyek yang diunggah, gunakan root repositori.
3. Gunakan Node.js 24, install `npm ci`, build `npm run build`; gunakan output standar Next.js, jangan dipaksa menjadi static export.
4. Hubungkan proyek Supabase melalui integrasi Vercel bila diinginkan, lalu periksa kembali nama dan jenis variabel. Integration tidak menggantikan migrasi, RLS atau konfigurasi Auth.
5. Isi environment variables untuk lingkungan yang benar. Preview jangan menggunakan data siswa produksi; gunakan proyek development terpisah bila tersedia dalam kuota akun.
6. Deploy, kemudian pastikan `/` dan `/masuk` terbuka, `/api/health` mengembalikan status ok, dan `/ruang-belajar` menolak sesi anonim.
7. Endpoint health hanya membuktikan proses aplikasi hidup. Lanjutkan `check:services` dengan konfigurasi lingkungan tujuan dan lakukan uji nyata Auth/Storage pada Tahap 2.

Jangan menggunakan deployment Tahap 1 untuk menerima password atau data siswa: form login sengaja belum tersedia. Status kesiapan baru lengkap setelah migrasi nyata, email nyata, sesi nyata dan deployment diuji.

## Referensi resmi

Diperiksa 17 Oktober 2026; periksa kembali bila konfigurasi penyedia berubah.

- Next.js: https://nextjs.org/docs/app/getting-started/installation
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Vercel Functions: https://vercel.com/docs/functions/limitations
- Vercel plans: https://vercel.com/docs/plans

## Status proyek hosted yang sudah dibuat

Proyek `lms-nurul-falah` sudah tersedia pada ref `slppnagegknxsjhfqthm`, region Singapura. Jangan membuat proyek kedua untuk mengulang konfigurasi. Ketiga migrasi di paket ini sudah diterapkan melalui MCP, dengan nama versi yang sama seperti riwayat cloud. Jangan jalankan seed development pada proyek ini karena profil sekolah sudah dibuat dengan UUID `dffb68f0-7a81-4047-bcf9-1870f1849112`. Gunakan UUID tersebut sebagai BOOTSTRAP_SCHOOL_ID. Seed dengan UUID tetap hanya untuk development baru.
