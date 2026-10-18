# Pratinjau lampiran, filter nilai dan navigasi password

Tanggal: 18 Oktober 2026.

## Perubahan

- Materi dan Tugas menampilkan tombol mata **Lihat lampiran** untuk JPG/JPEG, PNG, WebP dan PDF. Tombol unduh dan hapus tetap tersedia sesuai izin.
- Modal pratinjau responsif menyediakan judul berkas, loading/error, tutup, Escape, pengembalian fokus, muat ulang serta buka di tab baru. Judul panjang dibatasi dua baris secara visual dengan tooltip. Gambar menyesuaikan layar; PDF memakai penampil browser. Jika PDF tidak tampil di browser ponsel, gunakan Buka di tab baru atau tombol unduh yang sudah ada.
- Nilai Tugas mempunyai dropdown **Filter judul tugas**. Pilihan memakai ID tugas sehingga judul sama tidak mencampur nilai tugas berbeda. Default Semua tugas; filter berlaku pada tugas yang dimuat di halaman pagination saat ini. Status jumlah tugas menjelaskan lingkup tersebut. Skor, pembukaan nilai dan skala 100 tidak diubah.
- Ubah password di Ruang Belajar mengarah ke `/ganti-password?from=ruang-belajar`. Tombol **Kembali ke Ruang Belajar** hanya tampil bila akun sudah mengganti password awal dan emailnya terverifikasi. Target kembali konstan `/ruang-belajar`, bukan URL dari parameter pengguna. Alur wajib ganti password tidak menampilkan tombol tersebut. Setelah perubahan password berhasil, kewajiban logout/login ulang tetap berlaku.

## Izin berkas

POST `file-preview` menggunakan pemeriksaan asal request, akun aktif, rate limit, UUID dan RPC `asset-info` yang sama dengan unduhan. Server memeriksa MIME metadata tersimpan, bukan ekstensi/MIME kiriman browser. Hanya gambar raster yang diizinkan aplikasi dan PDF yang mendapat URL pratinjau. SVG, HTML, Office dan format lain ditolak. Pemeriksaan signature unggahan tetap berlaku.

URL Storage bertanda tangan berlaku 120 detik, tanpa opsi paksa unduh untuk preview. Bucket tetap privat; tidak menambah policy, menyimpan URL di database/offline, atau menggunakan cache image optimizer. Request dibatalkan saat modal ditutup atau dimuat ulang. Muat ulang meminta URL baru dengan pemeriksaan izin ulang.

Tidak ada migrasi schema atau perubahan data sekolah.

## Validasi

- **128 tes otomatis lulus**, termasuk allowlist MIME dan navigasi password pada akun aktif/password awal/email belum terverifikasi/asal URL tidak dikenal.
- **167 pemeriksaan UI lulus**, tanpa JavaScript error teridentifikasi, pada lebar 320/390/768/1440 piksel. PNG benar-benar dimuat; PDF fixture disajikan sebagai `application/pdf`; modal, error/retry, pengecualian Word dan filter diuji.
- Filter mengubah 264 baris (132 siswa, dua tugas) menjadi 132 saat satu judul dipilih; Semua tugas mengembalikan 264 baris. URL tombol Ubah password juga diperiksa.
- Typecheck, build produksi dan **17 kelompok HTTP smoke test lulus**.
- UI memakai komponen React asli serta API/berkas sintetis lokal. Lampiran pribadi sekolah tidak diunduh dan penampil PDF perangkat fisik belum diuji. Akses berkas tetap memakai RPC yang diuji pada rangkaian database aplikasi.

Bukti: `verification/ui-audit-results.json` dan bagian `attachment_preview_and_navigation` pada `VERIFICATION.json`.
