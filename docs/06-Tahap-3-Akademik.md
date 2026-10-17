# Tahap 3 — Akademik

Implementasi 18 Oktober 2026 (Asia/Jakarta). Stack tetap Next.js/Vercel dan Supabase. Pengguna mengonfirmasi aktivasi dan email berhasil sebelum tahap ini dimulai. Uji SMTP/inbox tidak diulang pada tahap akademik.

## Halaman

- `/admin/akademik`: pusat akademik khusus admin sekolah, dapat dibuka dari Ruang Akun.
- `/akademik`: daftar kelas sesuai keanggotaan, penugasan, atau anak tertaut; mencakup arsip.
- `/admin/pengguna`: pembuatan akun/peran sebelumnya, dengan tautan menuju template dan impor.

Pusat akademik menyediakan pengaturan nama, jenjang dan tautan logo HTTPS; tahun ajaran; semester; versi kurikulum; tingkat; rombel; mapel; kode guru; nomor induk siswa; guru pengampu; anggota kelas; wali kelas; guru piket; penautan orang tua; template dan impor Excel. Logo tautan ditampilkan di pusat akademik. Unggahan berkas logo melalui Storage mengikuti tahap penyimpanan/pembelajaran berikutnya.

Navigasi di samping pada laptop dan dapat digeser mendatar pada ponsel. Form, pencarian, filter semester, pesan hasil, status proses, daftar, dan tombol ubah tersedia. Data arsip ditandai baca-saja. Pengelolaan berkas pembelajaran, materi, absensi, tugas dan kuis tidak diaktifkan pada tahap ini.

## Urutan konfigurasi admin

1. Lengkapi identitas sekolah. Buat akun atau impor akun melalui jenis Pengguna. Atur beberapa peran bila diperlukan; Wali Kelas dan Guru Piket adalah peran terpisah.
2. Buat tahun ajaran dengan tanggal kalender nyata, lalu aktifkan tahun yang berlaku.
3. Buat semester Ganjil/Genap. Tanggal harus berada dalam tahun ajaran dan tidak bertumpang tindih. Aktifkan satu semester.
4. Buat kurikulum dan versi, tingkat (MTs: 7, 8, 9), serta mapel dengan kode unik.
5. Buat rombel per semester (mis. 7A). Rombel semester baru dibuat sebagai data baru.
6. Lengkapi identitas guru/siswa, lalu tautkan anggota kelas. Satu rombel aktif per siswa per semester.
7. Tugaskan pengampu (satu guru per mapel per rombel), wali kelas, dan guru piket beserta rentang tanggalnya.
8. Tautkan username orang tua dan siswa. Satu wali dapat mempunyai beberapa anak; satu anak dapat mempunyai beberapa wali.

Guru/piket/wali kelas harus memiliki peran yang sesuai sebelum dipilih. Penugasan dan tautan wali dapat dinonaktifkan tanpa dihapus. Izin membaca diperiksa kembali dari database, sehingga tautan yang nonaktif langsung menutup akses anak tersebut melalui peran wali.

## Semester dan arsip

Mengaktifkan semester lain mengarsipkan semester aktif sebelumnya secara atomik. Mengaktifkan tahun baru mengarsipkan tahun aktif sebelumnya beserta seluruh semesternya. Anggota kelas tidak dipindah dan tidak dihapus. Form memberi penjelasan dampak pengalihan periode.

Admin dapat membuka semester arsip ke Draf dengan alasan minimal lima karakter; tindakan tercatat audit. Tahun arsip harus dibuka terlebih dahulu sebelum membuka semesternya. Mutasi rombel, pengampu, wali kelas dan anggota semester arsip ditolak di database. Kurikulum yang sudah digunakan tidak dapat ditimpa: buat versi baru.

Form menyertakan waktu perubahan terakhir. Jika data sudah berubah di tab lain, penyimpanan ditolak dan admin harus memuat ulang. Perpindahan siswa dilakukan dengan menonaktifkan keanggotaan lama lalu menambahkan keanggotaan baru; riwayat lama tetap ada.

## Excel

Ada tujuh template `.xlsx`, masing-masing berisi sheet Data dan Petunjuk:

| Jenis | Isi / prasyarat |
| --- | --- |
| Pengguna | username, name, roles, email; email boleh kosong/berulang; beberapa roles dipisahkan koma |
| Identitas guru | username yang sudah memiliki peran teacher, staff_code |
| Siswa dan anggota kelas | username student, student_number, year, semester, classroom yang sudah tersedia |
| Kelas/rombel | year, semester, grade (nomor tingkat), name |
| Mata pelajaran | code, name |
| Guru pengampu | username teacher, year, semester, classroom, subject (kode), curriculum (nama), version |
| Tautan wali | guardian (username), student (username), relationship |

Akun dibuat lebih dahulu. Template guru/siswa melengkapi akun yang sudah dibuat, bukan membuat akun ganda. Password awal ditentukan server; tidak ada kolom password. Seluruh akun baru tetap wajib aktivasi seperti Tahap 2.

Batas berkas impor **2 MB** agar unggahan melalui backend Vercel tetap kecil; ini khusus impor dan tidak mengganti batas berkas materi. Maksimal 25 akun per impor pengguna, 250 baris untuk jenis lain. Untuk 132 siswa, impor akun dalam beberapa berkas (mis. 25 akun per berkas), lalu impor identitas/kelasnya dalam satu atau beberapa berkas.

Isi sheet Data mulai baris 2. Header/urutan kolom tetap. Username, kode dan nomor induk memakai format teks untuk mempertahankan nol awal; angka otomatis pada kolom tersebut ditolak. Semester dan tingkat menerima angka bulat. Formula, macro, workbook eksternal, arsip terenkripsi dan ukuran dekompresi berlebihan ditolak. Jangan sisakan baris kosong di antara data.

Pratinjau memeriksa format, duplikasi, peran dan referensi. Bila ada kesalahan, tidak ada data akademik yang disimpan; unduh laporan kesalahan CSV, perbaiki lalu unggah kembali. Jika valid, konfirmasikan sebelum Simpan. Pratinjau terikat admin dan sekolah, berlaku 30 menit, dan diperiksa ulang saat commit. Impor hanya menambah data baru; pembaruan dilakukan lewat form. Klik ulang commit yang sudah berhasil mengembalikan hasil sebelumnya tanpa menambah data.

Impor akademik dijalankan dalam transaksi PostgreSQL. Impor akun melibatkan Supabase Auth di luar transaksi: lease mencegah dua proses berjalan; profil/keanggotaan/peran disimpan atomik setelah identitas Auth dibuat. Pada kegagalan normal, identitas Auth baru yang belum mempunyai profil dibersihkan. Bila proses Vercel terhenti mendadak atau pembersihan provider gagal, identitas Auth yatim mungkin memerlukan pemeriksaan operator; identitas tanpa profil tidak mendapat akses LMS. Jangan mengulang otomatis dengan mengaktifkan akun atau melewati aktivasi.

## Keamanan dan verifikasi

- RPC `academic_command` menggunakan identitas/sesi JWT yang terverifikasi, memeriksa aktivasi dan admin sekolah di database. Tidak menerima actor/role dari browser.
- Wrapper publik SECURITY INVOKER; implementasi istimewa di schema private dengan search_path kosong. Helper mutasi tidak dapat dijalankan authenticated/anon.
- Setiap tabel publik baru memakai RLS dan grants read-only untuk user; penulisan melalui dispatcher berizin dan audit. Relasi komposit menolak referensi lintas sekolah.
- Cakupan tiap peran diperiksa terpisah. Contoh: peran Guru Piket tidak memperluas akses mata pelajaran dari peran Orang Tua pada akun yang sama.
- API memeriksa Origin, aktivasi, sekolah, schema dan batas ukuran/frekuensi. File impor diproses di server. Cookie dan respons privat tidak di-cache.
- Data staging yang kedaluwarsa lebih dari satu hari dibersihkan pada pratinjau berikutnya; setelah commit hanya jumlah hasil dipertahankan, isi baris staging dihapus.
- 56 tes otomatis lulus, termasuk integritas, arsip, impor atomik/idempoten, lease akun, aktivasi, RLS guru/siswa/wali, beberapa peran, nol awal dan formula Excel.
- TypeScript dan build produksi lulus; sembilan kelompok smoke test HTTP lokal lulus.
- Validasi hosted memakai sesi admin aktif dalam transaksi rollback: master, pratinjau, commit, duplikasi dan idempotensi. Tidak ada kelas uji tertinggal.
- Browser interaktif admin dan impor akun melalui Auth hosted belum diuji otomatis. Jalur tersebut memakai SDK yang sudah digunakan oleh form akun Tahap 2; pengujian transaksi profil/role dilakukan lokal.
- Advisors: tidak ada ERROR keamanan. INFO private tanpa policy disengaja untuk menolak akses langsung. WARN proteksi password bocor sudah ada sebelumnya dan pengaturan Auth tidak diubah. INFO indeks FK baru telah diperbaiki; indeks yang belum dipakai wajar pada modul baru.

Migrasi hosted: `20261017174710_academic_management` dan `20261017174825_academic_foreign_key_indexes`.

Tahap berikutnya: **Tahap 4 — Pembelajaran** (materi, penyimpanan privat, absensi pertemuan/harian, tugas, pengumpulan dan penilaian).
