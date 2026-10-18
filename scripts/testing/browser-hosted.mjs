import { chromium } from "playwright";
import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const file = process.env.LMS_BROWSER_FIXTURE;
if (
  !file ||
  path.resolve(file).startsWith(process.cwd() + path.sep) ||
  statSync(file).mode & 0o077
)
  throw new Error(
    "Use a private 0600 synthetic fixture outside the repository.",
  );
const c = JSON.parse(readFileSync(file, "utf8"));
if (
  c.ack !== "synthetic-school-only" ||
  !c.prefix.startsWith("lms6_") ||
  c.actors.some((a) => !a.name.startsWith(c.prefix + "_"))
)
  throw new Error("Invalid synthetic scope.");
const base = "https://lms-nurul-falah.vercel.app",
  results = [],
  errors = [];
const started = new Date().toISOString();
let browser;
const contexts = [];
const proxyRaw = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const proxy = proxyRaw ? new URL(proxyRaw) : null;
const redact = (value) =>
  String(value)
    .split(c.password + "New")
    .join("[redacted]")
    .split(c.password)
    .join("[redacted]")
    .replace(/([?&](?:password|token)=)[^&\s"]+/gi, "$1[redacted]");
const localDate = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 16);
function save() {
  mkdirSync("docs/verification", { recursive: true });
  writeFileSync(
    "docs/verification/stage6-browser-results.json",
    JSON.stringify(
      {
        started_at: started,
        finished_at: new Date().toISOString(),
        target: base,
        tested_commit: process.env.LMS_TEST_DEPLOYMENT_COMMIT ?? null,
        scope:
          "Hosted Vercel + real Supabase Auth and PostgreSQL; operator-seeded synthetic school only; no mocked API responses",
        browser:
          "Chromium, emulated desktop/mobile viewports; not physical devices",
        network:
          "Browser emulation: offline before ACK and response loss after real server commit",
        cases: results,
        javascript_errors: errors,
        email_delivery_tested: false,
        physical_devices_tested: false,
      },
      null,
      2,
    ) + "\n",
  );
}
async function step(name, fn) {
  const t = Date.now();
  console.log("START:", name);
  try {
    const detail = await fn();
    results.push({
      name,
      status: "passed",
      duration_ms: Date.now() - t,
      ...detail,
    });
    console.log("PASS:", name);
  } catch (e) {
    results.push({
      name,
      status: "failed",
      duration_ms: Date.now() - t,
      message: redact(e.message).slice(0, 700),
    });
    throw e;
  } finally {
    save();
  }
}
async function api(ctx, section, action, body = {}) {
  const r = await ctx.request.post(`${base}/api/${section}/${action}`, {
    headers: { Origin: base, "Content-Type": "application/json" },
    data: body,
    timeout: 60000,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(`${section}/${action} non-JSON HTTP ${r.status()}`);
  }
  if (!r.ok())
    throw new Error(`${section}/${action} HTTP ${r.status()}: ${data.message}`);
  return data;
}
async function session(alias, width = 1440, password = c.password) {
  const actor = c.actors.find((a) => a.alias === alias);
  assert.ok(actor);
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: !!proxy,
    viewport: { width, height: 900 },
    timezoneId: "Asia/Jakarta",
  });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/masuk", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.getByLabel("Username", { exact: true }).fill(actor.name);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/masuk"), {
    timeout: 60000,
    waitUntil: "domcontentloaded",
  });
  return { ctx, page, actor };
}
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(proxy
      ? {
          proxy: {
            server: proxy.origin,
            username: decodeURIComponent(proxy.username),
            password: decodeURIComponent(proxy.password),
          },
        }
      : {}),
  });
  let teacher, student, guardian, admin, other, quizId, attemptId;
  await step("teacher_login_and_ui_create_quiz", async () => {
    teacher = await session("teacher");
    await teacher.page.goto(`${base}/pembelajaran/${c.course}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await teacher.page.getByRole("tab", { name: "Kuis", exact: true }).click();
    await teacher.page
      .getByRole("button", { name: "Tambah kuis", exact: true })
      .click();
    await teacher.page
      .getByLabel("Judul", { exact: true })
      .fill("[UJI-TAHAP6] Browser " + c.prefix);
    await teacher.page
      .getByLabel("Dibuka", { exact: true })
      .fill(localDate(Date.now() - 60000));
    await teacher.page
      .getByLabel("Ditutup", { exact: true })
      .fill(localDate(Date.now() + 3600000));
    await teacher.page
      .locator('select[name="status"]')
      .selectOption("published");
    await teacher.page
      .getByLabel("Pertanyaan", { exact: true })
      .fill("Pilih jawaban A untuk data sintetis ini.");
    await teacher.page
      .getByLabel("Opsi 1", { exact: true })
      .fill("Jawaban A Tahap6");
    await teacher.page
      .getByLabel("Opsi 2", { exact: true })
      .fill("Jawaban B Tahap6");
    const response = teacher.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/save"),
      { timeout: 60000 },
    );
    await teacher.page
      .getByRole("button", { name: "Simpan kuis", exact: true })
      .click();
    const r = await response;
    assert.ok(r.ok(), await r.text());
    quizId = (await r.json()).result.id;
    return { quiz_created_through_ui: true };
  });
  await step("student_mobile_start_save_refresh_resume", async () => {
    student = await session("student_a", 390);
    assert.equal(
      await student.page.getByLabel("Sekolah aktif", { exact: true }).count(),
      0,
    );
    await student.page.goto(`${base}/pembelajaran/${c.course}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await student.page.getByRole("tab", { name: "Kuis", exact: true }).click();
    await student.page
      .getByRole("button", { name: "Mulai / lanjutkan kuis", exact: true })
      .click();
    await student.page.waitForURL(/\/kuis\//, { timeout: 60000 });
    attemptId = new URL(student.page.url()).pathname.split("/").at(-1);
    const response = student.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/answers") && r.ok(),
      { timeout: 60000 },
    );
    await student.page.getByLabel("Jawaban A Tahap6", { exact: true }).check();
    await response;
    await student.page.reload({
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    assert.ok(student.page.url().endsWith(attemptId));
    await student.page
      .getByLabel("Jawaban A Tahap6", { exact: true })
      .waitFor();
    assert.equal(
      await student.page
        .getByLabel("Jawaban A Tahap6", { exact: true })
        .isChecked(),
      true,
    );
    assert.ok(
      await student.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    return {
      same_attempt: true,
      answer_persisted: true,
      mobile_no_overflow: true,
    };
  });
  await step("offline_before_ack_retry_preserves_answer", async () => {
    await student.ctx.setOffline(true);
    await student.page.getByLabel("Jawaban B Tahap6", { exact: true }).check();
    await student.page
      .getByText("Belum tersimpan. Memeriksa koneksi dan mencoba kembali…", {
        exact: true,
      })
      .waitFor({ timeout: 20000 });
    const response = student.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/answers") && r.ok(),
      { timeout: 60000 },
    );
    await student.ctx.setOffline(false);
    await response;
    const a = (
      await api(student.ctx, "kuis", "attempt", {
        course: c.course,
        target: attemptId,
      })
    ).result;
    assert.equal(a.answers[0].choice, 1);
    return { unsaved_feedback: true, recovered_answer: true };
  });
  await step("lost_response_after_ack_idempotent_retry", async () => {
    let dropped = false;
    const packets = [];
    const before = (
      await api(student.ctx, "kuis", "attempt", {
        course: c.course,
        target: attemptId,
      })
    ).result;
    await student.page.route("**/api/kuis/answers", async (route) => {
      packets.push(route.request().postDataJSON());
      if (!dropped) {
        dropped = true;
        const r = await route.fetch({ timeout: 60000 });
        assert.ok(r.ok());
        await route.abort("failed");
      } else await route.continue();
    });
    const ack = student.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/answers") && r.ok(),
      { timeout: 90000 },
    );
    await student.page.getByLabel("Jawaban A Tahap6", { exact: true }).check();
    await ack;
    await student.page.unroute("**/api/kuis/answers");
    assert.ok(packets.length >= 2);
    assert.deepEqual(packets[0], packets[1]);
    const after = (
      await api(student.ctx, "kuis", "attempt", {
        course: c.course,
        target: attemptId,
      })
    ).result;
    assert.equal(after.revision, before.revision + 1);
    assert.equal(after.answers[0].choice, 0);
    return { identical_retry_packet: true, single_revision_increment: true };
  });
  await step("two_tabs_revision_conflict_visible", async () => {
    const second = await student.ctx.newPage();
    await second.goto(student.page.url(), {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await second.getByLabel("Jawaban A Tahap6", { exact: true }).waitFor();
    const ack = student.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/answers") && r.ok(),
      { timeout: 60000 },
    );
    await student.page.getByLabel("Jawaban B Tahap6", { exact: true }).check();
    await ack;
    await second.getByLabel("Jawaban B Tahap6", { exact: true }).check();
    await second
      .getByRole("button", { name: "Muat ulang jawaban server", exact: true })
      .waitFor({ timeout: 60000 });
    const a = (
      await api(student.ctx, "kuis", "attempt", {
        course: c.course,
        target: attemptId,
      })
    ).result;
    assert.equal(a.answers[0].choice, 1);
    await second.close();
    return { conflict_shown: true, no_silent_overwrite: true };
  });
  await step("finish_hidden_grades_teacher_release_reclose", async () => {
    student.page.once("dialog", (d) => d.accept());
    await student.page
      .getByRole("button", { name: "Selesaikan kuis", exact: true })
      .click();
    await student.page
      .getByRole("heading", { name: "Hasil kuis", exact: true })
      .waitFor({ timeout: 60000 });
    let a = (
      await api(student.ctx, "kuis", "attempt", {
        course: c.course,
        target: attemptId,
      })
    ).result;
    assert.equal(a.status, "submitted");
    assert.equal(a.score, null);
    assert.ok(!("correct" in a.questions[0]));
    await teacher.page.getByLabel("Buka nilai", { exact: true }).check();
    const firstRelease = teacher.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/release") && r.ok(),
      { timeout: 60000 },
    );
    await teacher.page
      .getByRole("button", { name: "Simpan akses hasil", exact: true })
      .click();
    await firstRelease;
    await teacher.page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Simpan akses hasil" && !b.disabled,
        ),
      { timeout: 60000 },
    );
    a = (
      await api(student.ctx, "kuis", "attempt", {
        course: c.course,
        target: attemptId,
      })
    ).result;
    assert.equal(a.score, 0);
    assert.equal(a.review_visible, false);
    await teacher.page.getByLabel("Buka nilai", { exact: true }).uncheck();
    const release = teacher.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/release") && r.ok(),
      { timeout: 60000 },
    );
    await teacher.page
      .getByRole("button", { name: "Simpan akses hasil", exact: true })
      .click();
    await release;
    a = (
      await api(student.ctx, "kuis", "attempt", {
        course: c.course,
        target: attemptId,
      })
    ).result;
    assert.equal(a.score, null);
    return {
      submitted_once: true,
      closed_results_hidden: true,
      teacher_release_and_reclose: true,
    };
  });
  await step("offline_deadline_reconciles_to_server_answers", async () => {
    other = await session("student_b", 390);
    const q = (
      await api(teacher.ctx, "kuis", "save", {
        course: c.course,
        data: {
          title: "[UJI-TAHAP6] Tenggat browser",
          instructions: "Data sintetis.",
          status: "published",
          opens_at: new Date(Date.now() - 60000).toISOString(),
          closes_at: new Date(Date.now() + 60000).toISOString(),
          duration_minutes: 1,
          questions: [
            {
              kind: "boolean",
              prompt: "Jawaban pertama sebelum tenggat",
              options: ["Benar", "Salah"],
              correct: 0,
              points: 1,
              explanation: "Pembahasan pertama",
            },
            {
              kind: "boolean",
              prompt: "Jawaban kedua terlambat",
              options: ["Benar", "Salah"],
              correct: 0,
              points: 1,
              explanation: "Pembahasan kedua",
            },
          ],
        },
      })
    ).result;
    let a = (
      await api(other.ctx, "kuis", "start", { course: c.course, target: q.id })
    ).result;
    await other.page.goto(`${base}/kuis/${c.course}/${a.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const ack = other.page.waitForResponse(
      (r) => r.url().endsWith("/api/kuis/answers") && r.ok(),
      { timeout: 60000 },
    );
    await other.page.getByLabel("Benar", { exact: true }).nth(0).check();
    await ack;
    await other.ctx.setOffline(true);
    await other.page.getByLabel("Benar", { exact: true }).nth(1).check();
    while (Date.now() < Date.parse(a.deadline) + 4000) {
      console.log(
        "Deadline browser: waiting seconds",
        Math.ceil((Date.parse(a.deadline) + 4000 - Date.now()) / 1000),
      );
      await other.page.waitForTimeout(
        Math.min(10000, Date.parse(a.deadline) + 4000 - Date.now()),
      );
    }
    await other.ctx.setOffline(false);
    await other.page
      .getByRole("heading", { name: "Hasil kuis", exact: true })
      .waitFor({ timeout: 90000 });
    a = (
      await api(other.ctx, "kuis", "attempt", {
        course: c.course,
        target: a.id,
      })
    ).result;
    assert.equal(a.status, "expired");
    assert.equal(a.answers.length, 1);
    assert.equal(a.score, null);
    assert.equal(
      await other.page.getByLabel("Benar", { exact: true }).nth(1).isChecked(),
      false,
    );
    const graded = (
      await api(teacher.ctx, "kuis", "attempt", {
        course: c.course,
        target: a.id,
      })
    ).result;
    assert.equal(graded.score, 1);
    const editable = (
      await api(teacher.ctx, "kuis", "edit", { course: c.course, target: q.id })
    ).result;
    await api(teacher.ctx, "kuis", "release", {
      course: c.course,
      target: q.id,
      data: {
        grades_visible: true,
        explanations_visible: true,
        expected_updated_at: editable.updated_at,
      },
    });
    const reviewed = (
      await api(other.ctx, "kuis", "attempt", {
        course: c.course,
        target: a.id,
      })
    ).result;
    assert.equal(reviewed.review_visible, true);
    assert.ok(reviewed.questions.every((question) => question.correct === 0));
    return {
      server_expired: true,
      only_acknowledged_answer_retained: true,
      late_local_answer_removed: true,
      review_released_after_close: true,
    };
  });
  await step("guardian_multiple_children_and_scope_denial", async () => {
    guardian = await session("guardian", 390);
    await guardian.page.goto(base + "/pemantauan", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await guardian.page
      .getByLabel("Anak tertaut")
      .waitFor({ timeout: 60000 });
    const portal = (await api(guardian.ctx, "lanjutan", "portal", {})).result;
    assert.deepEqual(
      portal.children.map((x) => x.id).sort(),
      c.actors
        .filter((a) => ["student_a", "student_b"].includes(a.alias))
        .map((a) => a.id)
        .sort(),
    );
    const report = (
      await api(guardian.ctx, "lanjutan", "weighted-report", {
        course: c.course,
      })
    ).result;
    assert.ok(
      report.rows.every((r) => portal.children.some((ch) => ch.id === r.id)),
    );
    const r = await guardian.ctx.request.post(base + "/api/kuis/report", {
      headers: { Origin: base },
      data: { course: c.other_course },
    });
    assert.equal(r.status(), 403);
    await student.page.goto(base + "/admin/pengguna", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await student.page.waitForURL(base + "/ruang-belajar", { timeout: 60000 });
    return {
      two_linked_children_only: true,
      unlinked_class_denied: true,
      student_admin_page_denied: true,
    };
  });
  await step("hosted_xlsx_pdf_downloads_authorized", async () => {
    await teacher.page.goto(`${base}/laporan/${c.course}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    for (const [label, magic] of [
      ["Ekspor Excel (semua halaman)", "PK"],
      ["Ekspor PDF (semua halaman)", "%PDF"],
    ]) {
      const ready = teacher.page.waitForEvent("download", { timeout: 60000 });
      await teacher.page
        .getByRole("link", { name: label, exact: true })
        .click();
      const d = await ready;
      const stream = await d.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      assert.equal(
        Buffer.concat(chunks).subarray(0, magic.length).toString(),
        magic,
      );
    }
    return { xlsx_signature_valid: true, pdf_signature_valid: true };
  });
  await step("admin_only_school_switcher", async () => {
    admin = await session("admin");
    await admin.page
      .getByLabel("Sekolah aktif", { exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal(
      await guardian.page.getByLabel("Sekolah aktif", { exact: true }).count(),
      0,
    );
    return { admin_visible: true, student_guardian_hidden: true };
  });
  await step(
    "forced_password_change_relogin_old_session_denied_email_gate",
    async () => {
      const activation = await session("activation", 390, "12345678");
      assert.ok(activation.page.url().includes("/ganti-password"));
      const old = await browser.newContext({ ignoreHTTPSErrors: !!proxy });
      contexts.push(old);
      await old.addCookies(await activation.ctx.cookies());
      const next = c.password + "New";
      await activation.page
        .getByLabel("Password saat ini", { exact: true })
        .fill("12345678");
      await activation.page
        .getByLabel("Password baru", { exact: true })
        .fill(next);
      await activation.page
        .getByLabel("Ulangi password baru", { exact: true })
        .fill(next);
      await activation.page
        .getByRole("button", {
          name: "Simpan password dan keluar",
          exact: true,
        })
        .click();
      await activation.page.waitForURL(/\/masuk\?selesai=password/, {
        timeout: 90000,
      });
      const denied = await old.request.post(base + "/api/kuis/list", {
        headers: { Origin: base },
        data: { course: c.course },
      });
      assert.equal(denied.status(), 401);
      const renewed = await session("activation", 390, next);
      assert.ok(renewed.page.url().endsWith("/verifikasi"));
      await renewed.page.goto(base + "/ruang-belajar", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await renewed.page.waitForURL(base + "/verifikasi", { timeout: 60000 });
      return {
        forced_change: true,
        relogin_required: true,
        old_session_denied: true,
        email_gate_blocks_private_pages: true,
        email_delivery_not_exercised: true,
      };
    },
  );
  assert.deepEqual(errors, []);
  console.log("COMPLETE: hosted browser scenarios");
} catch (e) {
  console.error("STOP:", redact(e.message).slice(0, 700));
  process.exitCode = 1;
} finally {
  save();
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser?.close();
}
process.exit(process.exitCode ?? 0);
