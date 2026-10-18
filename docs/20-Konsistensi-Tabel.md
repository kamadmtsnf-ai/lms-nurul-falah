# Konsistensi seluruh tabel

## Pemetaan

Pencarian elemen tabel dan penelusuran komponen menemukan sembilan titik render tabel:

| Komponen | Tabel | Hasil |
|---|---|---|
| course-workspace | Rekap kehadiran, nilai tugas | Acuan dipertahankan |
| report-panel | Ringkasan siswa, hasil kuis | Acuan dipertahankan |
| academic-manager | Daftar entitas akademik; pratinjau impor Excel | Memakai DataTableViewport |
| learning-shared | Form pencatatan absensi pertemuan dan harian | Memakai DataTableViewport |
| daily-attendance | Rekap absensi harian sekolah | Memakai DataTableViewport |
| advanced-panel | Nilai tugas/kuis dan nilai akhir berbobot | Memakai DataTableViewport |

Daftar entitas akademik mencakup seluruh jenis data yang dirender melalui konfigurasi entities; form absensi dipakai ulang oleh halaman pembelajaran dan absensi harian.

## Pembaruan

Semua tabel menggunakan pembungkus bersama dengan header hijau lembut, padding konsisten, border membulat, zebra striping, sorotan hover/fokus, scroll internal dua arah, header sticky dan kolom pertama sticky. Region scroll memiliki nama aksesibel, dapat difokuskan dengan keyboard, dan menampilkan indikator fokus. Lapisan sudut header di atas lapisan kolom menghindari tumpang tindih.

Tabel akademik dan impor memakai tata letak otomatis agar jumlah kolom dinamis tetap terbaca; lebar minimum kolom dan pembungkusan teks mencegah kolom dipadatkan berlebihan. Teks impor disamakan dengan ukuran tabel lainnya. Tinggi dibatasi relatif viewport; halaman tetap dapat discroll. Tidak ada perubahan query, skema, hak akses, perhitungan nilai, filter, ekspor, handler formulir atau penyimpanan.

## Validasi

Build dan typecheck lulus; 17 skenario HTTP dan 215 pemeriksaan UI lulus. Pengujian UI memakai komponen React nyata dengan data sintetis/API mock, mencakup data banyak, scroll dua arah, sticky header/kolom/sudut, zebra, overflow, dan perubahan orientasi pada lebar 320, 390, 768, 1440 piksel. Form absensi, rekap harian, kedua subtab nilai berbobot, daftar akademik, dan pratinjau impor ditambahkan ke pemeriksaan tabel acuan. Penerimaan melalui akun produksi tetap memerlukan pemeriksaan pengguna; data sekolah asli tidak diubah selama pengujian.
