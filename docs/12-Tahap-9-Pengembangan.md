# Tahap 9 — Offline, banyak sekolah, tim dan kanal tambahan

Status: **modul tersedia, aktivasi operasional menunggu validasi**. Offline, tim pengajar, kanal tambahan dan pembuatan banyak sekolah dikirim dengan status nonaktif. Tidak ada sekolah nyata baru, pengangkatan admin pusat nyata, atau pengiriman WhatsApp/Telegram nyata yang dilakukan dalam pekerjaan ini. Kendala Tahap 6–8 tidak ditandai selesai oleh perubahan ini.

## Lokasi fitur

| Fitur | Lokasi | Otoritas |
| --- | --- | --- |
| Sekolah aktif | Ruang akun → Sekolah aktif | Anggota hanya dapat memilih sekolah yang ditautkan |
| Pengaturan fitur | Ruang akun → Pengaturan pengembangan | Admin sekolah mengubah fitur pada sekolah terpilih |
| Banyak sekolah | Pengembangan → Kelola banyak sekolah | Admin pusat yang ditetapkan operator |
| Tim pengajar | Pengembangan → Tim pengajar tambahan | Admin sekolah menautkan guru sekolah yang sama |
| Materi/draf offline | Pembelajaran → Pengembangan | Pengguna memilih salinan; tugas individu untuk siswa aktif |
| Ruang offline | `/offline` | Data terenkripsi dari sesi tab pemilik |
| Tujuan kanal | Pengembangan → Tujuan WhatsApp/Telegram | Admin menyimpan persetujuan dan verifikasi tujuan |
| Antrean kanal | Pembelajaran → Pengembangan | Pengampu mengantrekan pesan kegiatan dan mengirim batch |

Admin mengisi referensi hasil pemeriksaan izin, perangkat dan kapasitas sebelum menyalakan fitur sekolah. Referensi adalah catatan pemeriksaan operator, bukan sertifikat otomatis bahwa aplikasi telah lulus. Pengaturan memakai nomor revisi untuk menolak penimpaan dari tab lama.

## Offline dan PWA

Manifest, ikon dan service worker menyediakan pemasangan melalui browser yang mendukung serta halaman cadangan saat navigasi kehilangan koneksi. Service worker hanya menyimpan halaman publik offline dan aset kode/CSS `/_next/static/`; halaman akun, API, jawaban, nilai, sesi dan dokumen privat tidak dimasukkan ke cache umum. Instalasi nyata tetap harus diuji pada perangkat sasaran.

Setelah admin mengaktifkan offline dan pengguna menyetujui penyimpanan pada perangkat pribadi, tombol Simpan materi offline meminta tiket dari server. Server mengulang pemeriksaan akun aktif, sekolah, kelas, status publikasi dan prasyarat. Salinan memuat judul, teks dan tautan; berkas privat tidak diunduh untuk offline.

Data disimpan sebagai ciphertext AES-GCM pada IndexedDB, dengan metadata pemilik/sekolah/kelas/jenis/masa berlaku terikat pada enkripsi. Kunci dan identitas ruang penyimpanan ada pada sessionStorage tab. Tab lain menggunakan ruang dan kunci tersendiri agar tidak menimpa atau menghapus draf tab pertama. Batas penyimpanan adalah 20 materi/draf per ruang tab, masing-masing konten maksimal 60.000 karakter. Masa akses maksimal 30 menit sejak tiket dibuat; menyimpan ulang teks draf tidak memperpanjang tiket.

Kunci bertahan saat refresh dalam sesi tab yang sama. Menutup tab/aplikasi atau pemulihan sesi oleh browser dapat mengakhiri atau mengubah akses; jangan menganggap draf dapat dipulihkan setelah tab ditutup. Data lokal bukan cadangan. Logout, login ke akun lain, perubahan password melalui form aplikasi dan pergantian sekolah menghapus data/kunci offline. Pemberitahuan antar-tab ikut membersihkan sesi lokal lain. Data yang kedaluwarsa atau gagal diverifikasi tidak ditampilkan ketika daftar diperiksa ulang.

Pencabutan akses jarak jauh tidak dapat seketika menghapus data pada perangkat yang benar-benar offline. Gunakan hanya perangkat pribadi; masa tiket membatasi jendela penggunaan normal. Pemilik perangkat yang mengubah kode/jam browser berada di luar jaminan kontrol lokal. Semua pengiriman ke server tetap memeriksa sesi dan kewenangan aktual.

### Draf tugas

Siapkan draf untuk tugas individu yang sudah diterbitkan dan mendukung teks/tautan. Tugas kelompok, unggahan berkas dan kuis tidak didukung offline. Mengganti draf lokal yang sudah ada memerlukan konfirmasi. Draf baru dimulai kosong; jangan menganggap jawaban server lama otomatis disalin.

Di Ruang offline, ubah teks/tautan dan tekan Simpan draf lokal. Tombol Kumpulkan saat online melakukan pemeriksaan ulang akun, sekolah, pengaturan offline dan kelas, lalu mengirim request dengan ID dan revisi yang tersimpan. Pengumpulan tidak berjalan otomatis saat jaringan pulih. Server memeriksa tenggat, format, batas kiriman dan konflik revisi. Draf lokal baru dihapus setelah server mengonfirmasi.

Jika response pengumpulan hilang, tombol pengumpulan dapat diulang dengan ID yang sama selama draf belum diedit. Mengedit draf membuat ID baru. Konflik revisi tidak diselesaikan dengan menimpa jawaban server; periksa kiriman terbaru saat online. Draf yang dibiarkan melewati masa tiket dapat hilang dari akses lokal, sehingga kumpulkan sebelum masa berlaku berakhir.

## Banyak sekolah

Keanggotaan/peran tetap berbatas sekolah. Pemilih sekolah hanya menerima ID yang tercantum pada keanggotaan pengguna yang aktif; cookie pilihan bukan sumber kewenangan. Halaman admin pengguna, akademik, piket, retensi dan daftar kelas mengikuti pilihan tersebut. Dashboard dibatasi ke kelas sekolah terpilih. Backend tetap memeriksa setiap ID sekolah/kelas yang diminta, termasuk jika pengguna memodifikasi request.

Satu identitas pengguna dapat mempunyai beberapa keanggotaan, dengan peran berbeda pada tiap sekolah. Akun/password tetap milik identitas pengguna; data akademik menggunakan scope sekolahnya masing-masing. Memilih sekolah menghapus salinan offline dan memuat ulang halaman. Guru tambahan sekolah A tidak mendapat akses sekolah B.

Admin pusat dapat melihat identitas sekolah, membuat sekolah, menautkan admin yang sudah ada dan menambahkan peran ke keanggotaan akun yang sudah ada. Peran pusat tidak otomatis memberikan akses nilai/jawaban. Pembuatan/penautan sekolah dibatasi pengaturan global multi_school. Mematikan pengaturan tersebut menghentikan provisioning, bukan mencabut keanggotaan sekolah yang sudah sah. Tidak ada migrasi massal data antar sekolah pada tahap ini.

### Menetapkan admin pusat pertama

Tidak ada akun yang otomatis dinaikkan menjadi admin pusat. Operator memilih username admin sekolah yang sudah aktif, sudah mengganti password dan sudah memverifikasi email.

Pada komputer operator, gunakan konfigurasi Supabase server yang sudah ada dan tambahkan environment lokal `PLATFORM_ADMIN_USERNAME` berisi username pilihan serta `PLATFORM_ADMIN_ACK=grant-platform-administration`. Jangan menaruh secret atau token pada chat, source, kolom aplikasi, atau variabel NEXT_PUBLIC_. Jalankan:

```sh
node --env-file=.env.local --import tsx scripts/provision-platform-admin.ts
```

Skrip memanggil RPC yang hanya dapat dijalankan service_role, mencatat audit platform, dan tidak mengaktifkan fitur atau membuat sekolah. Skrip ini disediakan tetapi **tidak dijalankan untuk akun nyata** pada tahap ini. Setelah login sebagai admin pusat, isi referensi validasi isolasi/kapasitas sebelum mengizinkan provisioning. Tentukan nama sekolah, jenjang dan username admin yang sudah ada; data kelas/sekolah baru kemudian diisi melalui administrasi biasa.

## Tim pengajar

Guru utama tetap pada penugasan akademik. Admin menambahkan guru lain dengan peran Guru aktif pada sekolah yang sama melalui Pengembangan. Penugasan tambahan baru efektif jika team_enabled aktif. Guru tambahan memiliki hak pengampu di kelas tersebut: materi, tugas, absensi pertemuan, kuis, koreksi dan laporan; hak ini tidak membuatnya admin sekolah.

Menonaktifkan penugasan atau fitur tim mencabut hak tambahan pada permintaan berikutnya. Jika guru juga mempunyai peran lain yang sah, hak dari peran tersebut tetap berlaku. Piket harian tetap mengikuti penugasan piket, bukan penugasan tim mengajar. Audit dan pengaturan nilai tetap berlaku; berbagi materi tetap memerlukan tindakan eksplisit dan pemeriksaan tingkat/semester.

## WhatsApp dan Telegram

Kanal memakai pesan yang dibuat melalui Lanjutan → Notifikasi kegiatan. Admin menyimpan tujuan privat per pengguna, bukti persetujuan, status terverifikasi dan status aktif. Telegram memakai chat ID pribadi berupa angka positif; grup/channel publik tidak didukung. Pengguna perlu memulai bot agar bot dapat mengirim ke chat tersebut. WhatsApp memakai nomor internasional tanpa tanda +.

Pengampu memilih pesan dan kanal lalu mengantrekannya. Hanya siswa aktif penerima pesan dengan tujuan aktif/terverifikasi yang dimasukkan. Antrean mempunyai kunci unik per pesan–pengguna–kanal. Tombol Kirim batch meminta konfirmasi dan memproses maksimal tiga tujuan, dengan klaim eksklusif. Pemilihan sekolah, pengaturan fitur, penugasan pengirim dan keanggotaan penerima diperiksa ulang.

Status Diterima penyedia berarti API menerima request, bukan bukti pesan sudah sampai atau dibaca. Pengiriman yang gagal/tidak pasti dan worker yang terputus setelah klaim tidak diulang otomatis; operator memeriksa penyedia sebelum memutuskan tindak lanjut. Webhook tanda terima/dibaca belum diimplementasikan.

### Kredensial server

Isi `LMS_CHANNEL_CONFIG_JSON` langsung pada environment server Vercel. Bentuknya objek dengan kunci UUID sekolah. Setiap sekolah dapat mempunyai konfigurasi berikut; ganti seluruh placeholder dengan data dari akun penyedia yang dikuasai operator:

```json
{
  "UUID_SEKOLAH": {
    "telegram": {"token": "TOKEN_BOT"},
    "whatsapp": {
      "token": "ACCESS_TOKEN",
      "phone_id": "PHONE_NUMBER_ID",
      "version": "VERSI_GRAPH_AKTIF",
      "template": "NAMA_TEMPLATE_DISETUJUI",
      "language": "id"
    }
  }
}
```

Telegram menggunakan Bot API sendMessage dengan teks biasa dan tanpa preview tautan. WhatsApp menggunakan Cloud API template dengan **satu parameter teks pada body** berisi ringkasan judul/isi serta tautan ke LMS. Pesan lengkap tetap dapat dibaca di LMS. Template dan bahasa harus sesuai yang disetujui penyedia. Versi Graph diisi secara eksplisit dalam format vN.N; tidak ada versi yang dipilih otomatis. Kombinasi judul/isi dibatasi 4.096 karakter untuk Telegram dan 1.024 untuk parameter WhatsApp. Notifikasi diringkas sesuai batas kanal tanpa memotong pasangan Unicode; adapter tetap menolak payload yang melewati batas sebelum memanggil penyedia.

Konfigurasi diverifikasi sebelum klaim batch. Token tidak dikirim ke frontend dan error tidak memuat token/URL rahasia. Modul tidak membuat akun penyedia, bot, nomor WhatsApp, template, langganan atau komitmen biaya. Penggunaan nyata mengikuti izin/kuota penyedia dan perlu pemeriksaan operator sesuai syarat paket gratis.

Referensi: [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage), [template WhatsApp resmi Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/).

## Verifikasi dan kriteria aktivasi

- 116 tes otomatis lulus, termasuk 10 tes/subtes baru untuk fitur Tahap 9 dan penyimpanan lokal.
- TypeScript, build produksi dan 17 kelompok pemeriksaan HTTP lokal lulus.
- IndexedDB diuji memakai fake-indexeddb 6.2.6; kriptografi memakai WebCrypto. Ini tidak menggantikan uji browser/PWA pada perangkat nyata.
- Adapter kanal diuji dengan mock HTTP tanpa pengiriman nyata. Belum ada kredensial kanal yang ditetapkan oleh pekerjaan ini.
- Integrasi PostgreSQL Supabase dengan empat identitas dan dua sekolah sintetis lulus dalam transaksi rollback. Sesudahnya 0 sekolah/profil uji tersisa, semua fitur sekolah tetap nonaktif dan kebijakan multi_school tetap false. Ini uji klaim database, bukan login HTTP nyata.
- Dua migrasi baru diterapkan; total 21 migrasi. Peringatan performa akibat policy tambahan diselesaikan dengan penggabungan kondisi yang setara. Advisor performa tersisa informasi indeks belum dipakai. Advisor keamanan tidak memberi error; peringatan lama perlindungan password dan informasi tabel yang sengaja tertutup akses langsung tetap dicatat pada Tahap 8.

Sebelum aktivasi nyata, uji pemasangan PWA, pemuatan shell tanpa jaringan, expiry/pergantian akun/multi-tab, pengumpulan draf dengan jaringan putus dan konflik, pencabutan akses tim, isolasi dua sekolah melalui URL/API/Storage, pengiriman kanal ke tujuan uji yang disetujui, serta beban target setelah perubahan. Catat hasil dan referensinya di pengaturan; jangan menyatakan uji kapasitas lulus hanya dari keberhasilan build.

Latensi kuis Tahap 6, penerimaan browser privat/perangkat, pemulihan cadangan produksi dan pelaksanaan kelas Tahap 7 tetap terbuka. Lihat [hasil Tahap 9](verification/stage9-results.json).

Perbaikan kesiapan offline, kanal dan konfirmasi terbaru dijelaskan pada [pembaruan pembelajaran](16-Lampiran-Offline-Kanal-Logout.md).
