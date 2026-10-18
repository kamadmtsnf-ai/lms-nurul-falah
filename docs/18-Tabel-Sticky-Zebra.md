# Tabel sticky dan zebra striping

Diterapkan pada Rekap Kehadiran, Nilai Tugas, Laporan → Ringkasan Siswa dan Laporan → Hasil Kuis.

- Komponen `DataTableViewport` menyediakan satu area gulir vertikal/horizontal dengan tinggi maksimal yang menyesuaikan layar, batas visual, scrollbar dan fokus keyboard.
- Header menempel di bagian atas area gulir. Kolom Siswa menempel di sisi kiri. Sel pertemuan header/Siswa mempunyai lapisan lebih tinggi agar tidak tertutup sel lainnya.
- Kolom Siswa pada Hasil Kuis dipindahkan menjadi kolom pertama agar konsisten dengan tabel lain dan langsung terlihat di ponsel.
- Baris putih dan abu kehijauan ditampilkan selang-seling dengan highlight hover. Sel mempunyai latar opak agar teks yang bergulir di belakang kolom sticky tidak terlihat menembus.
- Layout tabel dan lebar kolom ditetapkan secara konsisten agar kolom sticky tidak bergeser ketika scrollbar horizontal mencapai ujung. Teks panjang tetap dapat membungkus.

Perubahan hanya pada presentasi tabel. Sumber data, izin, pagination, filter judul tugas, perhitungan nilai, rekap absensi dan ekspor tidak diubah. Tidak ada perubahan database atau API.

## Validasi

128 tes otomatis dan 17 kelompok HTTP smoke test lulus. Typecheck dan build produksi lulus.

187 pemeriksaan browser lulus pada lebar 320/390/768/1440 piksel, termasuk orientasi melebar. Pemeriksaan tambahan menggunakan tabel berisi banyak siswa dan hasil kuis; browser mengukur posisi header, kolom Siswa dan sel sudut setelah gulir vertikal/horizontal sampai ujung, memeriksa perbedaan warna zebra serta memastikan overflow tetap di dalam area tabel. Tidak ada JavaScript error yang teridentifikasi.

Pengujian UI menggunakan komponen React asli dan data/API sintetis; bukan pengujian perangkat fisik. Bukti: `verification/ui-audit-results.json` dan `table_presentation` pada `VERIFICATION.json`.
