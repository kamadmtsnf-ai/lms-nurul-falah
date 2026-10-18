import { existsSync, readFileSync, writeFileSync } from "node:fs";
const path = "docs/verification/stage6-hosted-results.json";
const hosted = JSON.parse(readFileSync(path, "utf8"));
const rounds = hosted.rounds.filter((r) => r.sessions);
const rows = rounds.map((r) => {
  const answers = Object.entries(r.phases)
    .filter(([k]) => k.startsWith("autosave") || k.startsWith("retry"))
    .map(([, v]) => v);
  const phases = Object.values(r.phases);
  return {
    sessions: r.sessions,
    requests: phases.reduce((n, p) => n + p.samples, 0),
    request_errors: phases.reduce((n, p) => n + p.errors, 0),
    worst_burst_answer_client_p95_ms: Math.max(...answers.map((p) => p.p95_ms)),
    worst_burst_answer_handler_p95_ms: answers.every(
      (p) => p.server_timing?.total,
    )
      ? Math.max(...answers.map((p) => p.server_timing.total.p95_ms))
      : null,
    acknowledged_answers_preserved:
      r.all_acknowledged_answers_preserved === true,
    duplicate_finalizations: r.duplicate_finalizations ?? null,
    cross_student_access_denied: r.cross_student_access_denied === true,
    teacher_grading_correct: r.teacher_grading_correct === true,
    keys_hidden: r.keys_hidden === true,
  };
});
const all =
  rows.length === 3 &&
  [60, 100, 132].every((n) => rows.some((r) => r.sessions === n));
const integrity =
  all &&
  rows.every(
    (r) =>
      r.acknowledged_answers_preserved &&
      r.duplicate_finalizations === 0 &&
      r.cross_student_access_denied &&
      r.teacher_grading_correct &&
      r.keys_hidden,
  );
const latency =
  all && rows.every((r) => r.worst_burst_answer_client_p95_ms < 2000);
const noErrors = all && rows.every((r) => r.request_errors / r.requests < 0.01);
const deadline = hosted.rounds.some(
  (r) => r.hosted_deadline_passed && r.teacher_release_and_reclose_passed,
);
const browserPath = "docs/verification/stage6-browser-results.json";
const browser = existsSync(browserPath)
  ? JSON.parse(readFileSync(browserPath, "utf8"))
  : null;
const requiredBrowser = [
  "teacher_login_and_ui_create_quiz",
  "student_mobile_start_save_refresh_resume",
  "offline_before_ack_retry_preserves_answer",
  "lost_response_after_ack_idempotent_retry",
  "two_tabs_revision_conflict_visible",
  "finish_hidden_grades_teacher_release_reclose",
  "offline_deadline_reconciles_to_server_answers",
  "guardian_multiple_children_and_scope_denial",
  "hosted_xlsx_pdf_downloads_authorized",
  "admin_only_school_switcher",
  "forced_password_change_relogin_old_session_denied_email_gate",
];
const browserPassed =
  !!browser &&
  requiredBrowser.every((name) =>
    browser.cases.some(
      (test) => test.name === name && test.status === "passed",
    ),
  ) &&
  browser.javascript_errors.length === 0;
const networkPassed =
  !!browser &&
  [
    "offline_before_ack_retry_preserves_answer",
    "lost_response_after_ack_idempotent_retry",
    "offline_deadline_reconciles_to_server_answers",
  ].every((name) =>
    browser.cases.some(
      (test) => test.name === name && test.status === "passed",
    ),
  );
const report = {
  assessed_at: new Date().toISOString(),
  status: "not_approved_for_mass_rollout_pending_gates",
  target: hosted.target,
  function_region: hosted.function_region,
  tested_commit: hosted.deployment_commit,
  browser_tested_commit: browser?.tested_commit ?? null,
  browser_results: browserPath,
  latest_latency_control:
    "docs/verification/stage6-latency-control-latest.json",
  table_metric:
    "Maximum of each answer-wave p95, including retry; not a pooled percentile",
  rows,
  gates: {
    all_three_auth_session_bursts_complete: all,
    quiz_request_error_rate_below_one_percent: noErrors,
    acknowledged_answer_integrity_and_authorization: integrity,
    real_deadline_and_release: deadline,
    client_p95_answer_under_two_seconds: latency,
    browser_hosted_acceptance: browserPassed,
    browser_emulated_network_recovery: networkPassed,
    browser_and_real_device_acceptance: browserPassed
      ? "hosted_browser_passed_physical_devices_pending"
      : "pending_hosted_browser_and_physical_devices",
    actual_network_disconnect_browser: networkPassed
      ? "browser_emulation_passed_physical_network_pending"
      : "pending_browser_network_checks",
    production_backup_and_storage_restore:
      "pending_operator_credentials_and_tools",
  },
  limits: [
    "No unconditional capacity or SLA claim",
    "Client latency and handler timings are separate",
    "Synthetic school and sessions are removed after verification; provider audit logs follow provider retention",
    "Production data backup and hosted Storage restoration were not performed",
  ],
};
writeFileSync(
  "docs/verification/stage6-readiness.json",
  JSON.stringify(report, null, 2) + "\n",
);
const lines = [
  "# Hasil pengujian hosted Tahap 6",
  "",
  "Keputusan: **belum disetujui untuk penggunaan massal** sampai gate latensi client, perangkat/jaringan fisik dan pemulihan produksi terselesaikan. Status browser hosted dibaca dari laporan terbaru, terpisah dari uji kapasitas lama.",
  "",
  "| Sesi siswa | Request gelombang | Error | p95 jawaban client tertinggi (ms) | p95 handler tertinggi (ms) | Jawaban diakui tetap ada | Finalisasi ganda |",
  "|---|---:|---:|---:|---:|---|---:|",
  ...rows.map(
    (r) =>
      `| ${r.sessions} | ${r.requests} | ${r.request_errors} | ${r.worst_burst_answer_client_p95_ms} | ${r.worst_burst_answer_handler_p95_ms ?? "Tidak diukur"} | ${r.acknowledged_answers_preserved ? "Ya" : "Belum terbukti"} | ${r.duplicate_finalizations ?? "Belum terbukti"} |`,
  ),
  "",
  "p95 di atas adalah nilai tertinggi antar gelombang simpan dan retry, bukan percentile gabungan. Waktu client mencakup perjalanan request sampai response; `Server-Timing total` hanya mencakup autentikasi di route, pembatasan permintaan dan RPC. Waktu sebelum/sesudah handler (termasuk middleware/platform/jaringan) belum seluruhnya terisolasi.",
  "",
  "Hasil browser hosted terbaru dan pemulihan jaringan emulasi: lihat `stage6-browser-results.json` dan `stage6-readiness.json`. Pengujian ini tetap tidak membuktikan perangkat fisik.\n\nLingkungan: sesi Auth Supabase asli, API Vercel pada alamat utama, function sin1 dan database Singapura, 30 soal per kuis, lima batch simpan, retry dan finalisasi berulang. Sekolah dan akun seluruhnya sintetis. Uji ini tidak menjalankan browser.",
  "",
  "Lihat JSON mentah untuk p50/p95 setiap fase, jumlah sampel, pemisahan waktu server dan total payload JSON yang terukur. Bukti diagnostik awal yang sempat bertumpuk dikeluarkan dari keputusan kapasitas.",
  "",
  "Checklist dan panduan operator: ../09-Tahap-6-Kelayakan-Uji-Coba.md",
  "",
];
writeFileSync(
  "docs/verification/10-Hasil-Uji-Hosted-Tahap-6.md",
  lines.join("\n"),
);
console.log(JSON.stringify({ gates: report.gates, rows }));
