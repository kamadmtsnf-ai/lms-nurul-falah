# Audit dan refactoring seluruh halaman LMS Nurul Falah

Tanggal: 18 Oktober 2026. Dasar: `a063bce93ac52708d9ff82630c0a059999c5225f`.

## Cakupan dan alur

19 route halaman, halaman error/404, 17 komponen tingkat aplikasi, komponen tombol bersama, 8 route API, transport HTTP, autentikasi, validasi input, dan hubungan RPC/PostgreSQL yang dipakai halaman. Tidak ada integrasi Google Apps Script pada LMS ini.

Alur utama: halaman server → `requireAccount` → konteks akun/keanggotaan → komponen client → API dengan validasi origin/input/aktivasi → RPC dengan pemeriksaan peran/sekolah → state hasil baca ulang. Materi/tugas/absensi memakai learning API, kuis memakai quiz API dan antrean jawaban berversi, fitur lanjutan memakai advanced API, pengembangan/offline memakai development API. Ekspor dan unggahan privat tetap melalui endpoint yang sama.

Pembacaan kode dilakukan sebelum perubahan. Perubahan lokal pada checkout lama dipertahankan; pekerjaan ini dilakukan pada worktree terpisah dari main terbaru.

## A. Temuan dan B. Perbaikan

| Temuan / penyebab | Perbaikan |
| --- | --- |
| Intrinsic width pada grid/flex, teks panjang, dan kelompok tombol dapat memperlebar halaman ponsel. | Batas min-width, wrapping teks/tombol, kelompok tindakan yang membungkus, tabel tetap menggulir dalam kontainernya. Tidak menyembunyikan overflow pada body. |
| Kontrol kecil, focus tidak konsisten, dan teks form kecil berpotensi memicu zoom saat fokus di iOS. | Tombol/kontrol minimum 44 px, focus-visible bersama, font form mobile 16 px, preferensi reduced motion. |
| Tab berperan ARIA tab tetapi belum mendukung tombol panah/Home/End. | Handler keyboard bersama dan roving tabindex pada tab pembelajaran, laporan, serta absensi harian. |
| Respons proxy HTML menimbulkan kesalahan JSON mentah; transport HTTP berulang. | Transport JSON bersama; pesan kegagalan yang dapat ditindaklanjuti, status konflik dan AbortSignal tetap dipertahankan, tanpa retry mutasi otomatis. |
| Logout tidak memberi pesan saat fetch gagal; error signOut server diabaikan. | Pesan kegagalan pada tombol keluar dan pemeriksaan error signOut. |
| Penolakan sessionStorage/localStorage dapat menghentikan logout sebelum API dipanggil. | Cleanup offline menangani kegagalan storage dan tetap mencoba penghapusan IndexedDB. |
| Tanggal izin offline tidak valid dapat melewati perbandingan NaN. | Menolak expiry yang bukan tanggal finite. |
| Draf offline di layar dapat berbeda dari versi tersimpan yang dikirim tombol kumpulkan. | Dirty state; wajib menyimpan draf terlebih dahulu. Kontrol dikunci selama penyimpanan/pengiriman. Untuk tugas tautan saja, body kosong tetap string kosong. |
| Pengulangan kiriman kelompok setelah respons hilang membuat request ID baru. | ID yang sama dipakai untuk revisi dan konten identik; perubahan konten/revisi menghasilkan ID baru. |
| Detail nilai yang sudah dibuka dapat mempertahankan versi lama setelah penyimpanan. | Detail dibersihkan sesudah save sukses dan versi daftar nilai dipakai saat memuat kembali. |
| Navigasi ke route kelas/percobaan lain dapat mempertahankan state client initial lama. | Key komponen berdasarkan ID route. |
| Daftar pengguna/retensi dapat menerima respons halaman lama setelah navigasi. | Penanda urutan request serta loading/disabled pada navigasi; form hak akses dipasang ulang sesuai versi role/status. |
| Riwayat, diskusi, dan bank soal membolehkan navigasi ketika baca sebelumnya belum selesai. | Penguncian kontrol selama pembacaan dan feedback loading yang relevan. |
| Pagination dashboard dan panel nilai mempunyai offset independen. | Offset panel nilai dikendalikan dashboard ketika ditampilkan di dalam dashboard. |
| Nilai awal kebijakan platform dimuat async, tetapi uncontrolled checkbox/input sudah terpasang lebih dahulu. | Form dipasang ulang berdasarkan versi data yang sudah dimuat. |
| Pratinjau bank soal lama tetap terlihat setelah file berikutnya gagal dibaca/divalidasi. | Pratinjau dibatalkan sebelum file baru diproses; input file direset agar file sama bisa dipilih ulang. |
| Pergantian jenis impor akademik mempertahankan file jenis sebelumnya. | Reset file dan input ketika jenis impor berubah. |
| Edit materi dapat kehilangan opsi pertemuan ketika materi dan pertemuan ada pada halaman pagination berbeda. | Pertemuan materi saat ini tetap tersedia sebagai opsi valid. |
| Empty state kelas menghitung semua sekolah sebelum filter sekolah aktif. | Empty state mengikuti sekolah yang sedang dipilih. |
| Tindakan retensi dari halaman kedua mencari alumni hanya di 100 baris pertama. | Offset halaman ikut dikirim dan dipakai pada lookup retensi; validasi izin dan konfirmasi tetap berlaku. |
| Judul kuis sangat panjang dapat membuat header sticky menutupi area soal. | Judul header dibatasi dua baris dengan teks lengkap pada atribut title. |
| Tautan kembali dari kuis memakai navigasi client sehingga beforeunload tidak selalu terpanggil. | Konfirmasi saat masih ada antrean jawaban sebelum tautan kembali meninggalkan halaman. |
| Kode halaman/komponen sangat padat dan sulit ditinjau. | Format ulang TSX menjadi blok yang terbaca, tanpa mengganti kontrak API/skema/perhitungan. |

## C. Kode final

Kode aktual ada di `src/app`, `src/components`, serta helper pada `src/lib/http`, `src/lib/learning/submission-packet.ts`, dan transport client terkait. Tes regresi baru ada di `tests/ui-regressions.test.ts`, `tests/ui/fixture.tsx`, dan `scripts/test-ui.mjs`.

Tidak memerlukan migrasi database, perubahan kredensial, atau aktivasi fitur tambahan. Peran admin tetap menjadi syarat menampilkan Sekolah Aktif di ruang-belajar. Perhitungan nilai, batas unggahan, semester arsip, scope orang tua, serta antrean kuis tetap mengikuti aturan sebelumnya.

## D. Validasi

- TypeScript dan build produksi Next.js: lulus.
- 120 tes otomatis: lulus, termasuk PostgreSQL/PGlite, kebijakan akses, validasi, autosave, ekspor, offline, dan regresi baru.
- 17 kelompok HTTP smoke test: lulus, termasuk halaman publik, redirect privat, anti-CSRF, endpoint privat, serta shell PWA.
- 138 pemeriksaan browser Chromium: lulus pada lebar 320/390/768/1440 px serta resize landscape. Komponen asli memakai API simulasi, data kosong, 132 siswa, dan teks panjang.
- Pemeriksaan khusus: error logout, kebijakan platform async, offset laporan, keyboard tab, pembatalan preview impor lama, dan dirty state draf offline.
- Tidak ditemukan horizontal overflow halaman, elemen terpotong di luar kontainer scroll, atau error JavaScript pada skenario browser tersebut. Gulir vertikal halaman panjang dan gulir lokal tabel tetap tersedia.
- Diff diperiksa; dependency pengujian dipin dan lockfile disertakan.

### Cara mengulang

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
npm run test:http
npm run test:ui
```

### Batas bukti

Pengujian browser komponen menggunakan data dan API simulasi. Ini belum membuktikan setiap alur CRUD dengan akun nyata untuk tujuh peran, perangkat iOS/Safari/Firefox nyata, SMTP eksternal, transfer Storage, kehilangan jaringan fisik, atau kapasitas kuis 132 sesi serentak. Tidak ada pesan eksternal atau penghapusan alumni produksi yang dijalankan untuk audit ini. Kelayakan kapasitas/backup/pilot dari tahap sebelumnya tidak diubah menjadi lulus oleh audit UI ini.
