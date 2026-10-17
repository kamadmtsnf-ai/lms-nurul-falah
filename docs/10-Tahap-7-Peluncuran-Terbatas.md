# Tahap 7 — Peluncuran terbatas

Status: **persiapan tersedia; peluncuran siswa belum dimulai**. Cakupan mengikuti tabel tahap pada spesifikasi Tahap 0: migrasi data awal, aktivasi bertahap dan pendampingan. Ini bukan pernyataan bahwa seluruh kriteria Tahap 6 telah lulus.

## Pemeriksaan saat ini

Jalankan `node scripts/check-rollout.mjs`. Perintah membaca bukti Tahap 6, menulis `docs/verification/stage7-rollout.json`, dan mengembalikan kode 2 karena persiapan dokumen belum membuktikan kesiapan operasional. Perintah tidak membuat akun, mengirim email atau mengubah database. Bukti terbaru harus ditinjau operator; perubahan tulisan pada laporan tidak menggantikan pengujian.

| Kebutuhan | Status |
| --- | --- |
| Keutuhan jawaban dan finalisasi API | Lulus pada 60/100/132 sesi sintetis |
| Waktu simpan p95 di bawah 2 detik | Belum lulus; terburuk 23,22 detik pada 132 sesi |
| Browser laptop/ponsel dan jaringan terputus | Belum diverifikasi |
| Pemulihan cadangan produksi dan berkas privat | Belum dilakukan |
| Data awal madrasah untuk migrasi | Belum diberikan dalam pekerjaan ini |
| Pelaksanaan kelas percontohan | Belum dimulai |

## 1. Persiapan data oleh operator

Buka `/admin/akademik` untuk mengunduh template Excel yang disediakan aplikasi. Isi data nyata pada template tersebut, bukan mengubah format kolom atau mengirim password melalui chat. Gunakan saluran privat madrasah untuk pertukaran data siswa.

Urutan pengisian: kurikulum dan jenjang → tahun ajaran/semester → tingkat dan rombel → mata pelajaran → pengguna → pengampu dan anggota kelas → hubungan wali serta penugasan wali kelas/piket. Gunakan template dan form yang sesuai; periksa referensi sebelum menulis data turunannya. Jadwal piket berlaku selama semester dan dapat memuat satu atau beberapa hari per guru dalam satu pekan.

Pada setiap impor, baca pratinjau dan kesalahan sebelum konfirmasi. Cocokkan jumlah, username, tingkat/rombel dan peran dengan daftar sumber. Jangan menganggap total target 132 siswa/18 guru sebagai alasan membuat akun fiktif atau menggandakan akun yang sudah ada. Catat baris berhasil/gagal dan perbaiki hanya baris bermasalah. Jika hasil tidak sesuai, hentikan impor berikutnya; hindari penghapusan massal sebagai cara mengulang.

## 2. Pemeriksaan sebelum mengundang siswa

Selesaikan daftar penerimaan di [Tahap 6](09-Tahap-6-Kelayakan-Uji-Coba.md): login dan aktivasi melalui browser, akses antarkelas/antarwali, file privat, kuis dengan refresh/dua tab/jaringan terputus, tampilan ponsel, serta cadangan yang berhasil dipulihkan di lingkungan terpisah. Ulangi pengukuran latensi pada kondisi yang dicatat dan telusuri selisih waktu client dengan handler.

Catat tanggal, pelaksana, perangkat, versi aplikasi, tindakan, hasil yang diharapkan, hasil sebenarnya dan bukti tanpa token/password. Status yang belum diuji tetap belum diuji. Jangan mengaktifkan kelas percontohan hanya karena halaman health mengembalikan 200.

## 3. Aktivasi bertahap setelah pemeriksaan selesai

Mulai dengan operator dan guru pendamping, lalu satu kelompok kecil pada satu rombel yang telah ditetapkan madrasah. Tetapkan guru, daftar peserta dan jadwal sebelum mengundang. Tidak ada undangan atau email kegiatan yang dikirim otomatis oleh pekerjaan Tahap 7 ini.

Admin membagikan username melalui saluran sekolah. Password awal mengikuti pengaturan aplikasi; pengguna wajib mengganti password, login ulang, lalu memverifikasi email. Siswa tanpa email boleh memakai email wali; akun tetap terpisah walaupun email sama. Lakukan login sebelum jadwal kuis dan hindari login seluruh siswa serentak dari jaringan yang sama, mengingat pembatasan Auth yang telah teramati.

Guru mendampingi satu pertemuan lengkap: buka materi → catat absensi mata pelajaran → kumpulkan tugas → beri nilai → kerjakan kuis pendek → buka nilai/pembahasan secara sengaja → cocokkan laporan. Guru piket mencatat absensi harian secara terpisah; wali kelas memeriksa rekap. Akses orang tua pada kebutuhan penuh belum boleh dipresentasikan sebagai portal yang sudah selesai hanya karena relasi wali tersedia.

## 4. Penghentian dan pemulihan

Hentikan kegiatan bila jawaban yang telah diakui hilang, terjadi penilaian ganda, data lintas akun terlihat, atau simpan terus gagal/terlambat. Catat waktu, kelas, langkah kejadian dan indikator simpan; jangan meminta siswa mengirim password atau isi sesi. Guru menghentikan kuis baru dan menyiapkan pembelajaran pengganti.

Operator menjaga data yang sudah masuk dan menyelidiki sebelum melakukan rollback. Rollback kode tidak membatalkan perubahan database. Pemulihan data dilakukan dari cadangan yang telah diverifikasi pada target terpisah; tidak menimpa produksi otomatis. Reset password seluruh sekolah bukan prosedur pemulihan gangguan kuis.

## 5. Evaluasi dan perluasan

Setelah satu sesi didampingi, cocokkan daftar hadir, tugas, jumlah jawaban server, finalisasi tunggal, nilai dan laporan. Catat kendala guru/siswa dan waktu simpan. Perluasan kelas mengikuti hasil pemeriksaan nyata; keberhasilan API sintetis belum membuktikan kesiapan 132 siswa memakai perangkat asli.

Belum dikerjakan pada tahap ini: impor data nyata, aktivasi peserta nyata, sesi kelas pendampingan, persetujuan perluasan. Bahan yang diperlukan berikutnya adalah template Excel yang sudah terisi, pilihan rombel/guru pendamping, serta bukti pemeriksaan browser dan pemulihan yang masih terbuka.
