# Hasil pengujian hosted Tahap 6

Keputusan: **belum disetujui untuk penggunaan massal** sampai gate latensi, browser/perangkat dan pemulihan produksi terselesaikan.

| Sesi siswa | Request gelombang | Error | p95 jawaban client tertinggi (ms) | p95 handler tertinggi (ms) | Jawaban diakui tetap ada | Finalisasi ganda |
|---|---:|---:|---:|---:|---|---:|
| 60 | 600 | 0 | 16089.93 | 6059.2 | Ya | 0 |
| 100 | 1000 | 0 | 18968.04 | 1164.8 | Ya | 0 |
| 132 | 1320 | 0 | 23221.34 | 1651.1 | Ya | 0 |

p95 di atas adalah nilai tertinggi antar gelombang simpan dan retry, bukan percentile gabungan. Waktu client mencakup perjalanan request sampai response; `Server-Timing total` hanya mencakup autentikasi di route, pembatasan permintaan dan RPC. Waktu sebelum/sesudah handler (termasuk middleware/platform/jaringan) belum seluruhnya terisolasi.

Lingkungan: sesi Auth Supabase asli, API Vercel pada alamat utama, function sin1 dan database Singapura, 30 soal per kuis, lima batch simpan, retry dan finalisasi berulang. Sekolah dan akun seluruhnya sintetis. Uji ini tidak menjalankan browser.

Lihat JSON mentah untuk p50/p95 setiap fase, jumlah sampel, pemisahan waktu server dan total payload JSON yang terukur. Bukti diagnostik awal yang sempat bertumpuk dikeluarkan dari keputusan kapasitas.

Checklist dan panduan operator: ../09-Tahap-6-Kelayakan-Uji-Coba.md

Pembersihan telah diverifikasi: sekolah sintetis dan 133 akun uji telah dihapus beserta sesi Auth dan data kuisnya. Hasil pemeriksaan menunjukkan 0 sekolah uji dan 0 profil uji tersisa. Log penyedia mengikuti retensi penyedia.
