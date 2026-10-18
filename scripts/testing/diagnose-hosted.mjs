import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
const file = process.env.LMS_BROWSER_FIXTURE;
if (
  !file ||
  path.resolve(file).startsWith(process.cwd() + path.sep) ||
  statSync(file).mode & 0o077
)
  throw new Error("Private synthetic fixture required.");
const c = JSON.parse(readFileSync(file, "utf8"));
if (
  c.ack !== "synthetic-school-only" ||
  !c.prefix.startsWith("lms6_") ||
  !c.diagnosticCookies
)
  throw new Error("Synthetic authenticated control session required.");
const base = "https://lms-nurul-falah.vercel.app";
const result = {
  started_at: new Date().toISOString(),
  target: base,
  scope: "Small control sample, not a 60/100/132-session capacity test",
  runtime: process.version,
  proxy_configured: !!(process.env.HTTPS_PROXY || process.env.HTTP_PROXY),
  samples: [],
};
async function request(kind, mode, index) {
  const start = performance.now();
  const response = await fetch(
    base + (kind === "health" ? "/api/health" : "/api/kuis/list"),
    kind === "health"
      ? { cache: "no-store", signal: AbortSignal.timeout(45000) }
      : {
          method: "POST",
          headers: {
            Origin: base,
            "Content-Type": "application/json",
            Cookie: c.diagnosticCookies,
          },
          body: JSON.stringify({ course: c.course }),
          signal: AbortSignal.timeout(45000),
        },
  );
  await response.arrayBuffer();
  const timing = Object.fromEntries(
    [
      ...String(response.headers.get("server-timing") ?? "").matchAll(
        /([a-z]+);dur=([0-9.]+)/g,
      ),
    ].map((m) => [m[1], Number(m[2])]),
  );
  result.samples.push({
    kind,
    mode,
    index,
    status: response.status,
    client_ms: Math.round((performance.now() - start) * 100) / 100,
    handler_ms: timing,
    edge: response.headers.get("x-vercel-id")?.split("::")[0] ?? null,
  });
  if (!response.ok)
    throw new Error("Control request failed HTTP " + response.status);
}
try {
  for (const kind of ["health", "authenticated_list"]) {
    for (let i = 0; i < 5; i++) await request(kind, "sequential", i);
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => request(kind, "concurrent", i)),
    );
    console.log("Completed control:", kind);
  }
  result.finished_at = new Date().toISOString();
} finally {
  mkdirSync("docs/verification", { recursive: true });
  writeFileSync(
    "docs/verification/stage6-latency-control-latest.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    samples: result.samples.length,
    health_client_range: result.samples
      .filter((s) => s.kind === "health")
      .map((s) => s.client_ms),
    authenticated_client_range: result.samples
      .filter((s) => s.kind !== "health")
      .map((s) => s.client_ms),
    handler_total_range: result.samples
      .filter((s) => s.handler_ms.total !== undefined)
      .map((s) => s.handler_ms.total),
  }),
);
process.exit(0);
