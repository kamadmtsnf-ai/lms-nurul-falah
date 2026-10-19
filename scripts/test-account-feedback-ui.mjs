import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { tmpdir } from "node:os";
const output = join(tmpdir(), "lms-account-feedback-ui");
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
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?view=verify-feedback`);
  await page.getByLabel('Email pribadi atau wali').fill('wali@');
  await page.getByRole('button',{name:'Kirim tautan verifikasi'}).click();
  await page.getByRole('alert').filter({hasText:'Email yang Anda input tidak valid'}).waitFor();checks++;
  await page.getByLabel('Email pribadi atau wali').fill('wali@example.com');
  await page.getByRole('button',{name:'Kirim tautan verifikasi'}).click();
  await page.getByRole('status').filter({hasText:'Email verifikasi berhasil dikirim ke wali@example.com'}).waitFor();checks++;
  await check(page,'email feedback');
  await page.goto(`${base}/?view=verify-feedback&mailfail=1`);
  await page.getByLabel('Email pribadi atau wali').fill('wali@example.com');
  await page.getByRole('button',{name:'Kirim tautan verifikasi'}).click();
  await page.getByRole('alert').filter({hasText:'Email belum berhasil dikirim'}).waitFor();checks++;
  await page.goto(`${base}/?view=users&userfilters=1`);
  const reset=page.getByRole('button',{name:/^Reset password /}).first();await reset.click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByRole('button',{name:'Batal',exact:true}).click();await dialog.waitFor({state:'hidden'});checks++;
  await reset.click();await dialog.getByRole('button',{name:'Ya, reset password'}).click();await dialog.waitFor({state:'hidden'});
  await page.getByText('Password pengguna berhasil direset menjadi 12345678.',{exact:false}).waitFor();checks++;
  const req=await page.evaluate(()=>window.__requests.filter(x=>String(x.path).endsWith('/admin-reset-password')));
  assert.equal(req.length,1);assert.equal(req[0].confirmation,'RESET PASSWORD');assert.ok(req[0].target);checks++;
  await check(page,'user reset');
  await page.goto(`${base}/?view=users&userfilters=1&resetfail=1`);await page.getByRole('button',{name:/^Reset password /}).first().click();await dialog.getByRole('button',{name:'Ya, reset password'}).click();await dialog.getByRole('alert').filter({hasText:'Reset password belum berhasil'}).waitFor();checks++;
  await check(page,'reset failure dialog');
  await page.screenshot({path:join(output,`reset-${width}.png`),fullPage:true});await page.close();results.push({width,status:'passed'});
 }
 assert.deepEqual(errors,[]);const report={checks,viewports:results,javascriptErrors:errors,scope:'Real components; synthetic API. Database authorization tested separately.'};
 await writeFile('docs/verification/account-feedback-ui.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();server.close();}
