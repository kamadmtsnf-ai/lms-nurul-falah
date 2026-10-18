import { timingSafeEqual } from "node:crypto";
import { retentionAdapter } from "@/lib/attachment-retention/server";
import { processRetention } from "@/lib/attachment-retention/worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return reply({ ok: false, message: "Penjadwal belum dikonfigurasi." }, 503);
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from("Bearer " + secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return reply({ ok: false }, 401);
  try {
    const adapter = retentionAdapter(),
      schools = (await adapter.command("schools", {})) as string[];
    const started = Date.now();
    let deleted = 0,
      failed = 0;
    for (const school of schools) {
      if (Date.now() - started > 65000) break;
      const result = await processRetention(adapter, school, {
        limit: 10,
        budgetMs: Math.max(0, 65000 - (Date.now() - started)),
      });
      deleted += result.deleted;
      failed += result.failed;
    }
    return reply({ ok: failed === 0, deleted, failed }, failed ? 503 : 200);
  } catch {
    console.error("Pekerjaan terjadwal retensi gagal; antrean dipertahankan");
    return reply({ ok: false, message: "Periksa antrean retensi." }, 503);
  }
}
