# Status Cloud — 17 Oktober 2026

## Supabase: sudah diterapkan

- Organisasi: kamadmtsnf@gmail.com's Org.
- Proyek: lms-nurul-falah.
- Project ref: slppnagegknxsjhfqthm.
- Region: ap-southeast-1 (Singapura).
- Status pembuatan: ACTIVE_HEALTHY.
- Kutipan biaya pembuatan: US$0/bulan. Ini hasil pengecekan saat pembuatan, bukan jaminan kuota atau harga tidak berubah.
- Dashboard: https://supabase.com/dashboard/project/slppnagegknxsjhfqthm
- Profil sekolah: MTs Nurul Falah, UUID dffb68f0-7a81-4047-bcf9-1870f1849112.

Ketiga migrasi telah diterapkan dan versi file lokal diselaraskan dengan riwayat hosted:

1. 20261017152937_foundation.sql
2. 20261017152957_private_storage.sql
3. 20261017153203_foundation_rls_indexes.sql

Jangan menerapkan ulang migrasi atau seed development pada proyek hosted ini. Revisi foundation_status tetap bernilai 202610170001 sebagai marker kompatibilitas aplikasi, bukan nomor migrasi hosted.

## Verifikasi nyata

- 12 tabel domain/privat tersedia; tidak ada tabel tersebut yang belum mengaktifkan RLS.
- Bucket lms-private tersedia, public=false, plafon 5.000.000 byte.
- Role anon tidak memiliki hak membaca profiles.
- Role authenticated tidak memiliki hak mengubah profiles.
- Uji role authenticated tanpa sesi: tidak membaca profil/sekolah; perubahan flag password ditolak. Uji dijalankan dalam transaksi yang di-rollback tanpa data uji tertinggal.
- Riwayat ketiga migrasi telah dibaca kembali.
- Supabase advisors tidak melaporkan WARN/ERROR keamanan pada pemeriksaan ini. Ada INFO untuk tiga tabel private tanpa policy: ini disengaja untuk menolak seluruh akses user; grants user juga dicabut.
- Tiga indeks foreign key dan tiga policy dengan auth.uid() per baris telah diperbaiki. Advisors performa berikutnya hanya melaporkan INFO indeks belum digunakan pada proyek baru; indeks tetap dipertahankan untuk relasi dan beban mendatang.

Referensi advisori: [RLS tanpa policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [indeks belum digunakan](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Pengujian lokal setelah sinkronisasi migrasi dan penyesuaian skrip bootstrap: 21 test lulus, 0 gagal; TypeScript lulus. Build produksi dan lima smoke test HTTP tetap merupakan hasil fondasi sebelumnya; tidak ada perubahan kode halaman/runtime dalam pembaruan cloud ini.

## Vercel: terhambat izin

Akses baca berhasil pada tim kamadmtsnf-8533's projects (slug kamadmtsnf-8533). Belum ada proyek bernama lms-nurul-falah pada tim tersebut. Pembuatan proyek Next.js ditolak API dengan 403 Forbidden: akun/koneksi tidak memiliki izin membuat proyek. Tidak ada proyek atau deployment yang berhasil dibuat. CLI Vercel dengan autentikasi mandiri tidak tersedia untuk fallback.

Tidak mencoba tim lain, endpoint alternatif untuk melewati izin, atau perubahan paket berbayar. Pengguna perlu membuat proyek pada tim tujuan melalui dashboard dengan akun yang memiliki kewenangan, atau menyesuaikan izin akun/integrasi untuk pembuatan proyek. Setelah proyek tersedia, sambungkan environment dan lanjutkan deployment kode yang sama.

## Belum selesai

- Konfigurasi environment Supabase pada Vercel dan pembuktian koneksi aplikasi–database lewat SDK/PostgREST.
- Pengaturan Auth hosted (termasuk sign-up mandiri) belum dapat diubah/dikonfirmasi melalui alat yang tersedia. Jangan membuka penggunaan siswa sebelum pengaturannya diperiksa.
- SMTP, pengirim terverifikasi dan pengiriman ke penerima nyata.
- Akun admin pertama dan sesi login nyata. Tidak membuat user tanpa identitas admin yang ditetapkan.
- Prototipe aktivasi/password/email pada Tahap 2.
- Integrasi Marketplace Vercel–Supabase belum dilakukan; tersedianya kedua akun tidak otomatis menghubungkan kedua proyek.

Kesimpulan status: fondasi database cloud siap untuk pengembangan. Tahap 1 secara keseluruhan masih belum selesai karena Vercel dan email nyata belum siap. Tidak ada secret key atau credential SMTP di dalam paket source.
