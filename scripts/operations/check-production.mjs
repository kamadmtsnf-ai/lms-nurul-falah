import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
export async function probe(fetcher = fetch) {
  const base = "https://lms-nurul-falah.vercel.app";
  const started = Date.now();
  const health = await fetcher(base + "/api/health", {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (health.status !== 200)
    throw new Error("Liveness gagal: HTTP " + health.status);
  const body = await health.json();
  if (body.status !== "ok" || body.service !== "lms-nurul-falah")
    throw new Error("Identitas layanan tidak sesuai.");
  const csrf = await fetcher(base + "/api/kuis/answers", {
    method: "POST",
    redirect: "error",
    headers: {
      Origin: "https://invalid.example",
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(20000),
  });
  if (
    csrf.status !== 403 ||
    !csrf.headers.get("cache-control")?.includes("no-store")
  )
    throw new Error("Proteksi Origin/cache tidak sesuai.");
  const anonymous = await fetcher(base + "/api/kuis/attempt", {
    method: "POST",
    redirect: "error",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      course: "11111111-1111-4111-8111-111111111111",
      target: "11111111-1111-4111-8111-111111111111",
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (
    anonymous.status !== 401 ||
    !anonymous.headers.get("cache-control")?.includes("no-store")
  )
    throw new Error("Proteksi akses anonim/cache tidak sesuai.");
  return {
    checked_at: new Date().toISOString(),
    liveness: "passed",
    anonymous_access: "denied",
    csrf: "denied",
    elapsed_ms: Date.now() - started,
    database_storage_smtp_readiness: "not_proven_by_public_probe",
  };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await probe();
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY)
      await writeFile(
        process.env.GITHUB_STEP_SUMMARY,
        "Pemeriksaan publik lulus. Ini bukan bukti kesiapan database, Storage, SMTP, atau kapasitas kuis.\n",
        { flag: "a" },
      );
  } catch {
    console.error(
      "Pemeriksaan operasional gagal. Lihat runbook docs/26-Operasional-Produksi.md; jangan tampilkan token atau data pengguna.",
    );
    process.exitCode = 1;
  }
}
