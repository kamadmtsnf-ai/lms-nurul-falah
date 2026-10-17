# Tahap 8 — Modul cakupan penuh

Status implementasi: modul lanjutan telah dibuat dan diuji secara otomatis. **Penerimaan operasional seluruh kebutuhan belum dinyatakan lulus.** Kendala latensi, browser/perangkat privat, pemulihan cadangan dan pelaksanaan kelas pada Tahap 6–7 tetap tercatat terbuka.

## Fitur dan lokasi

| Modul | Cara membuka | Perilaku |
| --- | --- | --- |
| Jenis soal lengkap | Pembelajaran → Kuis → Tambah/ubah kuis | PG, PG kompleks, benar/salah, setuju/tidak setuju, menjodohkan, isian singkat, esai |
| Bank dan impor soal | Pembelajaran → Lanjutan → Bank soal | Form soal, template Excel, pratinjau impor, konfirmasi simpan, hapus soal; tambahkan soal bank ke kuis melalui editor |
| Pengacakan/pengulangan | Pengaturan kuis | Acak soal/opsi dan 1–5 kesempatan; default satu kesempatan dan pengacakan mati |
| Koreksi esai | Laporan → Buka percobaan siswa | Guru menilai setiap esai; total menunggu semua esai dikoreksi, termasuk jawaban kosong yang perlu diberi 0 |
| Perpindahan tab | Pengaturan kuis | Opsional, default mati; catatan tab tersembunyi dibaca pengampu, bukan bukti otomatis kecurangan |
| Prasyarat dan progres | Lanjutan → Materi & diskusi | Guru mengaktifkan prasyarat; siswa menandai materi selesai; backend memblokir isi dan lampiran yang terkunci |
| Berbagi materi | Lanjutan → Materi & diskusi | Tindakan eksplisit ke kelas setingkat pada semester sama yang dikelola pengampu; salinan draf beserta lampiran privat |
| Diskusi | Lanjutan → Materi & diskusi → Buka diskusi | Tanggapan teks dan moderasi guru; wali hanya membaca kiriman anak tertaut dan guru |
| Kelompok, rubrik, revisi | Lanjutan → Tugas lanjutan | Aturan tugas, kelompok, pengumpulan bersama, koreksi rubrik dan toleransi keterlambatan |
| Nilai berbobot | Lanjutan → Nilai akhir berbobot | Tab Nilai Tugas & Kuis serta Nilai Akhir Berbobot, bobot dan rilis guru, Excel/PDF |
| Dashboard/portal wali | Ruang akun → Pemantauan & notifikasi | Kelas sesuai peran, ringkasan aktivitas, absensi pertemuan, tugas tertunda, nilai dan beberapa anak tertaut |
| Notifikasi kegiatan | Lanjutan → Notifikasi kegiatan | Notifikasi dalam aplikasi; pilihan antrean email dan pengiriman manual per batch |
| Retensi alumni | Ruang akun → Retensi alumni (admin) | Kalender masa simpan, bukti ekspor, penonaktifan sesi, penghapusan berkas/data/Auth setelah konfirmasi |

## Kuis dan bank soal

PG kompleks menggunakan penilaian seluruh kunci harus tepat, tanpa poin parsial. Menjodohkan juga seluruh pasangan harus tepat. Isian singkat mendukung beberapa jawaban yang diterima; huruf besar/kecil dan spasi tepi diabaikan. Esai dikoreksi guru dengan skor tidak melebihi poin soal dan pemeriksaan revisi untuk mencegah penimpaan nilai. Penilaian admin memerlukan alasan dan dicatat di audit.

Setiap percobaan memiliki snapshot soal, urutan dan kunci sendiri. Pengacakan opsi berlaku pada PG dan PG kompleks; opsi benar/salah, setuju/tidak setuju dan pasangan tetap dalam struktur yang jelas. Mengubah bank tidak mengubah snapshot kuis. Soal/jadwal kuis yang sudah dimulai tetap terkunci. Gunakan kuis baru untuk mengganti isi.

Tombol Mulai/lanjutkan membuka percobaan terakhir. Tombol Ulangi membuat kesempatan berikutnya setelah percobaan sebelumnya selesai; seluruh percobaan tetap tercatat. Jika response mulai ulang terputus, gunakan Mulai/lanjutkan untuk membuka percobaan yang sudah dibuat. Batas waktu mengikuti server dan tidak diperpanjang melewati waktu tutup. Nilai/pembahasan tetap dibuka guru secara terpisah; pembahasan siswa hanya tersedia sesudah waktu tutup.

Template bank berisi lembar Soal dan Petunjuk. Impor maksimal 2 MB dan 100 soal; batas ini khusus impor, berbeda dari unggahan dokumen pembelajaran 5 MB. Kolom opsi/kunci/pasangan memakai format array JSON sesuai petunjuk template. Nomor opsi mulai 0. Hapus baris contoh sebelum impor. Formula, struktur Excel yang rusak dan arsip dekompresi berlebihan ditolak. Pratinjau tidak menyimpan soal sampai guru mengonfirmasi.

Catatan perpindahan tab memakai Page Visibility API dan waktu penerimaan server. Catatan ini dapat tidak terkirim saat jaringan terputus atau halaman ditutup; tidak mengunci perangkat, kamera atau aplikasi lain dan tidak otomatis mengurangi nilai.

## Materi, kelompok dan rubrik

Prasyarat hanya aktif setelah guru memilih materi pendahulu dan mengaktifkannya. Siklus dan referensi kelas lain ditolak. Penanda selesai menyatakan siswa telah menandai materi, bukan bukti otomatis pemahaman. Parent/guru peninjau dapat membaca materi yang tersedia pada kelas yang berhak diakses; isi siswa lain tetap mengikuti izin masing-masing.

Berbagi materi membuat draf baru, tidak menerbitkannya otomatis. Lampiran privat disalin melalui Storage dengan metadata/izin baru. Bila penyalinan sebagian gagal, draf tetap terlihat dan API memberi pesan untuk memeriksa kelas tujuan sebelum mengulang. Fitur ini belum diuji roundtrip Storage hosted pada tahap ini.

Aturan tugas harus disimpan sebelum pengumpulan pertama. Maksimal kiriman mencakup kiriman pertama dan revisi berikutnya. Toleransi menit hanya berlaku jika guru juga mengizinkan keterlambatan di pengaturan tugas; 0 berarti mengikuti izin tugas tanpa batas waktu tambahan. Mode kelompok memblokir pengumpulan individu melalui API.

Satu siswa hanya boleh berada pada satu kelompok per tugas. Guru dapat mengubah kelompok sebelum pengumpulan pertama; keanggotaan dikunci setelahnya. Satu kiriman kelompok membuat versi untuk setiap anggota aktif secara atomik. Satu penilaian kelompok diterapkan kepada anggota pada versi terbaru. Revisi membuat nilai versi sebelumnya tidak lagi digunakan.

Total poin kriteria rubrik harus sama dengan skor maksimum tugas. Saat rubrik digunakan, server menolak penilaian tanpa skor tiap kriteria, skor di luar batas dan jumlah yang berbeda dari total. Muat kiriman/versi nilai sebelum mengoreksi lagi. Umpan balik dan total mengikuti pembukaan nilai tugas.

## Nilai dan pemantauan

Nilai kuis pada perhitungan lanjutan menggunakan nilai terbaik per kuis, lalu dirata-ratakan; tugas menggunakan nilai versi terbaru pada skala 100. Bobot tugas + kuis harus 100%. Nilai akhir tidak diberikan ketika komponen berbobot belum dinilai, komponen wajib belum lengkap, atau akses nilai belum dibuka. Nilai kosong dibedakan dari nol. Guru/reviewer dapat meninjau nilai sesuai kewenangannya; siswa/wali tetap mengikuti rilis.

Dashboard mengikuti kelas dan halaman siswa yang dipilih, bukan agregat seluruh sekolah yang tidak dibatasi halaman. Portal mendukung beberapa anak per wali dan beberapa wali per anak sesuai tautan admin. Kepala sekolah melihat kelas dalam sekolahnya; guru, wali kelas dan siswa mengikuti penugasan/keanggotaan. Admin pusat tidak otomatis diberi akses akademik. Absensi harian tetap terpisah dan dapat dilihat melalui halaman rekap yang sudah tersedia.

Ekspor berbobot menggunakan data berizin dari server. PDF memakai font Latin; nama di luar jangkauan font menghasilkan pesan untuk menggunakan Excel. PDF contoh 132 siswa diperiksa pada halaman pertama/terakhir; ini bukan penerimaan seluruh perangkat atau seluruh nama nyata.

## Notifikasi dan email

Guru membuat pesan kegiatan untuk siswa aktif dalam rombel. Pesan masuk ke notifikasi aplikasi; centang pilihan email untuk mengantrekan penerima dengan email terverifikasi. Pengiriman memakai SMTP yang sudah dikonfigurasi, tanpa secret baru di frontend.

Tombol Kirim batch email memproses maksimal tiga penerima menunggu. Klaim antrean bersifat eksklusif untuk mencegah dua worker mengirim penerima yang sama. Email tidak dikirim otomatis setelah pesan dibuat. Tidak ada cron atau pengiriman kegiatan nyata yang dijalankan dalam pekerjaan ini.

Jika SMTP gagal atau penerimaan tidak pasti, status tidak dikirim ulang otomatis. Operator harus memeriksa status pengiriman. Worker yang terputus setelah klaim dapat meninggalkan status sedang diproses; periksa log SMTP sebelum memutuskan tindakan pemulihan agar tidak terjadi duplikasi. Kuota pengiriman tetap mengikuti penyedia SMTP.

## Retensi alumni

Admin memilih siswa dan tahun pelajaran kelulusan. Masa simpan dihitung dari tanggal akhir tahun pelajaran berikutnya yang benar-benar tersedia dalam kalender; tidak memakai perkiraan 365 hari. Tahun berikutnya harus dibuat dahulu.

Setelah masa simpan berakhir, admin mengekspor data dan mencatat referensi ekspor. Konfirmasi SIAPKAN PENGHAPUSAN menonaktifkan keanggotaan dan menghapus sesi siswa. Akun yang juga mempunyai peran lain, akses platform, atau sekolah lain ditolak dan memerlukan pemeriksaan operator.

Konfirmasi HAPUS DATA ALUMNI menghapus objek Storage milik siswa, jawaban/nilai/absensi/relasi pribadi dan data aktif, kemudian menghapus akun Auth. Akun wali dan data anak lain tidak ikut dihapus. Bila Storage gagal, data aktif tidak dipurge dan akun tetap nonaktif. Bila pembersihan data berhasil tetapi penghapusan Auth gagal, gunakan Selesaikan penghapusan akun Auth setelah operator memeriksa penyebab.

Catatan retensi minimal tetap menyimpan UUID tak bernama, kalender, status dan pelaksana; referensi ekspor dibersihkan ketika purge. Karya kelompok yang juga merupakan kiriman anggota lain tetap menjadi data anggota tersebut; lampiran yang dimiliki alumni dihapus. Salinan cadangan/provider audit log mengikuti siklus retensi masing-masing, tidak terhapus otomatis ketika data aktif dibersihkan. Tidak ada alumni nyata yang dihapus dalam tahap ini.

## Bukti pengujian dan batas penerimaan

- 106 tes otomatis lulus, termasuk 14 tes/subtes baru modul lanjutan.
- TypeScript, build produksi dan 14 kelompok pemeriksaan HTTP lokal lulus.
- Empat migrasi baru diterapkan; seluruh 19 migrasi lokal cocok dengan riwayat Supabase.
- Integrasi PostgreSQL Supabase diuji dengan empat identitas sintetis dan klaim database dalam transaksi rollback; bukan login HTTP/SDK. Hasil: lulus, 0 sekolah dan 0 profil sintetis tertinggal.
- Advisor tidak melaporkan error. Ada peringatan lama leaked password protection dan informasi tabel tanpa policy yang memang ditutup akses langsungnya serta indeks belum digunakan. [Penjelasan perlindungan password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS tanpa policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Browser berhasil membuka halaman publik; alur privat guru/siswa/wali/admin dan perangkat nyata belum diuji setelah fitur baru. Beban hosted Tahap 8, jaringan putus nyata, roundtrip salin/hapus Storage, email kegiatan nyata, dan pemulihan produksi belum dinyatakan lulus.

Lihat [laporan verifikasi Tahap 8](verification/stage8-results.json). Pekerjaan ini mengimplementasikan modul Tahap 8, tetapi belum memenuhi syarat bahwa seluruh kebutuhan penuh telah lolos pengujian penerimaan operasional. Jangan menafsirkan keberhasilan build sebagai izin penggunaan massal; hasil Tahap 6 dan kesiapan Tahap 7 tetap berlaku.
