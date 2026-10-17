# Tahap 5 — Kuis dan laporan V1

## Penggunaan guru

1. Buka **Akademik → mata pelajaran → tab Kuis → Tambah kuis**.
2. Isi judul, petunjuk, waktu buka/tutup dan durasi 1–240 menit. Waktu input mengikuti zona waktu perangkat; tampilan informasi menggunakan WIB. Jadwal harus berada dalam semester kelas.
3. Tambahkan 1–100 soal pilihan ganda (2–6 opsi) atau benar/salah. Pilih satu kunci per soal, bobot poin dan pembahasan opsional. Simpan sebagai draf atau terbitkan.
4. Soal, jadwal, judul dan petunjuk terkunci setelah siswa pertama memulai. Buat kuis baru untuk perubahan setelah itu. Snapshot setiap percobaan menyimpan soal, opsi, kunci dan bobot asli.
5. Pantau melalui tab **Laporan → Hasil kuis**. Pengampu/admin dapat membuka rincian jawaban; kepala sekolah/wali kelas mendapat ringkasan nilai sesuai kelasnya.
6. Centang **Buka nilai**, lalu **Simpan akses hasil** ketika nilai boleh dilihat. Pembahasan memerlukan nilai dibuka dan waktu tutup kuis sudah lewat. Akses dapat ditutup kembali. Perubahan akses menggunakan pemeriksaan versi agar tidak menimpa perubahan pengelola lain.

Admin dapat mengelola kuis di sekolahnya. Pengampu hanya kelas penugasannya. Guru Piket tidak mendapat akses kuis/penilaian hanya karena peran piket. Semester arsip mempertahankan akses baca, menghentikan pembuatan/perubahan dan percobaan baru.

## Penggunaan siswa

1. Buka tab **Kuis → Mulai / lanjutkan kuis** ketika jadwal sudah dibuka. V1 menyediakan **satu percobaan**, dan tombol berulang melanjutkan percobaan yang sama.
2. Waktu berakhir adalah yang lebih awal antara waktu tutup kuis dan waktu mulai + durasi. Waktu server menentukan penerimaan jawaban.
3. Pilih jawaban. Autosave berkala menggabungkan perubahan, memberi ID permintaan dan nomor revisi, lalu memperlihatkan status tersimpan/menunggu. **Simpan sekarang** mempercepat penyimpanan.
4. Jika koneksi putus, biarkan halaman terbuka. Antrean dalam memori dicoba kembali dengan jeda bertambah dan variasi acak. Halaman tidak menyatakan tersimpan sebelum server mengonfirmasi. Tidak ada penyimpanan jawaban di localStorage/perangkat bersama.
5. Hindari membuka percobaan di beberapa perangkat. Konflik revisi menghentikan penyimpanan dan meminta memuat ulang jawaban server; konfirmasi memperingatkan bahwa pilihan lokal belum tersimpan akan diganti. Halaman juga memperingatkan saat ditutup dengan jawaban tertunda.
6. **Selesaikan kuis** menyimpan antrean terlebih dahulu, lalu mengunci jawaban. Permintaan finalisasi berulang tidak menghasilkan penilaian ganda.
7. Saat waktu habis, hanya jawaban yang telah diterima server dinilai. Percobaan yang ditinggalkan difinalisasi saat dibuka kembali atau masuk laporan; belum ada proses Cron per detik. Jawaban setelah deadline tidak diterima.
8. Jawaban salah/kosong bernilai 0. Nilai 0–100 = poin didapat / seluruh bobot poin × 100. Nilai dan pembahasan mengikuti akses guru. Siswa dapat membuka hasil lewat laporan meski semester telah menjadi arsip.

Antrean koneksi terbatas belum bertahan jika tab/perangkat ditutup atau aplikasi dimuat ulang. Ini bukan pengerjaan kuis penuh secara offline. Uji browser dan gangguan jaringan nyata masih perlu dilakukan pada Tahap 6.

## Laporan dan ekspor

Tab **Laporan** tersedia di kelas dan pada `/laporan/<id-kelas-mapel>`, dengan tabulasi:

- **Ringkasan siswa**: hadir / absensi pertemuan yang dicatat, jumlah tugas masuk, tugas lewat tenggat yang belum masuk, rata-rata nilai tugas dan kuis yang dapat dilihat.
- **Hasil kuis**: status, mulai, tenggat, selesai, skor maksimum dan skor yang berhak dilihat. Rincian jawaban tersedia hanya kepada pemilik/pengampu/admin.
- **Aktivitas pengampu**: jumlah pertemuan, materi, tugas dan kuis yang dibuat pada kelas ini; bukan durasi kerja atau ukuran kualitas mengajar. Tersedia untuk staf berwenang.

Laporan berhalaman 100 siswa. Ekspor mengambil semua halaman, dengan batas pengaman 5.000 siswa per kelas. Excel memiliki lembar ringkasan, hasil kuis dan keterangan; PDF berupa tabel berhalaman dengan judul dan nomor halaman. Keduanya memakai pemeriksaan sesi dan akses database yang sama. Sel teks Excel ditulis sebagai string, bukan formula.

PDF V1 memakai font standar untuk huruf Latin (termasuk bahasa Indonesia). Jika nama/isi memuat karakter yang tidak didukung font, API mengembalikan pesan agar menggunakan Excel; tidak mengganti atau menghilangkan nama secara diam-diam. Excel mempertahankan Unicode.

Rata-rata bukan nilai akhir berbobot tugas/kuis. Nilai yang belum dinilai/dibuka tampil kosong, bukan 0. Absensi belum dicatat bukan alpa. Progres membaca materi belum dilacak sehingga tidak ditampilkan sebagai persentase palsu. Rekap absensi harian sekolah tetap terpisah pada halaman absensi harian.

Siswa hanya melihat hasil sendiri. Orang tua hanya anak yang ditautkan admin, dan hanya nilai yang telah dibuka guru. Kepala sekolah, admin, wali kelas dan pengampu mengikuti cakupan kelasnya. Tidak ada email, kunci soal atau jawaban mentah dalam ekspor laporan.

## Implementasi dan validasi

- Dua tabel publik kuis/percobaan serta tiga tabel private untuk soal, snapshot dan jawaban. Seluruhnya RLS aktif; akses tabel langsung pengguna ditutup. RPC mengulangi pemeriksaan sesi hidup, aktivasi, keanggotaan dan peran nyata.
- Kunci dan pembahasan tidak dikirim pada percobaan berjalan. Snapshot selesai hanya mengungkap kunci kepada pengampu/admin atau siswa setelah syarat rilis terpenuhi. Orang tua/wali kelas tidak dapat meminta jawaban siswa melalui ID percobaan.
- Penyimpanan satu batch atomik: revisi lama, nomor ganda atau pilihan tidak valid ditolak. ID permintaan sama dan isi sama dapat diulang tanpa penambahan revisi. Perubahan sesudah selesai tidak diterapkan.
- Lock database selalu dalam urutan kuis → percobaan. Ini menghindari balapan mulai/edit/finalisasi; kapasitas kuis 132 siswa bersamaan belum diuji.
- 86 pengujian otomatis meliputi hak akses, kunci tersembunyi, snapshot, retry, konflik, batch atomik, deadline, finalisasi, rilis, arsip, Excel literal dan PDF berhalaman. Typecheck, build dan 12 kelompok pemeriksaan HTTP lokal lulus.
- Alur snapshot → autosave berulang → finalisasi berulang → koreksi → laporan juga diuji pada database hosted dalam transaksi yang seluruhnya di-rollback. Pemeriksaan ini memakai konteks admin/pengampu sementara di dalam transaksi, bukan pengujian login browser siswa.
- Advisor tidak menemukan ERROR keamanan/performa. INFO RLS tanpa policy memang diperlukan karena tabel ini hanya diakses melalui RPC berizin; INFO indeks belum dipakai wajar untuk fitur baru. Peringatan leaked-password protection yang sudah ada belum diubah.
- Belum mengklaim lolos uji browser guru/siswa, koneksi putus nyata atau beban 60–132 pengguna. Tahap 6 mencakup pengujian tersebut.

Fitur kuis lanjutan (PG kompleks, setuju/tidak setuju, menjodohkan, isian, esai, bank/impor/pengacakan soal, percobaan ulang dan catatan perpindahan tab) tetap pada tahap pengembangan lanjutan yang disepakati.
