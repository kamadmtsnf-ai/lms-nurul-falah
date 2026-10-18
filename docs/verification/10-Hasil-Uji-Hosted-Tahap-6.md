# Hasil pengujian hosted Tahap 6

Keputusan: **belum disetujui untuk penggunaan massal** sampai gate latensi client, perangkat/jaringan fisik dan pemulihan produksi terselesaikan. Status browser hosted dibaca dari laporan terbaru, terpisah dari uji kapasitas lama.

| Sesi siswa | Request gelombang | Error | p95 jawaban client tertinggi (ms) | p95 handler tertinggi (ms) | Jawaban diakui tetap ada | Finalisasi ganda |
|---|---:|---:|---:|---:|---|---:|
| 60 | 600 | 0 | 16089.93 | 6059.2 | Ya | 0 |
| 100 | 1000 | 0 | 18968.04 | 1164.8 | Ya | 0 |
| 132 | 1320 | 0 | 23221.34 | 1651.1 | Ya | 0 |

p95 di atas adalah nilai tertinggi antar gelombang simpan dan retry, bukan percentile gabungan. Waktu client mencakup perjalanan request sampai response; `Server-Timing total` hanya mencakup autentikasi di route, pembatasan permintaan dan RPC. Waktu sebelum/sesudah handler (termasuk middleware/platform/jaringan) belum seluruhnya terisolasi.

Hasil browser hosted terbaru dan pemulihan jaringan emulasi: lihat `stage6-browser-results.json` dan `stage6-readiness.json`. Pengujian ini tetap tidak membuktikan perangkat fisik.

Lingkungan: sesi Auth Supabase asli, API Vercel pada alamat utama, function sin1 dan database Singapura, 30 soal per kuis, lima batch simpan, retry dan finalisasi berulang. Sekolah dan akun seluruhnya sintetis. Uji ini tidak menjalankan browser.

Lihat JSON mentah untuk p50/p95 setiap fase, jumlah sampel, pemisahan waktu server dan total payload JSON yang terukur. Bukti diagnostik awal yang sempat bertumpuk dikeluarkan dari keputusan kapasitas.

Checklist dan panduan operator: ../09-Tahap-6-Kelayakan-Uji-Coba.md

Pembersihan kelanjutan terbaru terverifikasi pada `stage6-cleanup-latest.json`: sekolah/profil/akun/sesi/refresh token sintetis tersisa nol; sekolah asli tetap tersedia.
