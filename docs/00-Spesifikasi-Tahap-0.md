# Spesifikasi dan Rencana Implementasi LMS Nurul Falah

Versi: 1.0 • Tanggal: 17 Oktober 2026 • Zona waktu: Asia/Jakarta

Dokumen ini menetapkan kebutuhan yang disepakati, usulan desain teknis, matriks akses, rancangan logis database, dan urutan implementasi. Ini merupakan hasil tahap perencanaan; belum ada aplikasi, database, akun layanan, atau deployment yang dibuat. Rancangan tabel belum berupa migrasi SQL siap produksi.

## 1. Sasaran dan batas pengembangan

LMS untuk satu madrasah, awalnya MTs/SMP, dengan jenjang dapat diubah melalui pengaturan. Identitas sekolah dan struktur data disiapkan untuk pengembangan beberapa sekolah tanpa mengaktifkan pengelolaan banyak sekolah pada versi pertama.

Pengguna awal: 132 siswa dan 18 guru. Akun operator, kepala sekolah, wali, dan admin pusat menambah total akun. Sasaran pengujian kuis: 60 hingga 132 siswa bersamaan. Angka ini merupakan target validasi, bukan kapasitas yang sudah terbukti.

Frontend dan backend aplikasi ditempatkan di Vercel; database PostgreSQL dan penyimpanan berkas di Supabase. Tidak menggunakan spreadsheet eksternal untuk autentikasi, tidak terintegrasi dengan SIM-GURU, dan tidak ada pendaftaran akun mandiri.

Target 19 Oktober 2026 adalah uji coba operasional terbatas setelah pemeriksaan kelayakan. Semua fitur lanjutan tetap masuk cakupan, tetapi tidak dijanjikan selesai dalam dua hari. Semua layanan ditargetkan menggunakan paket gratis; kelayakan paket, kapasitas, dan pengiriman email harus diperiksa sebelum penggunaan nyata.

## 2. Keputusan kebutuhan

- Peran: admin pusat, admin/operator, kepala sekolah, guru, wali kelas, guru piket, siswa, orang tua/wali.
- Satu pengguna dapat memiliki beberapa peran. Penugasan peran dilakukan admin dan dibatasi lingkup sekolah/kelas/mata pelajaran.
- Akun dibuat melalui form atau impor Excel dengan template, pratinjau, validasi, dan laporan kesalahan.
- Username dan password berlaku khusus LMS. Password awal adalah `12345678`; password tidak disimpan dalam teks biasa.
- Password wajib diganti, dilanjutkan logout dan login ulang, kemudian verifikasi email sebelum akses fitur.
- Siswa boleh menggunakan email wali. Email yang sama boleh dipakai oleh beberapa akun; username tetap unik.
- Tahun ajaran, semester, tingkat, rombel, mata pelajaran, kurikulum, guru pengampu, dan keanggotaan kelas dikelola admin.
- Awalnya satu guru per mata pelajaran per kelas; pengaturan tim pengajar dapat diaktifkan pada pengembangan berikutnya.
- Riwayat akademik tetap tersedia ketika semester berganti atau siswa naik kelas.
- Tidak ada modul ujian terpisah. Istilah antarmuka menggunakan “Kuis”.
- Orang tua hanya mengakses anak yang ditautkan admin. Relasi wali–siswa bersifat banyak-ke-banyak.

## 3. Cakupan rilis

| Modul | V1: uji coba inti | Lanjutan, tetap wajib dalam cakupan penuh |
| --- | --- | --- |
| Identitas dan akun | Login, aktivasi, pemulihan password, form/impor pengguna, beberapa peran | Penyempurnaan administrasi lintas sekolah |
| Akademik | Tahun ajaran, semester, kelas, pengampu, anggota kelas, pengaturan jenjang/kurikulum | Tim pengajar yang dapat diaktifkan |
| Materi | Topik/pertemuan, teks, lampiran, tautan media, jadwal publikasi | Berbagi setingkat, prasyarat, progres lengkap, diskusi |
| Absensi | Absensi pertemuan oleh guru dan absensi harian oleh guru piket; rekap wali kelas | Analisis tren dan laporan lanjutan |
| Tugas | Format pengumpulan pilihan guru, tenggat, kiriman, nilai, umpan balik | Kelompok, revisi terstruktur, rubrik, toleransi rinci |
| Kuis | PG, benar/salah, batas waktu, autosave, kirim final, koreksi otomatis, buka nilai oleh guru | Seluruh jenis soal, bank/impor soal, pengacakan, pengulangan, pencatatan perpindahan tab |
| Nilai | Tab Nilai Tugas & Kuis | Tab Nilai Akhir Berbobot beserta perhitungan lengkap |
| Pemantauan | Rekap guru/admin dan wali kelas | Dashboard kepala sekolah serta portal orang tua |
| Ekspor | Excel rekap; PDF laporan terpilih | Ekspor seluruh laporan yang relevan |
| Notifikasi | Dalam aplikasi; email verifikasi dan pemulihan | Email kegiatan, kanal WhatsApp/Telegram di masa depan |
| PWA | Dapat dipasang, halaman offline informatif | Materi tersimpan dan sinkronisasi draf saat koneksi pulih |

Semua peran dimodelkan sejak V1, tetapi halaman lanjutan tidak ditampilkan seolah sudah berfungsi. Guru Piket beserta absensi harian dimasukkan ke V1 karena merupakan kebutuhan operasional yang disepakati terakhir. Tab nilai berbobot baru diaktifkan ketika perhitungan selesai dan lolos validasi.

## 4. Matriks hak akses target

Keterangan: K = kelola; B = baca; S = data sendiri; T = lingkup penugasan; A = anak tertaut; — = tidak diberikan. Kewenangan mengikuti gabungan peran yang sah; memilih peran aktif hanya menyederhanakan tampilan dan tidak memperluas akses.

| Fitur | Pusat | Admin | Kepala | Guru | Wali kelas | Piket | Siswa | Orang tua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Identitas sekolah | K | K | B | B | B | B | B | B |
| Akun/peran | K* | K** | — | — | — | — | S profil | S profil |
| Akademik/pengampu | K* | K | B | B:T | B:T | B | B:S | B:A |
| Materi/tugas/kuis | — | K administratif | B | K:T | B:T | — | B/kerjakan:S | Ringkasan:A |
| Absensi pertemuan | — | K | B | K:T | B:T | — | B:S | B:A |
| Absensi harian | — | K | B | B:T | B:T | K:T | B:S | B:A |
| Nilai dan koreksi | — | K*** | B | K:T | B:T | — | B:S**** | B:A**** |
| Laporan/ekspor | Operasional* | K | B sekolah | B:T | B:T | B absensi harian | B:S | B:A |
| Penautan wali | — | K | B | — | B:T | — | — | — |
| Retensi/penghapusan | Kebijakan* | K | B | — | — | — | — | — |
| Audit aktivitas | Operasional* | B sekolah | B ringkasan | — | — | — | — | — |

* Admin pusat mengatur infrastruktur/sekolah, bukan otomatis membaca semua nilai atau identitas siswa. Akses akademik memerlukan penugasan eksplisit di sekolah tersebut.

** Admin sekolah tidak dapat memberikan peran admin pusat. Pengangkatan admin pusat dilakukan melalui prosedur pengelola sistem.

*** Admin mengoreksi nilai hanya melalui tindakan khusus dengan alasan dan audit; guru pengampu tetap penanggung jawab penilaian.

**** Nilai/pembahasan hanya dapat dibaca setelah dibuka guru. Jawaban siswa lain dan kunci kuis aktif tidak dapat diakses.

Guru memerlukan akses identitas minimum dan nilai siswa pada kelas yang diajarnya. Guru piket hanya memperoleh data minimum untuk absensi, tidak memperoleh nilai melalui peran piket. Ini melengkapi daftar pembaca data yang ditetapkan pengguna sesuai kebutuhan fungsi mengajar.

## 5. Alur autentikasi dan aktivasi

### 5.1 Status akun

`wajib_ganti_password → wajib_login_ulang → wajib_verifikasi_email → aktif`.

Akun nonaktif selalu ditolak. Reset ke password awal mengembalikan status wajib ganti password. Akses logout, bantuan aktivasi, dan pemulihan tetap tersedia sesuai keadaan; halaman akademik, API, database, dan berkas privat diblokir selama aktivasi belum lengkap.

### 5.2 Desain identitas yang diusulkan

Gunakan Supabase Auth untuk penyimpanan password dan sesi. Masing-masing akun memakai identitas autentikasi internal unik berbasis UUID, tidak menggunakan alamat email wali sebagai identitas Auth. Username dipetakan ke identitas tersebut melalui endpoint server yang membatasi percobaan login dan memberikan pesan kegagalan umum. Identitas internal tidak ditampilkan kepada pengguna dan tidak menerima email.

Email kontak disimpan terpisah pada profil, dapat berulang antar akun. Verifikasi email dan pemulihan memakai alur aplikasi sendiri yang mengirim email melalui penyedia email transaksional. Jangan memakai alur pemulihan standar Auth yang akan mengirim ke alamat internal. Implementasi pendekatan ini wajib dibuktikan lewat prototipe autentikasi sebelum modul lain dibangun.

Token aktivasi/pemulihan acak disimpan sebagai hash, terikat pada akun, alamat tujuan dan tujuan token; sekali pakai, memiliki waktu kedaluwarsa, serta dibatasi frekuensi kirim/coba. Mengganti email membatalkan status verifikasi dan token lama. Bukti kepemilikan satu email tidak otomatis memverifikasi akun lain yang memakai email sama.

Pemulihan dimulai dari username. Sistem memberikan respons umum tanpa membocorkan keberadaan akun, lalu mengirim tautan ke email terverifikasi akun itu. Setelah reset, sesi lama dicabut dan pengguna wajib login lagi. Password baru minimal delapan karakter dan tidak boleh sama dengan password awal. Admin tidak dapat melihat password baru.

Penanda wajib ganti password/email terverifikasi tidak boleh dapat diedit pengguna. Pencabutan sesi dan pemeriksaan status dilakukan juga di server/database, bukan hanya pengalihan halaman; token lama tidak boleh mempertahankan akses melalui metadata yang kedaluwarsa.

## 6. Aturan fungsional antarmodul

### Akademik dan arsip

Keanggotaan kelas selalu terikat semester. Kenaikan kelas membuat keanggotaan baru tanpa memindahkan atau menimpa nilai lama. Semester yang ditutup menjadi arsip baca; pembukaan koreksi khusus admin tercatat audit. Kurikulum disimpan sebagai pengaturan/versi yang dirujuk periode, sehingga perubahan pengaturan tidak mengubah interpretasi arsip.

### Materi

Guru membuat materi pada kelas mata pelajaran yang diampu. Publikasi memiliki status draf, terjadwal, terbit, arsip. Jadwal diperiksa berdasarkan waktu server sehingga tidak bergantung pada cron tepat detik. Berbagi hanya atas tindakan guru dan hanya ke tingkat yang sama serta kelas yang berhak dikelola; dibuat salinan dengan referensi sumber. Perubahan sumber tidak otomatis menimpa salinan.

Prasyarat nonaktif secara bawaan. Saat diaktifkan, guru menentukan materi pendahulu dan definisi selesai: ditandai selesai, tugas dikirim, atau nilai kuis minimum. Sistem menolak siklus prasyarat. Forum dan progres tersedia pada tahap lanjutan.

### Absensi

Status: hadir, sakit, izin, alpa. Belum dicatat bukan alpa. Absensi harian dan pertemuan berbeda sumber dan tidak saling menimpa. Ketidakhadiran harian dapat tampil sebagai informasi bagi guru. Satu siswa hanya memiliki satu catatan harian per tanggal sekolah dan satu catatan per pertemuan. Perubahan mencatat aktor, waktu, alasan, dan nilai sebelumnya.

### Tugas

Guru memilih satu atau beberapa cara pengumpulan: teks, berkas, tautan. Tenggat memakai waktu server. Pada fitur lanjutan guru mengatur toleransi dan kebijakan terlambat, kesempatan revisi, kelompok serta rubrik. Versi kiriman tidak ditimpa diam-diam; penilaian merujuk versi kiriman. Nilai kelompok dapat memiliki penyesuaian individu yang tercatat.

### Kuis

Jenis penuh: PG, PG kompleks, benar/salah, setuju/tidak setuju, menjodohkan, isian singkat, esai. Setuju/tidak setuju hanya dinilai otomatis bila guru menetapkan jawaban acuan; survei tanpa jawaban benar tidak masuk nilai.

Saat percobaan dimulai, simpan snapshot soal, bobot, urutan, dan kebijakan percobaan; edit bank soal tidak mengubah percobaan berjalan. Server menetapkan waktu mulai dan tenggat efektif: minimum durasi percobaan dan waktu penutupan kuis. Autosave memakai nomor revisi, acknowledgement dan retry dengan jeda acak. Jawaban basi tidak menimpa revisi terbaru. Pengiriman final idempoten dan atomik; jawaban setelah batas waktu ditolak. Percobaan kedaluwarsa difinalisasi saat akses berikutnya atau oleh pekerjaan pemeliharaan, tanpa memberi tambahan waktu.

Siswa melihat indikator tersimpan, gagal, dan mencoba ulang. Putus jaringan tidak menghentikan timer; jawaban lokal yang belum diakui server tidak dinyatakan sudah terkumpul. Tab tersembunyi dicatat sebagai informasi pengawasan, bukan bukti kecurangan atau alasan nilai nol otomatis. Kunci dan koreksi hanya berada di server.

Guru mengatur kapan nilai dan pembahasan dibuka secara terpisah. Pengulangan mempunyai batas dan pilihan nilai terbaik/terakhir/rata-rata. Aturan PG kompleks, pencocokan isian dan skor parsial harus ditetapkan guru sebelum publikasi. Esai memerlukan koreksi manual; nilai sementara tidak ditampilkan sebagai final.

### Nilai

Tab 1 menampilkan nilai mentah, maksimum, normalisasi, status kiriman/koreksi. Tab 2 menampilkan komponen dan bobot; skema per mata pelajaran/kelas/semester, total bobot 100%.

Usulan default: setiap nilai dinormalisasi `skor / skor_maksimum × 100`; komponen tugas dan kuis memakai rata-rata nilai yang berlaku; nilai akhir adalah jumlah `nilai_komponen × bobot / 100`. Pembulatan tampilan dua desimal; presisi perhitungan tidak dipotong setiap langkah. Bobot tidak ditentukan otomatis sebelum guru mengaturnya.

Belum dinilai, belum dikumpulkan, absen, dan nilai nol dibedakan. Jika komponen wajib belum lengkap, tampilkan “belum final”, jangan mengubahnya menjadi nol atau membagikan ulang bobot tanpa kebijakan eksplisit. Perubahan bobot membuat versi kalkulasi baru dengan audit.

## 7. Unggahan, notifikasi, PWA dan desain

Definisi teknis batas menggunakan MB desimal: gambar ≤3.000.000 byte, dokumen ≤5.000.000 byte. Audio/video <5.000.000 byte boleh diunggah; ukuran sama dengan atau di atas batas menggunakan tautan, mengikuti redaksi “kurang dari 5 MB”. Validasi ekstensi, MIME dan ukuran di server/storage, bukan hanya browser.

Berkas privat disimpan di Supabase Storage dengan izin per pemilik/kelas. Browser mengunggah langsung dengan izin terbatas yang diterbitkan server; tidak melewatkan isi berkas 5 MB melalui Vercel Functions. Tautan unduhan privat berumur pendek, berkas yatim dibersihkan. Link Google Drive hanya dapat dibuka bila izin penyedianya memungkinkan; sediakan tombol buka sumber jika pemutaran tersemat tidak tersedia. Jangan mengambil sembarang URL di server.

Notifikasi menggunakan pola outbox: kejadian menghasilkan notifikasi, pengirim memproses dan mencatat retry tanpa menggandakan email. Email verifikasi/pemulihan prioritas V1; email tugas/kuis menyusul. WhatsApp/Telegram berupa perluasan kanal, belum integrasi aktif.

PWA V1 menyediakan instalasi dan halaman gangguan koneksi. Jangan cache jawaban, nilai, sesi, token atau dokumen privat secara umum. Fitur offline lanjutan hanya menyimpan materi yang diizinkan dan draf per akun, menghapus data lokal saat logout dan memberi status sinkronisasi.

UI: hijau zamrud, putih, aksen emas dengan kontras yang terbaca. Navigasi desktop di samping; navigasi ponsel ringkas. Halaman guru fokus jadwal/pertemuan, absensi, tugas perlu dinilai. Halaman siswa fokus kegiatan hari ini, tenggat, dan progres. Logo dapat diunggah atau memakai tautan HTTPS. Form memiliki label, pesan kesalahan spesifik, akses keyboard dan status loading.

## 8. Rancangan arsitektur

Usulan stack implementasi: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, validasi Zod; Supabase PostgreSQL, Auth dan Storage. Versi paket dipilih dan dikunci saat implementasi setelah pemeriksaan kompatibilitas. Backend bisnis berupa Route Handlers/Server Actions di Vercel; tidak mewajibkan Edge Functions tambahan.

Alur utama: browser → backend Vercel → Supabase. Unggahan langsung browser → Storage menggunakan izin terbatas. Backend → penyedia email untuk email transaksional. Integrasi Vercel–Supabase membantu konfigurasi proyek, tetapi bukan jaminan izin database atau aktivasi email telah benar.

RLS diterapkan pada tabel yang diakses melalui API Supabase. Seluruh data sekolah memiliki school_id dan pemeriksaan keanggotaan; foreign key komposit mencegah relasi lintas sekolah. Service secret hanya di server dan digunakan terbatas karena melewati RLS. Setiap endpoint istimewa tetap memeriksa sesi, status aktivasi, izin dan lingkup objek.

Tidak membuat satu koneksi realtime per jawaban. Kuis memakai batch autosave perubahan sekitar 10–15 detik dengan jitter, disesuaikan setelah uji beban. Katalog dipaginasi; rekap memakai agregasi database. Ekspor dibatasi lingkup dan jumlah baris; ekspor berulang tidak dijalankan bersamaan tanpa batas.

## 9. Rancangan logis database

Konvensi: UUID untuk primary key, timestamptz untuk waktu, date lokal untuk tanggal sekolah; created_at/updated_at dan actor pada mutasi penting. Tabel domain memiliki school_id. Password hanya dikelola Auth. Tabel berikut merupakan target penuh; migrasi V1 hanya membuat tabel yang dibutuhkan dan dependensinya.

| Tabel | Kolom utama dan relasi |
| --- | --- |
| schools | id, name, education_level, timezone, logo_asset_id/logo_url |
| school_settings | school_id, key, value, version; unik school_id+key |
| profiles | id→auth.users, username_normalized unik global, name, contact_email, email_verified_at, must_change_password, status, session_version |
| school_memberships | school_id, user_id, status; unik sekolah+user |
| roles / membership_roles | kode peran; membership_id, role_id; unik pasangan |
| email_tokens | user_id, email_target, purpose, token_hash, expires_at, consumed_at; akses server saja |
| audit_logs | school_id, actor_id, action, entity, entity_id, perubahan terpilah, timestamp |
| academic_years / semesters | sekolah, nama/periode, tanggal, status; semester→tahun |
| curriculum_versions | sekolah, nama kurikulum, versi, konfigurasi |
| grade_levels / classrooms | sekolah, tingkat; kelas→tingkat dan semester, nama rombel |
| subjects | sekolah, kode, nama; unik kode per sekolah |
| teaching_classes | classroom_id, subject_id, curriculum_version_id; unik kelas+mapel |
| teaching_assignments | teaching_class_id, teacher_id, is_primary; V1 hanya satu pengampu aktif |
| student_enrollments | student_id, classroom_id, semester_id, status; satu rombel aktif per siswa/semester |
| homeroom_assignments | classroom_id, teacher_id, masa penugasan |
| duty_assignments | user_id, semester_id, weekdays, sekolah; jadwal satu/beberapa hari setiap pekan selama semester |
| guardian_students | guardian_id, student_id, relationship, linked_by; unik pasangan |
| learning_units / meetings | teaching_class_id, judul, urutan; pertemuan dengan waktu dan topik |
| materials | unit_id, content, status, publish_at, source_material_id |
| material_prerequisites / progress | material_id, prerequisite_id, rule; material_id+student_id, status |
| assets / asset_links | object_path, owner_id, bytes, MIME, status; relasi objek tujuan dan asset |
| daily_attendance | student_id, local_date, status, recorded_by; unik sekolah+siswa+tanggal |
| meeting_attendance | meeting_id, student_id, status, recorded_by; unik pertemuan+siswa |
| assignments | teaching_class_id, title, allowed_formats, due_at, late_policy, max_score |
| assignment_groups / group_members | assignment_id, group_id, student_id |
| submissions / submission_versions | assignment_id, siswa/kelompok, status; versi, text, links, submitted_at |
| rubrics / rubric_criteria | assignment_id, kriteria, bobot/skor maksimum |
| assignment_grades | submission_version_id, student_id, score, feedback, grader_id, published_at |
| question_banks / questions / question_versions | sekolah, pemilik, mapel, tingkat; jenis soal dan versi immutable |
| answer_keys | question_version_id, kunci/rubrik; schema privat, tidak dapat dibaca siswa |
| quizzes / quiz_items | teaching_class_id, jadwal, durasi, attempts_limit, release settings; item→versi soal |
| quiz_attempts / attempt_items | quiz_id, student_id, attempt_no, started_at, deadline, status; snapshot item/urutan |
| attempt_answers | attempt_item_id, revision, answer, saved_at; unik item percobaan |
| quiz_grades / monitoring_events | attempt_id, item_id, skor/korektor; event waktu dan jenis |
| grading_schemes / grading_components | teaching_class_id, version, bobot, kebijakan nilai hilang |
| grade_results | student_id, scheme_version, hasil, status final, calculated_at |
| discussion_threads / discussion_posts | material_id, author_id, body, status moderasi |
| notifications / notification_receipts | event, recipient_id, payload minimum, read_at |
| email_outbox | event_id, recipient, template, status, attempts, next_retry_at; unik deduplikasi |
| import_jobs / import_rows | jenis, status, file, hasil pratinjau, error per baris |
| export_jobs | jenis, pemohon, filter, asset_id, kedaluwarsa |
| retention_jobs | student_id, alumni_at, eligible_at, notified_at, confirmed_by, status |

Indeks minimum: seluruh FK yang dipakai join; school_id+semester/status; kelas+anggota; kuis+siswa+status; percobaan+item; notifikasi+penerima+read_at; outbox+status+next_retry_at. Tambahkan check skor tidak negatif, maksimum positif, tanggal akhir ≥ awal, serta constraint unik sebagaimana tercantum.

Operasi finalisasi kuis, penerapan impor, dan perubahan nilai dilakukan secara transaksi/idempoten. Impor akun lintas layanan Auth/database menggunakan job dengan pencatatan hasil dan kompensasi bila pembuatan profil gagal; jangan menyatakan transaksi lintas layanan atomik.

## 10. Halaman dan kontrak akses

| Kelompok | Halaman |
| --- | --- |
| Aktivasi | Login, ganti password, login ulang, verifikasi email, lupa/reset password |
| Bersama | Beranda per peran, profil, notifikasi, bantuan |
| Administrasi | Pengguna/peran, impor/template, sekolah, tahun/semester, kurikulum, kelas, mapel, pengampu, anggota kelas, wali, penugasan piket |
| Guru | Kelas saya, topik/materi, pertemuan/absensi, tugas/koreksi, kuis/hasil, nilai |
| Piket | Absensi harian, riwayat dan rekap harian |
| Siswa | Kelas, materi, tugas/pengumpulan, kuis/percobaan, nilai, absensi saya |
| Wali kelas | Anggota kelas, absensi harian/pertemuan, progres dan rekap nilai |
| Kepala | Ringkasan sekolah, aktivitas guru/siswa, laporan |
| Orang tua | Pilih anak, progres, absensi, nilai yang diterbitkan |
| Pusat | Daftar sekolah dan administrasi platform; ditunda aktivasi lintas sekolah |

Kelompok API: autentikasi/aktivasi; pengguna/impor; akademik; pembelajaran; absensi harian/pertemuan; pengumpulan/koreksi; percobaan/autosave/finalisasi; rekap/ekspor; notifikasi; retensi. Setiap mutasi memvalidasi input, otorisasi objek, status semester, dan menulis audit bila relevan. Respons gagal dibedakan validasi, tidak berhak, konflik revisi, kedaluwarsa dan batas frekuensi.

## 11. Impor, ekspor, retensi dan operasi

Template Excel disediakan untuk pengguna, siswa, guru, kelas dan mapel. Kolom username/kode dibaca sebagai teks agar nol awal tidak hilang. Template pengguna: username, nama, peran, email opsional; siswa: username, identitas sekolah siswa, tingkat, rombel, semester; guru: username, kode guru; mapel: kode, nama; kelas: tahun, semester, tingkat, rombel. Relasi wali/pengampu menggunakan template lanjutan tersendiri. Password awal ditetapkan server, tidak perlu kolom password.

Pratinjau menampilkan duplikasi, referensi hilang dan jumlah baris valid; pengguna memilih konfirmasi sebelum menulis. Default impor insert-only; pembaruan data harus eksplisit. Ekspor memakai filter semester/kelas/mapel yang tampak pada layar, label sekolah, waktu dan pemohon. Nilai berawalan karakter formula dinetralkan pada ekspor spreadsheet.

Alumni disimpan sampai akhir tahun pelajaran berikutnya setelah kelulusan. eligible_at dihitung dari kalender akademik nyata. Sistem memberi pemberitahuan, menawarkan ekspor, lalu menunggu konfirmasi admin. Penghapusan meliputi profil siswa yang tidak lagi diperlukan, relasi, berkas, kiriman dan data personal terkait; akun wali yang masih memiliki anak lain tidak ikut dihapus. Data agregat hanya dipertahankan jika sudah tidak dapat mengidentifikasi siswa. Kebijakan cadangan dan siklus berakhirnya salinan harus dicatat; penghapusan aktif tidak berarti seluruh cadangan langsung hilang.

Cadangan/ekspor sebelum uji coba dan sebelum migrasi destruktif; uji pemulihan pada lingkungan terpisah. Log tidak memuat password, token, isi jawaban lengkap atau alamat email berlebihan. Integrasi email tidak boleh dianggap selesai sebelum pengiriman ke penerima nyata teruji.

## 12. Tahapan kerja dan hasil yang harus tersedia

| Tahap | Pekerjaan | Hasil/kriteria selesai |
| --- | --- | --- |
| 0 — Perencanaan | Spesifikasi, matriks, rancangan tabel, prioritas | Dokumen ini; belum implementasi |
| 1 — Fondasi | Repositori, Next.js, konfigurasi lokal, proyek Vercel/Supabase, migrasi awal, RLS, email | Build berhasil, lingkungan contoh tanpa secret, koneksi dan pengiriman email terbukti |
| 2 — Identitas | Prototipe Auth identitas internal, akun, aktivasi, reset, beberapa peran | Dua akun dengan email sama tetap terpisah; token/sesi lama ditolak setelah reset |
| 3 — Akademik | Master data, penugasan, anggota kelas, template/impor | Data contoh valid; impor buruk tidak merusak data |
| 4 — Pembelajaran | Materi, storage, absensi ganda, tugas/koreksi | Guru dan siswa menjalankan satu pertemuan lengkap |
| 5 — Kuis dan laporan V1 | PG/benar-salah, autosave, deadline, finalisasi, nilai, ekspor | Skenario normal, putus koneksi dan submit ulang lolos |
| 6 — Kelayakan uji coba | Uji akses, beban 60→100→132, perangkat, cadangan/pemulihan | Tidak ada kebocoran, kehilangan jawaban atau penilaian ganda; panduan tersedia |
| 7 — Peluncuran terbatas | Migrasi data awal, aktivasi bertahap, pendampingan | Uji kelas terbatas dahulu; perluasan mengikuti hasil |
| 8 — Cakupan penuh | Jenis soal lengkap, bank soal, tugas lanjutan, prasyarat, diskusi, dashboard, orang tua, nilai berbobot, email kegiatan, retensi | Seluruh kebutuhan penuh memiliki pengujian penerimaan |
| 9 — Pengembangan | Offline terkontrol, banyak sekolah, tim pengajar, kanal tambahan | Validasi kapasitas/izin diulang sebelum diaktifkan |

Rencana dua hari: 18 Oktober memprioritaskan fondasi–akademik dan satu alur pembelajaran; 19 Oktober menyelesaikan alur kuis/laporan dan gerbang uji coba. Ini urutan sasaran, bukan jaminan semua tahap selesai berdasarkan kalender. Bila email, otorisasi, atau penyimpanan jawaban gagal, penggunaan siswa ditunda sampai diperbaiki; fitur yang belum selesai tidak dibuat tampak aktif.

## 13. Pengujian penerimaan dan kapasitas

- Akun belum ganti password atau belum verifikasi tidak dapat mengakses data melalui URL, API, SDK maupun Storage.
- Password diganti → sesi berakhir → login ulang wajib. Reset akun juga mencabut akses sesi lama.
- Dua siswa dengan email wali sama: token verifikasi/reset tidak dapat dipertukarkan.
- Guru tidak mengakses kelas lain; wali hanya anak tertaut; guru piket tidak membaca nilai; admin sekolah tidak memberi peran pusat.
- Pengalihan semester tidak memindahkan nilai lama. Berbagi materi lintas tingkat ditolak di backend.
- Absensi harian/pertemuan tidak saling menimpa; data belum dicatat tetap berbeda dari alpa.
- Batas unggahan diuji tepat di bawah, sama dengan dan di atas ambang; URL privat tidak dapat digunakan tanpa izin.
- Kuis diuji timer, refresh, dua tab, koneksi terputus, jawaban basi, retry submit, kedaluwarsa dan perubahan soal sumber.
- Nilai/pembahasan tertutup sampai guru membuka; kunci tidak ditemukan di payload siswa.
- Uji 60, 100 dan 132 sesi dengan mulai kuis, autosave dan submit bertumpuk. Catat p50/p95, tingkat error, database, storage dan konsumsi kuota.
- Sasaran awal uji beban: error server <1%, p95 autosave <2 detik pada kondisi uji tercatat, 100% jawaban yang telah diakui server tetap ada, dan nol finalisasi ganda. Sasaran bukan SLA dan harus dilaporkan dengan lingkungan serta hasil aktual.
- Uji tampilan ponsel/laptop, tabulasi nilai, template Excel dan PDF agar terbaca.
- Cadangan dapat dipulihkan dan prosedur aktivasi/piket/guru dapat dijalankan operator menggunakan panduan.

## 14. Kendala layanan yang telah diperiksa

Dokumentasi resmi diperiksa 17 Oktober 2026. Kuota dan syarat dapat berubah; periksa kembali saat pembuatan proyek.

1. Vercel Functions membatasi payload 4,5 MB. Karena itu unggahan dokumen 5 MB harus langsung ke Storage. Sumber: https://vercel.com/docs/functions/limitations dan https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
2. Supabase menjelaskan layanan email bawaan Auth bukan untuk produksi dan membatasi penerima; diperlukan pengiriman email yang sesuai. Desain email kontak aplikasi juga memerlukan penyedia sendiri. Penyedia gratis, verifikasi pengirim/domain dan kuotanya belum dipilih; ini dependensi terbuka, bukan janji gratis tanpa syarat. Sumber: https://supabase.com/docs/guides/auth/auth-smtp
3. Kuota Free yang tercantum: database 500 MB, Storage 1 GB, egress 5 GB. Angka 150 akun tidak membuktikan kapasitas kuis 132 sesi. Sebagai ilustrasi, 132 siswa × satu unggahan 5 MB = 660 MB, sehingga penggunaan berkas perlu dipantau dan tautan media dianjurkan. Sumber: https://supabase.com/docs/guides/platform/billing-on-supabase
4. Vercel Hobby ditujukan untuk proyek personal; kelayakan penggunaan sekolah dan ketentuan paket harus ditinjau sebelum deployment. Hobby dapat dijeda ketika kuota terlampaui. Tidak mengubah pilihan hosting atau paket berbayar secara otomatis. Sumber: https://vercel.com/docs/plans
5. Supabase Auth menggunakan identitas email/telepon untuk password; secret admin melewati RLS. Pemisahan username/email kontak serta pemeriksaan otorisasi di server diperlukan dalam rancangan ini. Sumber: https://supabase.com/docs/guides/auth/users

## 15. Status akhir tahap ini

Selesai: spesifikasi kebutuhan, batas V1/penuh, matriks hak akses, desain autentikasi, aturan antarmodul, rancangan tabel, tahapan kerja dan gerbang pengujian.

Belum dilakukan: pembuatan akun layanan/repo, penulisan aplikasi, migrasi SQL, pengiriman email nyata, pengujian kapasitas dan deployment. Langkah implementasi berikutnya adalah Tahap 1, dengan prototipe autentikasi pada Tahap 2 sebagai keputusan teknis pertama yang harus dibuktikan.
