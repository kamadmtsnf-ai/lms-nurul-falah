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
              ? 'export function usePathname(){const view=new URLSearchParams(location.search).get("view");return ({dashboard:"/ruang-belajar",academic:"/admin/akademik",users:"/admin/pengguna",monitoring:"/pemantauan",course:"/pembelajaran/fixture"})[view]||"/akademik"}'
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
  if (req.url === "/preview-image.png") {
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
    const page = await browser.newPage({
      viewport: { width, height: width < 600 ? 740 : 900 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    for (const view of [
      "auth",
      "dashboard",
      "academic",
      "users",
      "daily",
      "quiz",
      "monitoring",
      "retention",
      "development",
      "offline",
      "course",
    ]) {
      await page.goto(`${base}/?view=${view}`);
      await check(page, `${view}/${width}`);
      if (view === "auth") {
        await page.getByRole("button", { name: "Keluar", exact: true }).click();
        await page.getByRole("dialog", { name: "Keluar dari akun?" }).waitFor();
        await check(page, `logout-modal/${width}`);
        if (width === 320)
          await page.screenshot({
            path: join(output, "logout-modal-320.png"),
            fullPage: true,
          });
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(
          await page.evaluate(
            () =>
              window.__requests.filter((r) =>
                String(r.path).endsWith("/logout"),
              ).length,
          ),
          0,
        );
      }

      if (view === "academic") {
        for (const name of [
          "Kelas / rombel",
          "Guru piket",
          "Template & impor Excel",
        ]) {
          await page.getByRole("button", { name, exact: true }).click();
          await check(page, `academic/${name}/${width}`);
        }
      }
      if (view === "daily") {
        await page
          .getByRole("button", { name: "Tampilkan absensi", exact: true })
          .click();
        await check(page, `daily/loaded/${width}`);
        await page
          .getByRole("tab", { name: "Rekap harian", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Tampilkan rekap", exact: true })
          .click();
        await check(page, `daily/report/${width}`);
      }
      if (view === "development") {
        await page
          .getByRole("button", { name: "Kelola banyak sekolah", exact: true })
          .click();
        await page.waitForTimeout(90);
        assert.equal(
          await page
            .getByLabel("Izinkan pembuatan/penautan sekolah")
            .isChecked(),
          true,
        );
        await check(page, `platform/${width}`);
      }
      if (view === "course") {
        for (const name of [
          "Pertemuan & absensi",
          "Tugas",
          "Nilai tugas",
          "Kuis",
          "Laporan",
          "Lanjutan",
          "Pengembangan",
        ]) {
          await page.getByRole("tab", { name, exact: true }).click();
          await check(page, `course/${name}/${width}`);
          if (name === "Laporan") {
            for (const sub of ["Hasil kuis", "Aktivitas pengampu"]) {
              await page.getByRole("tab", { name: sub, exact: true }).click();
              await check(page, `report/${sub}/${width}`);
            }
          }
          if (name === "Lanjutan") {
            for (const sub of [
              "Tugas lanjutan",
              "Nilai akhir berbobot",
              "Bank soal",
              "Notifikasi kegiatan",
            ]) {
              await page
                .getByRole("button", { name: sub, exact: true })
                .click();
              await check(page, `advanced/${sub}/${width}`);
            }
          }
        }
      }
    }
    await page.goto(`${base}/?view=course&empty=1`);
    await check(page, `empty/${width}`);
    await page.goto(`${base}/?view=course&student=1`);
    await page.getByRole("tab", { name: "Tugas", exact: true }).click();
    await check(page, `student-submit/${width}`);
    await page.getByRole("tab", { name: "Lanjutan", exact: true }).click();
    await page
      .getByRole("button", { name: "Tugas lanjutan", exact: true })
      .click();
    await check(page, `student-group/${width}`);
    await page.setViewportSize({ width: 740, height: 390 });
    await check(page, `landscape/${width}`);
    await page.close();
    results.push({ width, status: "passed" });
  }
  for (const width of [320, 390, 768, 1440]) {
    const previewPage = await browser.newPage({
      viewport: { width, height: 844 },
    });
    previewPage.on("pageerror", (e) => errors.push(e.message));
    await previewPage.goto(`${base}/?view=course&preview=1`);
    assert.equal(
      await previewPage
        .getByRole("button", {
          name: "Lihat lampiran Dokumen Word.docx",
          exact: true,
        })
        .count(),
      0,
    );
    await previewPage
      .getByRole("button", {
        name: "Lihat lampiran Gambar contoh.png",
        exact: true,
      })
      .click();
    await previewPage
      .getByRole("dialog")
      .getByRole("img", { name: "Gambar contoh.png", exact: true })
      .waitFor();
    await previewPage.waitForFunction(() => {
      const img = document.querySelector("dialog[open] img");
      return img?.complete && img.naturalWidth > 0;
    });
    await check(previewPage, `image-preview/${width}`);
    await previewPage.keyboard.press("Escape");
    await previewPage
      .getByRole("button", { name: /^Lihat lampiran/ })
      .last()
      .click();
    await previewPage.getByRole("dialog").locator("iframe").waitFor();
    await check(previewPage, `pdf-preview/${width}`);
    await previewPage
      .getByRole("button", { name: "Tutup pratinjau", exact: true })
      .click();
    await previewPage
      .getByRole("tab", { name: "Nilai tugas", exact: true })
      .click();
    const filter = previewPage.getByLabel("Filter judul tugas", {
      exact: true,
    });
    assert.equal(await previewPage.locator("tbody tr").count(), 264);
    await filter.selectOption("task-two");
    assert.equal(await previewPage.locator("tbody tr").count(), 132);
    assert.equal(
      await previewPage
        .locator("tbody tr")
        .first()
        .locator("td")
        .nth(1)
        .textContent(),
      "Tugas pembanding",
    );
    await check(previewPage, `grade-title-filter/${width}`);
    await filter.selectOption("");
    assert.equal(await previewPage.locator("tbody tr").count(), 264);
    await previewPage.close();
  }
  for (const width of [320, 390, 768, 1440]) {
    const tablePage = await browser.newPage({
      viewport: { width, height: 900 },
    });
    tablePage.on("pageerror", (e) => errors.push(e.message));
    await tablePage.goto(`${base}/?view=course&tables=1&realistic=1`);
    async function inspectTable(label) {
      const region = tablePage.getByRole("region", {
        name: label,
        exact: true,
      });
      await region.waitFor();
      await region.scrollIntoViewIfNeeded();
      const before = await region.evaluate((el) => {
        const head = el.querySelector("thead th"),
          a = el.querySelector("tbody tr:nth-child(2) td"),
          b = el.querySelector("tbody tr:nth-child(3) td");
        return {
          overflowY: el.scrollHeight > el.clientHeight,
          overflowX: el.scrollWidth > el.clientWidth,
          head: head.textContent,
          stripeA: getComputedStyle(a).backgroundColor,
          stripeB: getComputedStyle(b).backgroundColor,
        };
      });
      assert.equal(before.overflowY, true, `${label}: vertical scroll`);
      assert.equal(before.head, "Siswa");
      assert.notEqual(before.stripeA, before.stripeB, `${label}: zebra`);
      if (width < 768)
        assert.equal(before.overflowX, true, `${label}: horizontal scroll`);
      await region.evaluate((el) => {
        el.scrollTop = 180;
        el.scrollLeft = el.scrollWidth;
      });
      await tablePage.waitForTimeout(80);
      const position = await region.evaluate((el) => {
        const box = el.getBoundingClientRect(),
          head = el.querySelector("thead th").getBoundingClientRect(),
          cell = el.querySelector("tbody td").getBoundingClientRect();
        return {
          top: head.top - box.top,
          left: cell.left - box.left,
          headerLeft: head.left - box.left,
          zHeader: +getComputedStyle(el.querySelector("thead th")).zIndex,
          zCell: +getComputedStyle(el.querySelector("tbody td")).zIndex,
        };
      });
      assert.ok(
        Math.abs(position.top - 1) < 2,
        `${label}: sticky header ${JSON.stringify(position)}`,
      );
      assert.ok(
        Math.abs(position.left - 1) < 2,
        `${label}: sticky student ${JSON.stringify(position)}`,
      );
      assert.ok(Math.abs(position.headerLeft - 1) < 2, `${label}: corner`);
      assert.ok(position.zHeader > position.zCell);
      await check(tablePage, `${label}/scrolled/${width}`);
      await region.evaluate((el) => {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      });
    }
    await tablePage
      .getByRole("tab", { name: "Pertemuan & absensi", exact: true })
      .click();
    await inspectTable("Tabel rekap kehadiran");
    await tablePage
      .getByRole("tab", { name: "Nilai tugas", exact: true })
      .click();
    await inspectTable("Tabel nilai tugas");
    await tablePage.getByRole("tab", { name: "Laporan", exact: true }).click();
    await inspectTable("Tabel ringkasan siswa");
    await tablePage
      .getByRole("tab", { name: "Hasil kuis", exact: true })
      .click();
    await inspectTable("Tabel hasil kuis");
    await tablePage.setViewportSize({ width: 740, height: 390 });
    await inspectTable("Tabel hasil kuis");
    await tablePage.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/?view=course&preview=1`);
  await page.evaluate(() => {
    window.__previewFail = true;
  });
  await page
    .getByRole("button", {
      name: "Lihat lampiran Gambar contoh.png",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Berkas tidak dapat diakses" })
    .waitFor();
  await page.evaluate(() => {
    window.__previewFail = false;
  });
  await page
    .getByRole("button", { name: "Muat ulang pratinjau", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("img").waitFor();
  await page
    .getByRole("button", { name: "Tutup pratinjau", exact: true })
    .click();
  checks++;
  await page.goto(`${base}/?view=auth`);
  await page.evaluate(() => {
    window.__fail = true;
  });
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Keluar dari akun?" });
  await dialog.waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__requests.filter((r) => String(r.path).endsWith("/logout"))
          .length,
    ),
    0,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Keluar", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page.getByRole("button", { name: "Ya, keluar", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.match(
    await page.getByRole("alert").textContent(),
    /respons yang valid/,
  );
  checks++;
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.goto(`${base}/?view=course`);
  await page
    .getByRole("button", { name: /^Hapus lampiran/ })
    .first()
    .click();
  await check(page, "attachment-confirm/390");
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () =>
        window.__requests.filter((r) => String(r.path).endsWith("/file-remove"))
          .length,
    ),
    0,
  );
  await page
    .getByRole("button", { name: /^Hapus lampiran/ })
    .first()
    .click();
  await page.evaluate(() => {
    window.__removeFail = true;
  });
  await page
    .getByRole("button", { name: "Hapus lampiran", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  await page.evaluate(() => {
    window.__removeFail = false;
  });
  await page
    .getByRole("button", { name: "Hapus lampiran", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByRole("button", { name: /^Hapus lampiran/ }).count(),
    0,
  );
  checks++;
  await page.getByRole("tab", { name: "Tugas", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Hapus lampiran Panduan tugas.pdf",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Hapus lampiran", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByRole("button", { name: /^Hapus lampiran/ }).count(),
    0,
  );
  await page.getByLabel("Pilih file lampiran", { exact: true }).setInputFiles({
    name: "trop-grand.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(3000001),
  });
  await page.getByRole("alert").filter({ hasText: "melebihi batas" }).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__requests.filter((r) =>
          String(r.path).endsWith("/upload-start"),
        ).length,
    ),
    0,
  );
  checks++;
  await page.goto(`${base}/?view=course&student=1`);
  assert.equal(
    await page.getByRole("button", { name: /^Hapus lampiran/ }).count(),
    0,
  );
  checks++;
  await page.goto(`${base}/?view=auth`);
  await page.locator("input[name=password]").fill("password-uji");
  await page
    .getByRole("button", { name: "Tampilkan password", exact: true })
    .click();
  assert.equal(
    await page.locator("input[name=password]").getAttribute("type"),
    "text",
  );
  await page
    .getByRole("button", { name: "Sembunyikan password", exact: true })
    .click();
  assert.equal(
    await page.locator("input[name=password]").getAttribute("type"),
    "password",
  );
  checks++;
  await page.goto(`${base}/?view=course&channels=1`);
  await page.getByRole("tab", { name: "Pengembangan", exact: true }).click();
  await page
    .getByRole("button", { name: "Antrekan ke kanal", exact: true })
    .click();
  await page
    .getByText(
      "Antrean berisi 3 tujuan. Pesan belum dikirim; gunakan tombol Kirim batch untuk melanjutkan.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: "Kirim batch", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Kirim notifikasi sekarang?" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__requests.filter((r) =>
          String(r.path).endsWith("/channel-send"),
        ).length,
    ),
    0,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Batal", exact: true })
    .click();
  await page.getByRole("button", { name: "Kirim batch", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kirim batch", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Diterima penyedia 2; tidak pasti 1" })
    .waitFor();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Kirim batch", exact: true })
      .isDisabled(),
    true,
  );
  checks++;
  await page.goto(`${base}/?view=dashboard&student=1`);
  assert.equal(
    await page.getByLabel("Sekolah aktif", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Manajemen pengguna", exact: false })
      .count(),
    0,
  );
  checks++;
  await page.goto(`${base}/?view=dashboard`);
  assert.equal(
    await page
      .getByRole("link", { name: /Ubah password/ })
      .getAttribute("href"),
    "/ganti-password?from=ruang-belajar",
  );
  await page.getByLabel("Sekolah aktif", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Navigasi utama" })
      .locator('a[aria-current="page"]')
      .textContent(),
    "Ruang akun",
  );
  checks++;
  await page.goto(`${base}/?view=monitoring`);
  await page
    .getByRole("button", { name: "Siswa berikutnya", exact: true })
    .click();
  await page.waitForTimeout(150);
  const offsets = await page.evaluate(() =>
    window.__requests
      .filter((r) => String(r.path).endsWith("weighted-report"))
      .map((r) => r.offset ?? 0),
  );
  assert.ok(
    offsets.slice(-2).every((x) => x === 100),
    JSON.stringify(offsets),
  );
  checks++;

  await page.goto(`${base}/?view=course`);
  await page.getByRole("tab", { name: "Materi", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "Pertemuan & absensi", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  checks++;
  await page.getByRole("tab", { name: "Lanjutan", exact: true }).click();
  await page.getByRole("button", { name: "Bank soal", exact: true }).click();
  await page.evaluate(() => {
    window.__validImport = true;
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "valid.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("fixture"),
  });
  await page
    .getByRole("button", { name: "Konfirmasi simpan 1 soal" })
    .waitFor();
  await page.evaluate(() => {
    window.__validImport = false;
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("invalid"),
  });
  await page.getByText("Baris 2 tidak valid", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Konfirmasi simpan 1 soal" })
      .count(),
    0,
  );
  checks++;
  await page.evaluate(() => window.__seedOffline());
  await page.goto(`${base}/?view=offline`);
  await page
    .getByRole("textbox", { name: "Jawaban draf" })
    .fill("Jawaban yang sedang diubah");
  assert.equal(
    await page
      .getByRole("button", { name: "Kumpulkan saat online", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Simpan draf lokal", exact: true })
    .click();
  await page.waitForTimeout(100);
  assert.equal(
    await page
      .getByRole("button", { name: "Kumpulkan saat online", exact: true })
      .isDisabled(),
    false,
  );
  checks++;
  await page.goto(`${base}/?view=quiz`);
  await page.locator("input[type=radio]").first().check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("link", { name: "Kembali ke pembelajaran", exact: true })
    .click();
  assert.match(page.url(), /view=quiz/);
  checks++;
  await page.goto(`${base}/?view=course&student=1`);
  await page.getByRole("tab", { name: "Tugas", exact: true }).click();
  await page.screenshot({
    path: join(output, "mobile-assignment.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, [], "Browser JavaScript errors");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/?view=dashboard&realistic=1`);
    await page.screenshot({
      path: join(output, `dashboard-${width}.png`),
      fullPage: true,
    });
    await page.goto(`${base}/?view=auth&realistic=1`);
    await page.screenshot({
      path: join(output, `auth-${width}.png`),
      fullPage: true,
    });
  }
  const data = {
    checks,
    viewports: results,
    javascriptErrors: errors,
    scope:
      "Real React components with synthetic data and mocked API; does not replace authenticated live acceptance tests.",
  };
  await mkdir("docs/verification", { recursive: true });
  await writeFile(
    "docs/verification/ui-audit-results.json",
    JSON.stringify(data, null, 2) + "\n",
  );
  console.log(JSON.stringify(data));
} catch (e) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      console.error(
        "UI failure",
        page.url(),
        errors,
        (await page.locator("body").innerText()).slice(0, 2500),
      );
      await page.screenshot({
        path: join(output, "failure.png"),
        fullPage: true,
      });
    }
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
