"use client";
/** Saving a draft is useful only if its public reader shell is installed. */
export async function ensureOfflineReady() {
  if (!("serviceWorker" in navigator) || !("caches" in window))
    throw new Error(
      "Browser ini belum mendukung ruang offline. Gunakan browser terbaru melalui HTTPS.",
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        if (registration.waiting || registration.installing)
          throw new Error(
            "Pembaruan ruang offline sedang disiapkan. Selesaikan draf Anda, lalu tutup tab LMS lain dan buka kembali halaman ini saat online.",
          );
      })
      .then(async () => {
        if (
          !(await (await caches.open("lms-public-shell-v3")).match("/offline"))
        )
          throw new Error(
            "Halaman offline belum tersimpan. Tetap online sebentar, lalu coba kembali.",
          );
      });
    await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Persiapan offline belum selesai. Tetap online lalu coba kembali.",
              ),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
