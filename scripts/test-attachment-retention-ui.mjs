import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { tmpdir } from "node:os";
const output = join(tmpdir(), "lms-attachment-retention-ui");
await mkdir(output, { recursive: true });
await build({
  entryPoints: ["tests/ui/fixture.tsx"],
  bundle: true,
  outfile: join(output, "fixture.js"),
  format: "iife",
  jsx: "automatic",
  plugins: [
    {
      name: "next-link-fixture",
      setup(b) {
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({
          path: args.path,
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "next/navigation"
              ? 'export function usePathname(){const view=new URLSearchParams(location.search).get("view");return ({dashboard:"/ruang-belajar",academic:"/admin/akademik",users:"/admin/pengguna",monitoring:"/pemantauan",profile:"/profil",security:"/keamanan",mfa:"/verifikasi-keamanan",course:"/pembelajaran/fixture"})[view]||"/akademik"}'
              : 'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',
          resolveDir: process.cwd(),
          loader: "js",
        }));
      },
    },
  ],
});
const cssFiles = (
  await readdir(".next/static/css", { recursive: true })
).filter((f) => f.endsWith(".css"));
const css = (
  await Promise.all(
    cssFiles.map((f) => readFile(join(".next/static/css", f), "utf8")),
  )
).join("\n");
const pdfDoc = await PDFDocument.create();
pdfDoc.addPage([300, 400]);
const previewPdf = await pdfDoc.save();
const server = createServer(async (req, res) => {
  if (req.url === "/preview-file.pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.end(previewPdf);
    return;
  }
  if (
    req.url === "/preview-image.png" ||
    req.url?.startsWith("/api/profil/foto")
  ) {
    res.setHeader("Content-Type", "image/png");
    res.end(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    return;
  }
  res.setHeader(
    "Content-Type",
    req.url === "/fixture.js"
      ? "text/javascript"
      : req.url === "/style.css"
        ? "text/css"
        : "text/html",
  );
  res.end(
    req.url === "/fixture.js"
      ? await readFile(join(output, "fixture.js"))
      : req.url === "/style.css"
        ? css
        : '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const results = [],
  errors = [];
let checks = 0;
async function check(page, label) {
  await page.waitForTimeout(90);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: innerWidth,
    offenders: [...document.querySelectorAll("main *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 &&
          (r.left < -1 || r.right > innerWidth + 1) &&
          !e.closest(".overflow-auto,.overflow-x-auto")
        );
      })
      .slice(0, 8)
      .map((e) => e.tagName + "." + e.className),
  }));
  assert.ok(
    overflow.doc <= overflow.view + 1,
    `${label}: page overflow ${JSON.stringify(overflow)}`,
  );
  assert.deepEqual(overflow.offenders, [], `${label}: clipped element`);
  checks++;
}
try {
  for (const width of [320, 390, 768, 1440]) {
    const p = await browser.newPage({ viewport: { width, height: 900 } });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/?view=attachment-retention");
    await p
      .getByText("Mode pratinjau. Penghapusan otomatis nonaktif.", {
        exact: true,
      })
      .waitFor();
    await check(p, "retention/default/" + width);
    assert.equal(
      await p
        .getByRole("button", { name: "Jalankan satu batch", exact: true })
        .isDisabled(),
      true,
    );
    await p
      .getByRole("button", { name: "Pertahankan berkas", exact: true })
      .first()
      .click();
    await p
      .getByRole("button", { name: "Lepas pelindungan", exact: true })
      .first()
      .waitFor();
    await check(p, "retention/hold/" + width);
    await p
      .getByRole("button", { name: "Catat verifikasi backup", exact: true })
      .first()
      .click();
    await p.getByRole("dialog").waitFor();
    await check(p, "retention/backup-modal/" + width);
    await p
      .getByLabel("Referensi backup", { exact: true })
      .fill("Arsip sintetis diuji restore");
    await p
      .getByLabel(
        "Saya telah memverifikasi backup berkas ini dan akses pemulihannya.",
        { exact: true },
      )
      .check();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Simpan pernyataan backup", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p.getByLabel("Aktifkan pemrosesan otomatis", { exact: true }).check();
    await p
      .getByRole("button", { name: "Simpan kebijakan", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await check(p, "retention/settings-confirm/" + width);
    await p
      .getByLabel("Ketik AKTIFKAN RETENSI", { exact: true })
      .fill("AKTIFKAN RETENSI");
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Simpan kebijakan", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p
      .getByRole("button", { name: "Jalankan satu batch", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await check(p, "retention/run-confirm/" + width);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Jalankan batch", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await p
        .getByRole("button", { name: "Lampiran terhapus.pdf", exact: true })
        .count(),
      0,
    );
    await p
      .getByText("Lampiran telah dihapus sesuai kebijakan penyimpanan.", {
        exact: true,
      })
      .waitFor();
    await check(p, "retention/tombstone/" + width);
    await p.screenshot({
      path: join(output, "retention-" + width + ".png"),
      fullPage: true,
    });
    await p
      .getByRole("button", { name: "Lampiran berikutnya", exact: true })
      .click();
    await p
      .getByText("Belum ada lampiran pada halaman ini.", { exact: true })
      .waitFor();
    await check(p, "retention/empty-page/" + width);
    results.push({ width, status: "passed" });
    await p.close();
  }
  assert.deepEqual(errors, []);
  const report = {
    checks,
    viewports: results,
    javascriptErrors: errors,
    scope:
      "Real React components, synthetic API; database lifecycle tested separately",
  };
  await mkdir("docs/verification", { recursive: true });
  await writeFile(
    "docs/verification/attachment-retention-ui.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  server.close();
}
