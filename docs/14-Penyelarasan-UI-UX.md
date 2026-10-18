# Penyelarasan UI/UX seluruh halaman

18 Oktober 2026 · LMS Nurul Falah

## Sistem desain

Identitas hijau zamrud dipertahankan, dengan latar abu kehijauan, permukaan putih, aksen emas yang terbatas, border lembut, dan bayangan tipis. Font menggunakan font sistem tanpa unduhan font eksternal. Tipografi dan jarak membedakan label konteks, judul halaman, deskripsi, judul bagian, isi, serta bantuan.

| Bagian | Pola bersama |
| --- | --- |
| Identitas | `Brand`: lambang pendidikan, nama aplikasi, subjudul madrasah |
| Area akun | `AppShell`: identitas, keluar, navigasi aktif, konten, footer |
| Judul | `PageHeading`: konteks → judul → deskripsi → tindakan opsional |
| Dashboard | `WorkspaceDashboard`: sambutan, peran, ajakan membuka kelas, pembelajaran, administrasi, keamanan |
| Konten | Permukaan kartu, judul bagian, ikon kontekstual, tabel bergulir lokal |
| Form | Border dan fokus konsisten, isian nonaktif jelas, ukuran sentuh nyaman |
| Tab | Tampilan terpilih yang sama, tetap mendukung keyboard dan gulir lokal |
| Autentikasi | Panel identitas desktop, kartu form, identitas ringkas mobile, bantuan akun |
| Password | Tombol tampil/sembunyikan per isian, nama isian dan payload tetap sama |
| Kuis | Header fokus, penanda waktu, opsi jawaban terpilih, tanpa navigasi global tambahan |
| Kondisi khusus | Halaman 404/error memakai komponen status yang sama; indikator proses form tetap terlihat |
| Offline | Identitas dan judul baru; versi cache public shell diperbarui tanpa memaksa reload saat kuis berlangsung |

## Cakupan

Seluruh 19 halaman memakai pola sesuai fungsinya: beranda, enam halaman aktivasi/autentikasi, ruang akun, akademik, administrasi pengguna/akademik/retensi, absensi, pembelajaran, laporan, pemantauan, pengembangan, kuis, serta offline. Halaman error/404 ikut diselaraskan.

Navigasi akun mempunyai tiga tujuan tetap: Ruang akun, Kelas & semester, dan Pemantauan. Area administrasi diberi konteks breadcrumb. Dashboard hanya menampilkan modul sesuai peran; Sekolah Aktif tetap hanya tersedia untuk admin pada ruang-belajar.

## Kompatibilitas

Tidak ada perubahan pada API, skema database, rumus nilai, validasi server, atau izin akses. Dashboard baru tidak menampilkan angka progres/statistik yang belum diperoleh dari data. Komponen server tetap menjalankan autentikasi dan pemilihan keanggotaan sebelum menampilkan halaman. Indikator loading tidak ditempatkan pada boundary global yang dapat mengubah redirect privat menjadi respons streaming 200; redirect anonim tetap diuji sebagai 307.

## Pemeriksaan

- TypeScript dan build produksi.
- 120 tes otomatis dan 17 kelompok HTTP, termasuk redirect privat dan perlindungan API.
- Pemeriksaan browser komponen asli dengan data/API simulasi pada 320, 390, 768, dan 1440 px, serta resize landscape.
- Data kosong, 132 siswa, teks panjang, tabel, form, tab, impor, draf offline, dan kondisi error.
- Pemeriksaan tambahan: visibilitas password, navigasi aktif, serta menu administrasi/Sekolah Aktif yang tidak muncul untuk siswa.
- Tangkapan layar dashboard dan autentikasi desktop/mobile ditinjau secara visual sebelum penerapan.

Hasil run terakhir tersedia di `docs/verification/ui-audit-results.json`. Pengujian komponen simulasi tidak menggantikan acceptance memakai akun nyata seluruh peran, Safari/iOS, atau pengujian kapasitas kuis serentak.
