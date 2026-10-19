# Template email akun

Email verifikasi dan pemulihan password menggunakan template bersama dengan isi yang berbeda sesuai tujuan. Pengirim ditampilkan sebagai **LMS Nurul Falah**, memakai alamat SMTP yang sudah dikonfigurasi.

Tersedia header identitas hijau, salam, judul dan petunjuk yang relevan, tombol utama, tautan cadangan, masa berlaku 15 menit/satu kali pakai, petunjuk memakai email terbaru, serta panduan jika penerima tidak meminta tindakan tersebut. Verifikasi menjelaskan kebutuhan login dan konfirmasi; pemulihan menjelaskan pengisian password baru dan login ulang.

Pesan dikirim sebagai multipart HTML + teks biasa. Layout menggunakan tabel presentasi, CSS inline, font bawaan, lebar fleksibel maksimal 600 px dan tombol yang mudah disentuh. Tidak ada gambar eksternal, skrip atau pelacak pembukaan email. Token dan alur pengiriman/outbox tetap sama; tautan di-escape untuk HTML tanpa mengubah token. URL berbahaya atau URL dengan kredensial ditolak.

Validasi: SMTP lokal memeriksa kedua jenis email dan format multipart; tes memeriksa token, encoding HTML, instruksi, dan URL aman. Delapan pemeriksaan Chromium mencakup dua template pada lebar 320, 390, 600, dan 900 px. Dukungan layout dasar disiapkan untuk klien email umum, tetapi pemeriksaan ini bukan pengujian setiap versi Gmail/Outlook/Apple Mail. Tidak ada email uji yang dikirim ke pengguna asli.
