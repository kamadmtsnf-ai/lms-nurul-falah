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
    async function inspectTable(label, heading = "Siswa") {
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
      assert.equal(before.head, heading);
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
    await tablePage.goto(`${base}/?view=daily&tables=1&realistic=1`);
    await tablePage
      .getByRole("button", { name: "Tampilkan absensi", exact: true })
      .click();
    await inspectTable("Tabel pencatatan absensi");
    await tablePage
      .getByRole("tab", { name: "Rekap harian", exact: true })
      .click();
    await tablePage
      .getByRole("button", { name: "Tampilkan rekap", exact: true })
      .click();
    await inspectTable("Tabel rekap absensi harian");
    await tablePage.goto(`${base}/?view=course&tables=1&realistic=1`);
    await tablePage.getByRole("tab", { name: "Lanjutan", exact: true }).click();
    await tablePage
      .getByRole("button", { name: "Nilai akhir berbobot", exact: true })
      .click();
    await inspectTable("Tabel nilai berbobot");
    await tablePage
      .getByRole("button", { name: "Nilai Akhir Berbobot", exact: true })
      .click();
    await inspectTable("Tabel nilai berbobot");
    await tablePage.goto(`${base}/?view=academic&tables=1&realistic=1`);
    await tablePage
      .getByRole("button", { name: "Mata pelajaran", exact: true })
      .click();
    await inspectTable("Tabel Mata pelajaran", "Kode mapel");
    await tablePage
      .getByRole("button", { name: "Template & impor Excel", exact: true })
      .click();
    await tablePage.locator('input[type="file"]').setInputFiles({
      name: "uji.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("synthetic preview fixture"),
    });
    await tablePage
      .getByRole("button", { name: "Periksa pratinjau", exact: true })
      .click();
    await inspectTable("Tabel pratinjau impor Excel", "username");
    await tablePage.close();
  }
  for (const width of [320, 390, 768, 1440]) {
    const p = await browser.newPage({ viewport: { width, height: 900 } });
    p.on("pageerror", (e) => errors.push(e.message));
    for (const role of ["manager", "student"]) {
      await p.goto(
        `${base}/?view=flow${role === "student" ? "&student=1&flowClosed=1" : ""}`,
      );
      await p
        .getByRole("heading", { name: "Tujuan pembelajaran (TP)", exact: true })
        .waitFor();
      for (const name of [
        "Tujuan pembelajaran",
        "Ketercapaian",
        "Remedial & pengayaan",
        "Riwayat & finalisasi",
      ]) {
        await p.getByRole("button", { name, exact: true }).click();
        await check(p, `academic-flow/${role}/${name}/${width}`);
      }
      if (role === "student") {
        assert.equal(
          await p
            .getByRole("button", { name: "Kunci nilai final", exact: true })
            .count(),
          0,
        );
        await p
          .getByRole("button", { name: "Remedial & pengayaan", exact: true })
          .click();
        assert.equal(
          await p
            .getByRole("button", { name: "Tinjau & simpan hasil", exact: true })
            .count(),
          0,
        );
      }
    }
    await p.goto(`${base}/?view=flow`);
    await p
      .getByRole("button", { name: "Remedial & pengayaan", exact: true })
      .click();
    await p.getByLabel("Hasil tindak lanjut (%)", { exact: true }).fill("85");
    await p
      .getByLabel("Catatan hasil / bukti penilaian", { exact: true })
      .fill("Bukti penilaian terverifikasi");
    await p
      .getByRole("button", { name: "Tinjau & simpan hasil", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await check(p, `academic-flow/followup-confirm/${width}`);
    await p.keyboard.press("Escape");
    assert.equal(
      await p.evaluate(() =>
        window.__requests.some(
          (r) => r.path === "/api/alur-akademik/followup-complete",
        ),
      ),
      false,
    );
    await p
      .getByRole("button", { name: "Riwayat & finalisasi", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Kunci nilai final", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await p
      .getByLabel("Alasan (minimal 5 karakter)", { exact: true })
      .fill("Seluruh nilai diperiksa");
    await check(p, `academic-flow/finalization-confirm/${width}`);
    await p.getByRole("button", { name: "Ya, lanjutkan", exact: true }).click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p
      .getByRole("button", { name: "Buka kembali dengan alasan", exact: true })
      .waitFor();
    assert.equal(
      await p
        .getByRole("button", {
          name: "Buka kembali dengan alasan",
          exact: true,
        })
        .count(),
      1,
    );
    await p.goto(`${base}/?view=rollover`);
    await p
      .getByLabel("Rombel asal", { exact: true })
      .selectOption("11111111-1111-4111-8111-111111111111");
    await p
      .getByLabel("Rombel tujuan (semester Draf)", { exact: true })
      .selectOption("dest-room");
    await check(p, `academic-rollover/select/${width}`);
    await p
      .getByRole("button", { name: "Buat pratinjau perpindahan", exact: true })
      .click();
    await p
      .getByRole("button", {
        name: "Konfirmasi perpindahan peserta",
        exact: true,
      })
      .waitFor();
    await check(p, `academic-rollover/preview/${width}`);
    await p
      .getByRole("button", {
        name: "Konfirmasi perpindahan peserta",
        exact: true,
      })
      .click();
    await p.getByRole("dialog").waitFor();
    await check(p, `academic-rollover/confirm/${width}`);
    await p
      .getByLabel("Ketik PINDAHKAN PESERTA", { exact: true })
      .fill("PINDAHKAN PESERTA");
    await p
      .getByRole("button", { name: "Ya, simpan perpindahan", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p
      .getByRole("heading", {
        name: "2. Rekonsiliasi perpindahan",
        exact: true,
      })
      .waitFor();
    await check(p, `academic-rollover/reconciled/${width}`);
    await p.close();
  }
  for (const width of [320, 390, 768, 1440]) {
    const p = await browser.newPage({ viewport: { width, height: 900 } });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/?view=security`);
    await p.getByText("Status: Belum aktif", { exact: true }).waitFor();
    await check(p, `security/disabled/${width}`);
    await p
      .getByLabel("Password saat ini untuk penyiapan", { exact: true })
      .fill("test-password");
    await p
      .getByRole("button", { name: "Siapkan autentikator", exact: true })
      .click();
    await p.getByAltText("Kode QR penyiapan autentikator pribadi").waitFor();
    await check(p, `security/enroll/${width}`);
    assert.equal(await p.evaluate(() => localStorage.length), 0);
    await p
      .getByRole("button", { name: "Batalkan penyiapan", exact: true })
      .click();
    await p
      .getByAltText("Kode QR penyiapan autentikator pribadi")
      .waitFor({ state: "hidden" });
    await p.goto(`${base}/?view=security&mfaEnabled=1`);
    await p
      .getByRole("button", { name: "Nonaktifkan autentikator", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await check(p, `security/disable-confirm/${width}`);
    await p.keyboard.press("Escape");
    assert.equal(
      await p.evaluate(() =>
        window.__requests.some((r) => r.path === "/api/keamanan/disable"),
      ),
      false,
    );
    await p
      .getByRole("button", { name: "Keluar dari perangkat lain", exact: true })
      .click();
    await p
      .getByLabel("Password saat ini untuk keamanan", { exact: true })
      .fill("test-password");
    await p.evaluate(() => (window.__fail = true));
    await p
      .getByRole("button", { name: "Ya, akhiri sesi", exact: true })
      .click();
    await p.getByRole("dialog").getByRole("alert").waitFor();
    await check(p, `security/session-error/${width}`);
    await p.evaluate(() => (window.__fail = false));
    await p
      .getByRole("button", { name: "Ya, akhiri sesi", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p.goto(`${base}/?view=mfa`);
    await p.getByLabel("Kode autentikator", { exact: true }).fill("012345");
    await p.evaluate(() => (window.__fail = true));
    await p
      .getByRole("button", { name: "Verifikasi & lanjutkan", exact: true })
      .click();
    await p.getByRole("alert").waitFor();
    assert.equal(
      await p.getByLabel("Kode autentikator", { exact: true }).inputValue(),
      "",
    );
    await check(p, `security/challenge-error/${width}`);
    await p.evaluate(() => (window.__fail = false));
    await p.getByLabel("Kode autentikator", { exact: true }).fill("012345");
    await p
      .getByRole("button", { name: "Verifikasi & lanjutkan", exact: true })
      .click();
    await p.waitForURL("**/ruang-belajar");
    await p.goto(`${base}/?view=profile`);
    await p.getByRole("tab", { name: "Identitas", exact: true }).click();
    assert.equal(
      await p.getByLabel("NIK (16 digit)", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await p.getByText("0012345678901234", { exact: true }).count(),
      0,
    );
    await p
      .getByRole("button", { name: "Lihat NIK lengkap", exact: true })
      .click();
    await p
      .getByLabel("Password saat ini untuk melihat NIK", { exact: true })
      .fill("test-password");
    await check(p, `security/nik-confirm/${width}`);
    await p
      .getByRole("button", { name: "Verifikasi & tampilkan", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await p.getByText("0012345678901234", { exact: true }).count(),
      1,
    );
    await p.getByRole("tab", { name: "Akun & keamanan", exact: true }).click();
    await p
      .getByText("0012345678901234", { exact: true })
      .waitFor({ state: "detached" });
    assert.equal(
      await p.getByText("0012345678901234", { exact: true }).count(),
      0,
    );
    await p.getByRole("tab", { name: "Identitas", exact: true }).click();
    await p
      .getByRole("button", { name: "Lihat NIK lengkap", exact: true })
      .click();
    await p
      .getByLabel("Password saat ini untuk melihat NIK", { exact: true })
      .fill("test-password");
    await p.evaluate(() => (window.__securityDelay = true));
    await p
      .getByRole("button", { name: "Verifikasi & tampilkan", exact: true })
      .click();
    await p.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await p.waitForTimeout(350);
    assert.equal(
      await p.getByText("0012345678901234", { exact: true }).count(),
      0,
    );
    await check(p, `security/nik-late-response/${width}`);
    await p.close();
  }
  for (const width of [320, 390, 768, 1440]) {
    const p = await browser.newPage({ viewport: { width, height: 900 } });
    p.on("pageerror", (e) => errors.push(e.message));
    for (const role of ["teacher", "student", "guardian", "admin"]) {
      await p.goto(`${base}/?view=profile&profileRole=${role}`);
      for (const name of [
        "Data pribadi",
        "Identitas",
        "Akun & keamanan",
        "Informasi peran",
      ]) {
        await p.getByRole("tab", { name, exact: true }).click();
        await check(p, `profile/${role}/${name}/${width}`);
        if (
          role === "teacher" &&
          name === "Data pribadi" &&
          [320, 1440].includes(width)
        )
          await p.screenshot({
            path: join(output, `profile-${width}.png`),
            fullPage: true,
          });
      }
      if (role === "student") {
        assert.equal(await p.getByText("000123", { exact: true }).count(), 1);
        await p
          .getByRole("tab", { name: "Akun & keamanan", exact: true })
          .click();
        assert.equal(
          await p
            .getByLabel("Username", { exact: true })
            .getAttribute("readonly"),
          "",
        );
        assert.equal(
          await p
            .getByRole("button", { name: "Simpan username", exact: true })
            .count(),
          0,
        );
      }
      if (role === "guardian")
        assert.equal(await p.locator("ol.list-decimal > li").count(), 2);
      if (role === "teacher")
        assert.equal(
          await p.getByText("Senin, Kamis", { exact: true }).count(),
          1,
        );
    }
    await p.goto(`${base}/?view=profile&profileLocked=1`);
    assert.equal(
      await p
        .getByRole("button", { name: "Simpan nama", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Simpan foto", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Simpan nomor HP/WA", exact: true })
        .isEnabled(),
      true,
    );
    await check(p, `profile/locked/${width}`);
    await p.close();
  }
  {
    const p = await browser.newPage({ viewport: { width: 390, height: 900 } });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/?view=profile&realistic=1`);
    await p
      .getByRole("textbox", { name: "Nama lengkap", exact: true })
      .fill("Guru Profil Baru");
    await p.getByRole("button", { name: "Simpan nama", exact: true }).click();
    await p.getByRole("dialog").waitFor();
    await check(p, "profile/name-confirm");
    await p.keyboard.press("Escape");
    assert.equal(
      await p.evaluate(
        () =>
          window.__requests.filter((r) => r.path === "/api/profil/name").length,
      ),
      0,
    );
    await p.getByRole("button", { name: "Simpan nama", exact: true }).click();
    await p
      .getByRole("button", { name: "Ya, simpan perubahan", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await p
        .getByRole("button", { name: "Simpan nama", exact: true })
        .isDisabled(),
      true,
    );
    await p
      .getByRole("textbox", { name: "Nomor HP/WA", exact: true })
      .fill("081299999999");
    await p
      .getByRole("button", { name: "Simpan nomor HP/WA", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Simpan nomor HP/WA", exact: true })
      .waitFor();
    await p.getByLabel("Pilih foto", { exact: true }).setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await p.getByAltText("Pratinjau foto pilihan").waitFor();
    await p.getByRole("button", { name: "Simpan foto", exact: true }).click();
    await p
      .getByRole("button", { name: "Ya, simpan perubahan", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await p
        .getByRole("button", { name: "Hapus foto", exact: true })
        .isDisabled(),
      true,
    );
    await check(p, "profile/photo-saved");
    await p.getByRole("tab", { name: "Akun & keamanan", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Username", exact: true })
      .fill("guru.profil");
    await p
      .getByLabel("Password saat ini untuk ubah username", { exact: true })
      .fill("password-kuat");
    await p
      .getByRole("button", { name: "Simpan username", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Ya, simpan perubahan", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await p
        .getByRole("button", { name: "Simpan username", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await p
        .getByRole("link", { name: "Ubah password", exact: true })
        .getAttribute("href"),
      "/ganti-password?from=profil",
    );
    await p.goto(`${base}/?view=profile&profilePhoto=1&realistic=1`);
    await p.getByRole("button", { name: "Hapus foto", exact: true }).click();
    await p
      .getByRole("dialog", { name: "Hapus foto profil?", exact: true })
      .waitFor();
    await check(p, "profile/photo-delete-confirm");
    await p
      .getByRole("button", { name: "Ya, hapus foto", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await p
        .getByRole("button", { name: "Simpan foto", exact: true })
        .isDisabled(),
      true,
    );
    await p.getByRole("tab", { name: "Data pribadi", exact: true }).focus();
    await p.keyboard.press("End");
    assert.equal(
      await p
        .getByRole("tab", { name: "Informasi peran", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await p.goto(`${base}/?view=profile&realistic=1`);
    await p.getByRole("tab", { name: "Akun & keamanan", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Email baru", exact: true })
      .fill("baru@example.test");
    await p
      .getByLabel("Password saat ini untuk ubah email", { exact: true })
      .fill("password-kuat");
    await p
      .getByRole("button", { name: "Ubah & verifikasi email", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await check(p, "profile/email-confirm");
    await p
      .getByRole("button", { name: "Ya, simpan perubahan", exact: true })
      .click();
    await p.waitForURL("**/verifikasi");
    await p.close();
  }
  for (const width of [390, 1440]) {
    const p = await browser.newPage({ viewport: { width, height: 900 } });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/?view=daily&tables=1&inactive=1`);
    await p
      .getByRole("button", { name: "Tampilkan absensi", exact: true })
      .click();
    await p
      .getByRole("region", { name: "Tabel pencatatan absensi", exact: true })
      .waitFor();
    assert.equal(await p.locator("tbody tr").count(), 131);
    assert.equal(
      await p.getByText("Siswa Nonaktif", { exact: true }).count(),
      0,
    );
    await check(p, `inactive/daily/${width}`);
    await p.getByRole("tab", { name: "Rekap harian", exact: true }).click();
    await p
      .getByRole("button", { name: "Tampilkan rekap", exact: true })
      .click();
    await p
      .getByRole("region", { name: "Tabel rekap absensi harian", exact: true })
      .waitFor();
    assert.equal(await p.locator("tbody tr").count(), 131);
    assert.equal(
      await p.getByText("Siswa Nonaktif", { exact: true }).count(),
      0,
    );
    await check(p, `inactive/daily-report/${width}`);
    await p.goto(`${base}/?view=course&tables=1&inactive=1`);
    await p.getByRole("tab", { name: "Laporan", exact: true }).click();
    await p
      .getByRole("region", { name: "Tabel ringkasan siswa", exact: true })
      .waitFor();
    assert.equal(await p.locator("tbody tr").count(), 59);
    assert.equal(
      await p.getByText("Siswa Nonaktif", { exact: true }).count(),
      0,
    );
    await check(p, `inactive/report/${width}`);
    await p.getByRole("tab", { name: "Hasil kuis", exact: true }).click();
    assert.equal(
      await p.getByText("Siswa Nonaktif", { exact: true }).count(),
      0,
    );
    await check(p, `inactive/quiz/${width}`);
    await p.close();
  }
  for (const width of [320, 390, 768, 1440]) {
    const userPage = await browser.newPage({
      viewport: { width, height: 900 },
    });
    userPage.on("pageerror", (e) => errors.push(e.message));
    await userPage.goto(`${base}/?view=users&userfilters=1`);
    const toggle = userPage.getByRole("button", {
      name: "Tambah pengguna",
      exact: true,
    });
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(
      await userPage.getByLabel("Nama lengkap", { exact: true }).isVisible(),
      false,
    );
    await toggle.click();
    await userPage
      .getByLabel("Nama lengkap", { exact: true })
      .fill("Draf Pengguna");
    await userPage
      .getByRole("button", { name: "Tutup form", exact: true })
      .click();
    assert.equal(
      await userPage.getByLabel("Nama lengkap", { exact: true }).isVisible(),
      false,
    );
    await toggle.click();
    assert.equal(
      await userPage.getByLabel("Nama lengkap", { exact: true }).inputValue(),
      "Draf Pengguna",
    );
    await userPage
      .getByRole("button", { name: "Tutup form", exact: true })
      .click();
    const search = userPage.getByRole("searchbox", {
        name: "Cari username atau nama",
        exact: true,
      }),
      account = userPage.getByLabel("Filter status akun", { exact: true }),
      activation = userPage.getByLabel("Filter status pengguna", {
        exact: true,
      }),
      sort = userPage.getByLabel("Urutkan username", { exact: true });
    const cards = userPage.locator("form").filter({
      has: userPage.getByRole("button", {
        name: "Simpan hak akses",
        exact: true,
      }),
    });
    assert.equal(await cards.count(), 50);
    assert.equal(
      await userPage
        .getByRole("button", { name: "Berikutnya", exact: true })
        .isDisabled(),
      false,
    );
    await userPage
      .getByRole("button", { name: "Berikutnya", exact: true })
      .click();
    assert.equal(await cards.count(), 12);
    await search.fill("HANA");
    assert.equal(await cards.count(), 1);
    await userPage
      .getByRole("heading", { name: "Hana Terakhir", exact: true })
      .waitFor();
    assert.equal(
      await userPage
        .getByRole("button", { name: "Sebelumnya", exact: true })
        .isDisabled(),
      true,
    );
    await account.selectOption("active");
    assert.equal(await cards.count(), 0);
    await userPage
      .getByText(
        "Tidak ada pengguna yang cocok. Ubah pencarian atau reset filter.",
        { exact: true },
      )
      .waitFor();
    await account.selectOption("disabled");
    await activation.selectOption("email");
    assert.equal(await cards.count(), 1);
    await userPage
      .getByRole("button", { name: "Reset filter", exact: true })
      .click();
    await search.fill("guru");
    assert.equal(await cards.count(), 2);
    assert.equal(
      await cards.first().getByRole("heading").textContent(),
      "Nama guru2",
    );
    await sort.selectOption("desc");
    assert.equal(
      await cards.first().getByRole("heading").textContent(),
      "Nama guru10",
    );
    await activation.selectOption("password");
    assert.equal(await cards.count(), 1);
    await check(userPage, `user-filters/${width}`);
    assert.equal(
      await userPage.evaluate(
        () =>
          window.__requests.filter((r) =>
            String(r.path).endsWith("/admin-list"),
          ).length,
      ),
      1,
    );
    assert.equal(
      await userPage.evaluate(
        () =>
          window.__requests.find((r) => String(r.path).endsWith("/admin-list"))
            .all,
      ),
      true,
    );
    if (width === 390) {
      await userPage
        .getByRole("button", { name: "Reset filter", exact: true })
        .click();
      await toggle.click();
      await userPage
        .getByLabel("Nama lengkap", { exact: true })
        .fill("Pengguna Baru");
      await userPage.getByLabel("Username", { exact: true }).fill("tesbaru");
      await userPage
        .locator('#create-user-form input[value="student"]')
        .check();
      await userPage
        .getByRole("button", { name: "Buat akun", exact: true })
        .click();
      await userPage
        .getByRole("button", { name: "Tambah pengguna", exact: true })
        .waitFor();
      await userPage.waitForFunction(
        () =>
          document.activeElement?.getAttribute("aria-controls") ===
          "create-user-form",
      );
      assert.equal(
        await userPage.getByLabel("Nama lengkap", { exact: true }).isVisible(),
        false,
      );
      await search.fill("tesbaru");
      assert.equal(await cards.count(), 1);
      await cards
        .getByText("tesbaru · Wajib ganti password", { exact: true })
        .waitFor();
      await cards
        .getByLabel("Status Pengguna Baru", { exact: true })
        .selectOption("disabled");
      await cards
        .getByRole("button", { name: "Simpan hak akses", exact: true })
        .click();
      await userPage.waitForFunction(
        () =>
          window.__requests.filter((r) =>
            String(r.path).endsWith("/admin-list"),
          ).length === 3,
      );
      await userPage
        .getByText("Memuat pengguna…", { exact: true })
        .waitFor({ state: "hidden" });
      assert.equal(
        await cards
          .getByLabel("Status Pengguna Baru", { exact: true })
          .inputValue(),
        "disabled",
      );
    }
    await userPage.close();
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
