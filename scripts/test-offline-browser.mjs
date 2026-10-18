import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
const base = process.env.LMS_OFFLINE_TEST_URL ?? "http://127.0.0.1:3210";
if (
  !["http://127.0.0.1:3210", "https://lms-nurul-falah.vercel.app"].includes(
    base,
  )
)
  throw new Error("Unexpected test target");
const server = base.startsWith("http:")
  ? spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3210",
      ],
      { stdio: "ignore" },
    )
  : null;
if (server) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/offline")).ok) break;
    } catch {}
    if (i === 99) {
      server.kill();
      throw new Error("Local production server not ready");
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/lib/offline/store";export * from "./src/lib/offline/readiness"',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "offlineTest",
  platform: "browser",
});
const proxyRaw = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY,
  proxy = proxyRaw ? new URL(proxyRaw) : null;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  ...(base.startsWith("https:") && proxy
    ? {
        proxy: {
          server: proxy.origin,
          username: decodeURIComponent(proxy.username),
          password: decodeURIComponent(proxy.password),
        },
      }
    : {}),
});
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "allow",
  }),
  page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("Browser:", m.text());
});
try {
  await page.goto(base + "/offline");
  console.log("START: shell installation");
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Service worker installation timeout")),
          15000,
        ),
      ),
    ]);
  });
  console.log("PASS: shell installed");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(async () => {
    const common = {
      owner: "synthetic-offline-user",
      school: "synthetic-school",
      course: "synthetic-course",
      expires_at: new Date(Date.now() + 1800000).toISOString(),
    };
    await window.offlineTest.ensureOfflineReady();
    await window.offlineTest.saveOffline({
      ...common,
      id: "material",
      kind: "material",
      content: {
        id: "m",
        title: "Materi offline sintetis",
        body: "Materi tetap terbaca tanpa jaringan.",
        links: [],
      },
    });
    await window.offlineTest.saveOffline({
      ...common,
      id: "draft",
      kind: "draft",
      content: {
        id: "t",
        title: "Draf offline sintetis",
        body: "Jawaban awal",
        links: [],
        formats: ["text"],
        revision: 0,
        request_id: crypto.randomUUID(),
      },
    });
  });
  await page.reload();
  console.log("START: seeded records");
  await page
    .getByRole("heading", { name: "Materi offline sintetis" })
    .waitFor();
  console.log("PASS: records shown online");
  await context.setOffline(true);
  server?.kill();
  console.log("START: offline reload (local server stopped)");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByText("Materi tetap terbaca tanpa jaringan.", { exact: true })
    .waitFor();
  console.log("PASS: material shown offline");
  console.log("START: draft edit");
  await page
    .getByLabel("Jawaban draf")
    .fill("Jawaban yang diubah tanpa jaringan");
  await page
    .getByRole("button", { name: "Simpan draf lokal", exact: true })
    .click();
  await page
    .getByText("Draf disimpan lokal, belum dikumpulkan.", { exact: true })
    .waitFor();
  console.log("PASS: draft saved");
  assert.equal(
    await page
      .getByRole("button", { name: "Kumpulkan saat online", exact: true })
      .isDisabled(),
    true,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(
    await page.getByLabel("Jawaban draf").inputValue(),
    "Jawaban yang diubah tanpa jaringan",
  );
  await page.goto(base + "/ruang-belajar", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Ruang offline", exact: true })
    .waitFor();
  await page
    .getByText("Materi tetap terbaca tanpa jaringan.", { exact: true })
    .waitFor();
  console.log("PASS: material shown offline");
  const paths = await page.evaluate(async () => {
    const entries = [];
    for (const key of await caches.keys())
      for (const r of await (await caches.open(key)).keys())
        entries.push(new URL(r.url).pathname);
    return entries;
  });
  assert.ok(paths.length > 1);
  assert.ok(
    paths.every((p) => p === "/offline" || p.startsWith("/_next/static/")),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await context.setOffline(false);
  // The server stays stopped; the service worker must still serve its cached shell.
  await page.reload();
  await page
    .getByRole("button", {
      name: "Hapus seluruh data offline perangkat",
      exact: true,
    })
    .click();
  await page.getByText(/Belum ada salinan yang dapat dibuka/).waitFor();
  assert.deepEqual(errors, []);
  const report = {
    date: new Date().toISOString(),
    target: base,
    scope:
      "Real service worker, encrypted local store and actual Next.js offline shell; local server stopped during offline checks; synthetic local records, no authorized server submit or real provider messages",
    passed: [
      "public_shell_install",
      "material_read_without_network",
      "draft_edit_save_and_reload_offline",
      "offline_submit_disabled",
      "protected_navigation_offline_fallback",
      "cache_allowlist_no_private_pages_or_api",
      "mobile_no_overflow",
      "local_clear",
    ],
    javascript_errors: errors,
  };
  await mkdir("docs/verification", { recursive: true });
  await writeFile(
    "docs/verification/offline-browser-latest.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("PASS: 8 real service worker / offline browser checks");
} catch (e) {
  console.error("FAILED:", e);
  console.error(
    "STATE:",
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  throw e;
} finally {
  await context.close();
  await browser.close();
  server?.kill();
}
