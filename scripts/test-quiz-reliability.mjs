import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { tmpdir } from "node:os";
const output = join(tmpdir(), "lms-ui-audit");
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
const errors = [];
let checks = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/?view=quiz&reliability=1");
  await p.getByLabel("Jawaban A", { exact: true }).check();
  await context.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event("offline")));
  await p.getByLabel("Jawaban B", { exact: true }).check();
  await p
    .getByText(/Koneksi terputus/)
    .first()
    .waitFor();
  checks++;
  await p.evaluate(() => {
    window.__loseAck = true;
  });
  await context.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await p
    .getByText("Semua jawaban tersimpan.", { exact: true })
    .waitFor({ timeout: 30000 });
  const result = await p.evaluate(() => ({
    server: window.__reliableServer,
    requests: window.__requests.filter((r) => r.path === "/api/kuis/answers"),
  }));
  assert.equal(result.server.revision, 1);
  assert.equal(result.server.answers[0].choice, 1);
  assert.ok(result.requests.length >= 2);
  assert.equal(result.requests[0].request_id, result.requests[1].request_id);
  checks++;
  await p.evaluate(() => {
    window.__holdAnswer = true;
  });
  await p.getByLabel("Jawaban A", { exact: true }).check();
  await p.waitForFunction(() => window.__reliableServer.revision === 2);
  await p.getByLabel("Jawaban B", { exact: true }).check();
  await p.evaluate(() => {
    window.__holdAnswer = false;
    window.__releaseAnswer();
  });
  await p
    .getByText("Semua jawaban tersimpan.", { exact: true })
    .waitFor({ timeout: 20000 });
  assert.equal(
    await p.evaluate(() => window.__reliableServer.answers[0].choice),
    1,
  );
  assert.equal(await p.evaluate(() => window.__reliableServer.revision), 3);
  checks++;
  p.on("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Selesaikan kuis", exact: true }).click();
  await p.getByRole("heading", { name: "Hasil kuis", exact: true }).waitFor();
  checks++;
  await p.goto(base + "/?view=quiz&reliability=1");
  await p.getByLabel("Jawaban A", { exact: true }).waitFor();
  await p.evaluate(() => window.__reliableServer.revision++);
  await p.getByLabel("Jawaban A", { exact: true }).check();
  await p
    .getByRole("button", { name: "Muat ulang jawaban server", exact: true })
    .waitFor({ timeout: 15000 });
  assert.equal(
    await p.getByLabel("Jawaban B", { exact: true }).isDisabled(),
    true,
  );
  checks++;
  await p.goto(base + "/?view=quiz&reliability=1");
  await p.getByLabel("Jawaban A", {exact:true}).waitFor();
  await context.setOffline(true);await p.evaluate(()=>window.dispatchEvent(new Event("offline")));
  await context.setOffline(false);await p.evaluate(()=>window.dispatchEvent(new Event("online")));
  await p.waitForFunction(()=>window.__requests.some(r=>r.path==="/api/kuis/attempt"));
  await p.getByText("Semua jawaban tersimpan.",{exact:true}).waitFor();checks++;
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks,
      errors,
      scope:
        "Real QuizAttempt component; synthetic API with lost acknowledgement and connection recovery",
    }),
  );
} finally {
  await browser.close();
  server.close();
}
