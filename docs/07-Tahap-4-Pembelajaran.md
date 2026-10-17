# Tahap 4 — Pembelajaran

Implementasi 18 Oktober 2026 (Asia/Jakarta). Melanjutkan master akademik, aktivasi akun dan jadwal piket mingguan yang sudah tersedia.

## Halaman dan navigasi

- Ruang akun → Kelas & semester → pilih mata pelajaran → `/pembelajaran/[id]`.
- Empat tab: **Materi**, **Pertemuan & absensi**, **Tugas**, **Nilai tugas**.
- Ruang akun → **Absensi harian sekolah** → `/absensi-harian`; dua tab absensi dan rekap harian.
- Guru mengelola mata pelajaran yang diampu. Admin dapat mengelola secara administratif. Kepala sekolah dan wali kelas membaca lingkup yang sah; siswa membaca/menjawab di kelasnya; wali hanya ringkasan anak yang tertaut.
- Mata pelajaran, pertemuan, materi dan tugas lama tetap tersedia sebagai arsip baca-saja ketika semester ditutup.

Halaman memuat maksimal 20 materi, 20 pertemuan dan 20 tugas per halaman. Gunakan Sebelumnya/Berikutnya untuk data lama. Rekap pertemuan mengikuti halaman pertemuan yang sedang dimuat; rekap harian merangkum catatan kelas yang tersimpan. Jawaban lengkap dibuka saat guru memilih kiriman untuk menghindari payload semua jawaban sekaligus. Riwayat versi dipaginasi 20 versi dan menyediakan navigasi versi lebih lama/baru.

## Menjalankan satu pertemuan

1. Pastikan admin sudah membuat semester, rombel, siswa dan pengampu. Akun guru/siswa harus selesai aktivasi.
2. Guru membuka mata pelajaran, tab Pertemuan & absensi → Tambah pertemuan. Isi topik dan waktu sesuai semester.
3. Tab Materi → Tambah materi. Pilih pertemuan, tulis isi, tautan sumber/video, dan status publikasi.
4. Simpan materi dahulu, lalu tambahkan lampiran bila diperlukan. Materi dapat berupa teks, lampiran atau tautan. Link video dibuka pada sumbernya; izin Google Drive/penyedia tetap berlaku.
5. Setelah pertemuan dimulai, guru memilih pertemuan lalu mencatat Hadir/Sakit/Izin/Alpa. Tandai semua hadir hanya mengisi form; tetap klik Simpan.
6. Jika ada siswa baru setelah pertemuan dibuat, klik Tambahkan siswa baru ke daftar. Daftar pertemuan menyimpan snapshot siswa, sehingga riwayat tidak hilang saat pindah kelas.
7. Tab Tugas → Tambah tugas, isi petunjuk, tenggat, skor maksimum dan satu/beberapa cara pengumpulan: teks, berkas atau tautan.
8. Siswa membuka tugas yang terbit, mengisi jawaban sesuai pilihan guru dan klik Kumpulkan. Lampiran harus selesai diunggah/diverifikasi serta dipilih sebelum ikut terkirim.
9. Guru membuka Pengumpulan & koreksi → Buka jawaban & penilaian, memeriksa versi terbaru dan menyimpan nilai/umpan balik.
10. Guru klik Buka nilai untuk siswa pada tugas tersebut. Sebelum itu, siswa dan wali tidak memperoleh skor/umpan balik dari API.

Publikasi memiliki Draf, Terjadwal, Terbit dan Arsip. Status terjadwal dibuka berdasarkan waktu server, tanpa bergantung cron. Isi teks ditampilkan sebagai teks biasa, bukan HTML yang dijalankan. Tautan harus HTTPS.

Tenggat ditentukan waktu server. Pengaturan Terima kiriman setelah tenggat tidak aktif secara bawaan; jika diaktifkan, kiriman terlambat diterima dengan label Terlambat. Revisi membuat versi immutable baru dan tidak membawa nilai versi sebelumnya ke jawaban baru. Skor maksimum dan cara pengumpulan yang sudah dipakai kiriman tidak dapat ditimpa; buat tugas baru bila aturannya berbeda.

Pengiriman memakai ID permintaan dan revisi. Pengulangan permintaan yang sama tidak membuat versi ganda; revisi basi dari tab lain ditolak. Guru hanya dapat menilai versi terbaru. Nilai nol dibedakan dari belum dinilai dan belum mengumpulkan. Tab nilai menampilkan skor mentah dan normalisasi skala 100; belum ada perhitungan nilai akhir berbobot.

Admin yang bukan pengampu wajib mengisi alasan penilaian minimal lima karakter. Koreksi nilai dicatat dengan skor sebelumnya, skor baru, aktor dan alasan. Guru pengampu tetap penanggung jawab penilaian.

## Absensi harian dan rekap

Absensi harian berbeda tabel dan sumber dari absensi pertemuan; keduanya tidak saling mengisi atau menimpa.

- Guru Piket memilih rombel dan tanggal sekolah dalam WIB. Pencatatan hanya pada hari ini, cocok dengan hari jadwal mingguan, penugasan aktif dan semester aktif.
- Admin dapat mencatat/koreksi tanggal lalu dalam semester aktif dengan alasan. Tidak menerima tanggal masa depan.
- Wali kelas, guru dan kepala sekolah membaca sesuai lingkupnya. Piket membaca tanggal yang sesuai penugasan, termasuk riwayat semester terkait.
- Satu siswa hanya mempunyai satu catatan harian per tanggal sekolah dan satu catatan per pertemuan. Catatan harian di rombel lain tidak ditimpa diam-diam.
- Belum dicatat selalu berbeda dari Alpa. Tombol Tandai semua hadir tidak menyimpan otomatis.
- Perubahan absensi wajib alasan minimal lima karakter dan dicatat audit. Revisi yang berubah dari tab lain ditolak.
- Rekap harian maksimal 366 hari, hanya menghitung catatan tersimpan dan tanggal yang berhak dibaca. Rekap pertemuan/harian pada mata pelajaran ditampilkan terpisah.

## Berkas privat

Batas desimal: gambar ≤3.000.000 byte, dokumen ≤5.000.000 byte, audio/video <5.000.000 byte. Audio/video 5 MB atau lebih memakai tautan HTTPS. Format: JPG/JPEG, PNG, WebP; PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX; MP3, M4A, OGG, WAV; MP4, WebM.

Alur: backend memeriksa akun, kelas/objek tujuan, peran, tipe dan ukuran → membuat tiket unggahan dengan path acak → browser PUT langsung ke private Supabase Storage → backend mengunduh untuk memeriksa ukuran aktual, ekstensi dan signature → bukti pemeriksaan server dipakai untuk menyelesaikan status ready.

Signed upload berlaku dua jam sesuai Supabase. Upsert tidak diperbolehkan. Browser tidak mendapat service secret. User tidak mempunyai policy baca/tulis langsung `storage.objects`, sehingga tidak dapat melewati tiket lewat SDK user. Berkas pending tidak dapat diunduh. Berkas kiriman siswa hanya dibaca pemilik dan pengampu/admin setelah ikut pada suatu versi kiriman; unggahan draf siswa tidak diperlihatkan kepada guru.

Unduhan membutuhkan pemeriksaan objek ulang lalu signed URL berumur 120 detik. URL yang telah terbit tetap dapat dipakai sampai kedaluwarsa; jangan membagikannya kepada pihak lain. Signature memeriksa identitas format, bukan antivirus penuh atau validasi seluruh isi dokumen.

Tiket pending kedaluwarsa milik pengguna dibersihkan saat unggahan berikutnya. Kegagalan pemeriksaan membatalkan tiket dan mencoba membersihkan objek. Kegagalan provider atau tab ditutup dapat meninggalkan objek untuk pemeriksaan operator; ini bukan mekanisme retensi alumni. Berkas versi terkumpul dipertahankan agar riwayat tidak rusak. Belum ada UI hapus lampiran/kuota per sekolah pada tahap ini; pantau Storage dan gunakan tautan untuk media besar.

## Keamanan dan verifikasi

- Seluruh tabel domain baru memakai RLS dengan akses langsung user/anon dicabut. Data diakses melalui RPC `learning_command`, dengan wrapper publik SECURITY INVOKER dan dispatcher/helper di schema private.
- Dispatcher memeriksa akun aktif, aktivasi, sesi hidup, keanggotaan dan penugasan terbaru di database. Scope tiap peran tidak saling memperluas izin menulis.
- Jawaban siswa lain tidak diberikan kepada siswa/wali/wali kelas. Kepala sekolah/wali kelas membaca rekap, bukan jawaban mentah. Guru Piket tidak mendapat nilai dari peran piket.
- Semua POST memeriksa Origin, jenis/ukuran body, schema, UUID dan batas frekuensi. Respons privat tidak di-cache. Token dan isi jawaban tidak ditulis ke log.
- **75 tes otomatis lulus**, termasuk alur guru–siswa, versi/idempotensi, deadline, tab basi, publikasi terjadwal, privasi nilai, alasan admin, absensi ganda, jadwal piket, berkas pending/attestation/owner, signature, arsip dan pagination.
- TypeScript, build produksi dan **10 kelompok smoke test HTTP lokal** lulus, termasuk pengalihan anonim dan CSRF pembelajaran.
- Validasi hosted dalam transaksi rollback lulus untuk pertemuan → materi → absensi → tugas → kiriman → ulang kirim → penilaian → buka nilai. Peran sementara, kelas dan isi uji tidak dipertahankan.
- Storage provider unggah/unduh berkas nyata dan interaksi browser akun guru/siswa belum diuji otomatis. Jangan menyamakan stub Storage lokal dengan bukti putaran file hosted.
- Advisors tidak memberi ERROR baru. INFO RLS tanpa policy disengaja pada tabel yang ditutup untuk akses langsung; seluruh akses harus lewat RPC berizin. WARN proteksi password bocor sudah ada sebelum tahap ini; pengaturan Auth tidak diubah. Indeks FK baru tercakup.

Migrasi hosted: `20261017192300_learning_foundation`, `20261017193910_learning_read`, `20261017194327_learning_uploads`, `20261017194359_learning_mutations`.

## Cakupan berikutnya

Tahap 5: kuis PG/benar-salah, autosave, batas waktu/finalisasi, hasil dan laporan/ekspor V1. Tugas kelompok, rubrik, kebijakan revisi rinci, berbagi materi setingkat, prasyarat/progres, nilai berbobot, notifikasi kegiatan dan portal orang tua penuh tetap mengikuti tahap lanjutan pada spesifikasi. PWA/offline serta uji beban 60–132 sesi belum dinyatakan selesai oleh tahap pembelajaran ini.
