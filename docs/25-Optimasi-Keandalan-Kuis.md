# Optimasi performa dan keandalan kuis

## Perubahan

- Baris metadata kuis memakai kunci bersama. Autosave, pembacaan, pencatatan tab, dan penyelesaian peserta berbeda tidak lagi memperebutkan kunci eksklusif pada kuis yang sama. Setiap percobaan tetap dikunci eksklusif. Saat memulai kuis, kunci transaksi per pasangan kuis/siswa mencegah percobaan ganda tanpa menahan siswa lain. Perubahan konfigurasi guru tetap diserialisasi terhadap operasi peserta.
- Klien baru meminta respons ringkas untuk autosave dan polling selama status masih berjalan: ID, revisi, status, waktu server, tenggat, dan izin menjawab. Soal, seluruh jawaban, dan informasi penilaian tidak dikirim ulang. Respons akhir tetap lengkap. Klien lama tanpa opsi ini tetap mendapat respons lengkap.
- Satu paket autosave yang belum pasti diterima dipertahankan dengan ID, revisi, dan isi yang sama. Edit berikutnya mengantre terpisah. Respons ringkas hanya mengakui paket yang benar; tidak mengganti jawaban baru pada tampilan.
- Jeda autosave tersebar sekitar 3,5–5,5 detik; polling saat tidak ada perubahan sekitar 45–60 detik dan dijadwalkan ulang setelah autosave berhasil. Maksimal satu polling aktif. Setiap permintaan kuis memiliki batas tunggu 15 detik. Retry gangguan sementara memakai exponential backoff dan jitter.
- Saat browser offline, permintaan sinkronisasi dijeda. Peristiwa koneksi pulih atau halaman kembali terlihat memicu pemeriksaan dengan jitter singkat. Pengguna mendapat status koneksi dan peringatan sebelum meninggalkan halaman dengan jawaban belum tersimpan. Penghitung waktu diperbarui setiap detik memakai waktu server dan jam monotonic browser.
- Konflik revisi, akun, atau izin tetap menghentikan penulisan. Sistem tidak menimpa jawaban dari perangkat lain secara otomatis. Pengiriman akhir tetap menunggu seluruh jawaban tersimpan; server memutuskan tenggat. Jawaban yang baru sampai setelah waktu habis tidak diterima.

## Batas pemulihan

Jawaban belum terkirim dipertahankan di memori halaman, bukan ditulis ke penyimpanan browser tanpa batas. Jangan tutup atau muat ulang halaman saat status belum tersimpan. Fitur ini tidak mengizinkan kuis offline melewati tenggat, tidak mengganti aturan penilaian, dan tidak memperluas cache privat. Jika sesi berakhir atau konflik terjadi, ikuti petunjuk akun/muat ulang; jawaban yang sudah diakui tetap berada di server.

## Validasi

Pengujian database sintetis melibatkan 132 peserta, gelombang 60/100/132, 30 soal, retry ID identik, revisi usang, penolakan lintas siswa, pengiriman akhir berulang, dan privasi kunci/nilai. Database lokal PGlite memakai satu koneksi dengan transaksi terserialisasi; ini memvalidasi integritas, **bukan bukti kapasitas jaringan 132 sesi produksi**.

Pengujian browser memakai komponen QuizAttempt asli dan API tiruan yang dapat membuang respons setelah commit, menahan autosave sambil pengguna mengedit, memutus/memulihkan koneksi, serta menimbulkan konflik perangkat lain. Jalankan `npm run test:quiz:reliability`.

Pemeriksaan regresi meliputi seluruh tes database, build/TypeScript, HTTP privat, dan tampilan 320/390/768/1440 piksel. Skenario retensi lama diperbaiki agar tanggal uji mengikuti Asia/Jakarta, sehingga tidak bergantung pada zona waktu mesin pengujian.

## Pengukuran produksi berikutnya

Script `scripts/testing/load-hosted.mjs` tetap tersedia untuk fixture sekolah sintetis dengan sesi Auth sungguhan. Jalankan hanya dengan fixture privat yang valid, awasi error dan Server-Timing, dan bersihkan fixture setelah selesai. Target p95 autosave di bawah 2 detik tetap harus diukur di produksi; jangan menyimpulkannya dari ukuran respons, tes lokal, atau status build. Perubahan ini tidak menambah layanan berbayar ataupun menaikkan paket Vercel/Supabase.
