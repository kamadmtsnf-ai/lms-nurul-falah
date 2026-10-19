import { AttachmentRetention } from "../../src/components/attachment-retention";
import { Files } from "../../src/components/learning-shared";
import type {
  RetentionState,
  RetentionAsset,
} from "../../src/lib/attachment-retention/types";
import { AcademicFlowPanel } from "../../src/components/academic-flow-panel";
import { AcademicRollover } from "../../src/components/academic-rollover";
import type { FlowState } from "../../src/lib/academic-flow/client";
import type { AcademicState } from "../../src/lib/academic/config";
import {
  SecurityWorkspace,
  MfaChallenge,
} from "../../src/components/security-workspace";
import { ProfileWorkspace } from "../../src/components/profile-workspace";
import type { ProfileData } from "../../src/lib/profile/types";
import { visibleStudentLists } from "../../src/lib/students/visibility";
import { AppShell } from "../../src/components/app-shell";
import { WorkspaceDashboard } from "../../src/components/workspace-dashboard";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthForm, LogoutButton } from "../../src/components/auth-form";
import { AuthShell } from "../../src/components/auth-shell";
import { AcademicManager } from "../../src/components/academic-manager";
import { UserManager } from "../../src/components/user-manager";
import { CourseWorkspace } from "../../src/components/course-workspace";
import { DailyAttendance } from "../../src/components/daily-attendance";
import { QuizAttempt } from "../../src/components/quiz-attempt";
import { MonitoringDashboard } from "../../src/components/monitoring-dashboard";
import { RetentionManager } from "../../src/components/retention-manager";
import {
  DevelopmentSettings,
  SchoolSwitcher,
} from "../../src/components/development-panel";
import { OfflineWorkspace } from "../../src/components/offline-workspace";
import type { CourseState } from "../../src/lib/learning/types";
import { saveOffline } from "../../src/lib/offline/store";
import type { Attempt } from "../../src/lib/quiz/types";
const params = new URLSearchParams(location.search),
  view = params.get("view") ?? "course",
  empty = params.has("empty"),
  isStudent = params.has("student");
const id = "11111111-1111-4111-8111-111111111111",
  school = "22222222-2222-4222-8222-222222222222",
  student = "33333333-3333-4333-8333-333333333333";
const long = params.has("realistic")
    ? "Ilmu Pengetahuan Sosial"
    : "DataPanjangTanpaSpasi".repeat(15),
  now = "2026-10-18T03:00:00Z";
const roster = empty
  ? []
  : Array.from({ length: 132 }, (_, i) => ({
      id: i === 0 ? student : `student-${i}`,
      full_name:
        params.has("inactive") && i === 1
          ? "Siswa Nonaktif"
          : i === 0
            ? long
            : `Siswa ${i + 1}`,
    }));
const ctx = {
  actor: student,
  school,
  classroom: id,
  manager: !isStudent,
  reviewer: !isStudent,
  admin: !isStudent,
  teacher: !isStudent,
  student: isStudent,
  writable: true,
  student_writable: isStudent,
  semester_status: "active",
  children: [],
};
const task = {
  id: "task",
  title: long,
  instructions: long,
  formats: ["text", "file", "link"],
  due_at: "2027-06-01T10:00:00Z",
  accept_late: true,
  max_score: 100,
  status: "published",
  publish_at: null,
  grades_visible: true,
  updated_at: now,
};
const course: CourseState = {
  course: { id, subject: long, classroom: "7A", teacher: long },
  context: ctx,
  offset: 0,
  has_more: false,
  roster,
  materials: empty
    ? []
    : [
        {
          id: "material",
          title: long,
          body: long,
          links: ["https://example.com/" + long],
          meeting_id: "meeting",
          status: "published",
          publish_at: null,
          updated_at: now,
        },
      ],
  meetings: empty
    ? []
    : [{ id: "meeting", title: long, starts_at: now, updated_at: now }],
  assignments: empty
    ? []
    : [task, { ...task, id: "task-two", title: "Tugas pembanding" }],
  attendance: [],
  daily: [],
  meeting_roster: roster.map((s) => ({
    student_id: s.id,
    meeting_id: "meeting",
  })),
  submissions: empty
    ? []
    : [
        {
          id: "submission",
          assignment_id: "task",
          student_id: student,
          revision: 1,
          version_id: "version",
          version: 1,
          body: long,
          links: [],
          asset_ids: [],
          submitted_at: now,
          is_late: false,
        },
      ],
  grades: [],
  assets: empty
    ? []
    : [
        ...(params.has("preview")
          ? [
              {
                id: "preview-image",
                target_id: "material",
                target_type: "material",
                name: "Gambar contoh.png",
                bytes: 100,
                owner_id: student,
                status: "ready",
              },
              {
                id: "preview-word",
                target_id: "material",
                target_type: "material",
                name: "Dokumen Word.docx",
                bytes: 100,
                owner_id: student,
                status: "ready",
              },
            ]
          : []),
        {
          id: "asset-material",
          target_id: "material",
          target_type: "material",
          name: long + ".pdf",
          bytes: 1200,
          owner_id: student,
          status: "ready",
        },
        {
          id: "asset-task",
          target_id: "task",
          target_type: "assignment",
          name: "Panduan tugas.pdf",
          bytes: 2400,
          owner_id: student,
          status: "ready",
        },
      ],
};
const question = {
  kind: "choice" as const,
  prompt: long,
  options: [long, "Jawaban B"],
  correct: 0,
  points: 1,
  explanation: "Penjelasan",
};
const attempt: Attempt = {
  id,
  quiz_id: id,
  student_id: student,
  title: long,
  instructions: long,
  status: "working",
  started_at: now,
  deadline: "2026-10-18T04:00:00Z",
  server_now: now,
  finished_at: null,
  revision: 0,
  max_score: 1,
  score: null,
  questions: [question],
  answers: [],
  can_answer: true,
  review_visible: false,
};
if (params.has("reliability")) {
  attempt.server_now = new Date().toISOString();
  attempt.deadline = new Date(Date.now() + 1800000).toISOString();
  attempt.title = "Uji keandalan kuis";
  attempt.instructions = "Pilih jawaban lalu tunggu sinkronisasi.";
  attempt.questions = [
    {
      kind: "choice",
      prompt: "Pilih jawaban",
      options: ["Jawaban A", "Jawaban B"],
      points: 1,
    },
  ];
}
const reliableAttempt = structuredClone(attempt);
let lastReliablePacket = "";
(window as any).__loseAck = false;
(window as any).__holdAnswer = false;
(window as any).__releaseAnswer = () => {};
(window as any).__reliableServer = reliableAttempt;
const report = (offset = 0) => ({
  offset,
  has_more: offset === 0,
  generated_at: now,
  course: course.course,
  rows: empty
    ? []
    : roster.slice(0, params.has("tables") ? 60 : 5).map((r) => ({
        ...r,
        present: 1,
        attendance_recorded: 1,
        overdue_missing: 0,
        submissions: 1,
        assignment_average: 80,
        quiz_average: 70,
        weighted_final: 75,
      })),
  quizzes: params.has("tables")
    ? roster.slice(0, 60).map((r, i) => ({
        quiz_id: id,
        title: "Kuis pembelajaran " + (i + 1),
        student_name: r.full_name,
        student_id: r.id,
        attempt_id: "attempt-" + i,
        status: "submitted",
        started_at: now,
        deadline: now,
        finished_at: now,
        score: 80,
        max_score: 100,
        grades_visible: true,
        can_open: false,
      }))
    : [],
  activity: { meetings: 1, materials: 1, assignments: 1, quizzes: 1 },
  weights: { assignment_weight: 50, quiz_weight: 50, visible: true },
});
const features = {
  actor: student,
  context: ctx,
  materials: course.materials.map((m) => ({
    ...m,
    accessible: true,
    completed: false,
    prerequisite_id: null,
    enabled: false,
  })),
  rules: empty
    ? []
    : [
        {
          assignment_id: "task",
          revision_limit: 20,
          late_minutes: 0,
          group_mode: true,
          rubric: [],
        },
      ],
  groups: empty
    ? []
    : [
        {
          id: "group",
          assignment_id: "task",
          name: long,
          revision: 0,
          members: roster.slice(0, 2),
        },
      ],
  progress: [],
};
const dev = {
  admin: true,
  features: {
    offline_enabled: false,
    team_enabled: false,
    channels_enabled: params.has("channels"),
    acceptance_reference: "Test fixture",
    revision: 0,
  },
  courses: [{ id, subject: long, classroom: "7A" }],
  users: roster.slice(0, 5),
  team: [],
  contacts: [],
};
(window as any).__seedOffline = () =>
  saveOffline({
    id: "draft",
    owner: student,
    school,
    course: id,
    kind: "draft",
    expires_at: new Date(Date.now() + 1800000).toISOString(),
    content: {
      id: "task",
      title: "Draf uji",
      body: "Tersimpan",
      links: [],
      formats: ["text"],
      revision: 0,
      request_id: id,
    },
  });
let channelJobs: {
  message_id: string;
  channel: string;
  subject: string;
  total: number;
  pending: number;
  accepted: number;
  uncertain: number;
}[] = [];
let managedUsers = params.has("userfilters")
  ? [
      ...["alpha", "beta", "guru2", "guru10", "2", "10"].map((name, i) => ({
        id: "managed-" + i,
        username_normalized: name,
        full_name: "Nama " + name,
        contact_email: null,
        email_verified_at: i % 3 === 1 ? null : now,
        must_change_password: i % 3 === 0,
        status: i % 2 === 0 ? "active" : "disabled",
        roles: ["student"],
      })),
      ...Array.from({ length: 55 }, (_, i) => ({
        id: "extra-" + i,
        username_normalized: "user" + i,
        full_name: "Pengguna " + i,
        contact_email: null,
        email_verified_at: now,
        must_change_password: false,
        status: "active",
        roles: ["student"],
      })),
      {
        id: "last-user",
        username_normalized: "999",
        full_name: "Hana Terakhir",
        contact_email: null,
        email_verified_at: null,
        must_change_password: false,
        status: "disabled",
        roles: ["student"],
      },
    ]
  : null;
const activeStudents = new Set(
  roster.filter((_, i) => !params.has("inactive") || i !== 1).map((r) => r.id),
);
const studentView = <T,>(data: T): T =>
  params.has("inactive") ? visibleStudentLists(data, activeStudents) : data;
const profileRole = params.get("profileRole") || "teacher";
let profileData: ProfileData = {
  id: student,
  name: long,
  username: "guru.001",
  email: "wali@example.test",
  email_verified_at: now,
  status: "active",
  created_at: now,
  school,
  school_name: long,
  roles:
    profileRole === "student"
      ? ["student"]
      : profileRole === "guardian"
        ? ["guardian"]
        : profileRole === "admin"
          ? ["admin"]
          : ["teacher", "principal", "homeroom_teacher", "duty_teacher"],
  is_student: profileRole === "student",
  is_teacher: profileRole === "teacher",
  phone: "081234567890",
  nip: "001234567890123456",
  npk: "0012345678901",
  nik: "",
  nik_masked: "••••••••••••1234",
  has_nik: true,
  has_photo: false,
  revision: 0,
  server_now: new Date().toISOString(),
  next: {
    name: null,
    identity: null,
    username: null,
    email: null,
    photo: null,
  },
  student_number: "000123",
  staff_code: "G001",
  classrooms: [{ id, name: "7A", year: "2026/2027", semester: 1 }],
  guardians: [
    { id, full_name: long, relationship: "Ibu", phone: "081234567890" },
  ],
  children: [
    { id: student, full_name: "Anak Pertama", relationship: "Wali" },
    { id: "child-2", full_name: "Anak Kedua", relationship: "Wali" },
  ],
  duties: [
    { kind: "Kepala Madrasah", detail: long, weekdays: null },
    { kind: "Wali Kelas", detail: "7A", weekdays: null },
    { kind: "Guru Piket", detail: "Semester aktif", weekdays: [1, 4] },
  ],
};
if (params.has("profilePhoto")) profileData.has_photo = true;
if (params.has("profileLocked"))
  for (const key of Object.keys(profileData.next))
    profileData.next[key as keyof ProfileData["next"]] = "2030-12-31T00:00:00Z";
const flowGoalId = "44444444-4444-4444-8444-444444444444";
const flowFixture: FlowState = {
  context: {
    manager: !isStudent,
    reviewer: !isStudent,
    admin: !isStudent,
    writable: !params.has("flowReadOnly"),
  },
  can_unlock: !isStudent,
  locked: params.has("flowLocked"),
  revision: 0,
  goals: empty
    ? []
    : [
        {
          id: flowGoalId,
          code: "TP-01",
          title: long,
          threshold: 75,
          active: true,
          revision: 0,
        },
      ],
  links: empty
    ? []
    : [{ goal_id: flowGoalId, kind: "assignment", activity_id: id }],
  activities: empty
    ? []
    : [
        { id, title: long, kind: "assignment" },
        { id: "quiz-flow", title: "Kuis konsep", kind: "quiz" },
      ],
  rows: [],
  has_more: false,
  followups: empty
    ? []
    : [
        {
          id: "followup-flow",
          student_id: student,
          full_name: long,
          kind: "remedial",
          activity_kind: "assignment",
          activity_id: id,
          plan: long,
          due_on: "2026-12-01",
          policy: "highest",
          cap: 75,
          status: "planned",
          result_score: null,
          note: "",
          revision: 0,
          baseline_changed: false,
        },
      ],
  finalizations: params.has("flowLocked")
    ? [{ id: "finalized", reason: long, created_at: now }]
    : [],
};
let rolloverCommitted = false;
const attachmentState: RetentionState = {
  policy: {
    enabled: false,
    pending_days: 2,
    material_days: 365,
    submission_days: 365,
    grace_days: 14,
    backup_required: true,
    revision: 0,
  },
  offset: 0,
  has_more: true,
  scheduler_configured: true,
  summary: {
    queued: 2,
    processing: 1,
    failed: 1,
    deleted: 1,
    estimated_queued_bytes: 2000000,
  },
  rows: Array.from(
    { length: 7 },
    (_, i): RetentionAsset => ({
      id: "retention-" + i,
      name: long + ".pdf",
      bytes: 1000000,
      target_type: i === 0 ? "material" : "submission",
      status: i > 2 ? "removed" : "ready",
      retention_hold: i === 6,
      retention_deleted_at: i === 5 ? now : null,
      eligible_category: i === 0 ? null : "submission",
      category: i === 0 ? null : "submission",
      state: (
        [
          null,
          "queued",
          "queued",
          "processing",
          "failed",
          "deleted",
          "cancelled",
        ] as RetentionAsset["state"][]
      )[i],
      queued_at: now,
      delete_after: now,
      backup_reference: "",
      backup_verified_at: null,
      attempts: 1,
      error_code: null,
    }),
  ),
};
const requests: Record<string, unknown>[] = [];
(window as any).__requests = requests;
(window as any).__fail = false;
window.fetch = async (url, options) => {
  const path = String(url),
    action = path.split("/").at(-1),
    body =
      options?.body instanceof FormData
        ? {}
        : JSON.parse(String(options?.body ?? "{}"));
  if (path === "/api/akademik/preview")
    return Response.json({
      count: 25,
      errors: [],
      display: Array.from({ length: 25 }, (_, i) => ({
        username: `siswa${i}`,
        name: `Siswa ${i}`,
        roles: "student",
        email: "wali@example.com",
      })),
    });
  requests.push({ path, ...body });
  if (params.has("reliability") && path.startsWith("/api/kuis/")) {
    if (action === "answers") {
      if (body.request_id !== lastReliablePacket) {
        if (body.revision !== reliableAttempt.revision)
          return Response.json(
            { message: "Jawaban berubah di perangkat lain." },
            { status: 409 },
          );
        reliableAttempt.answers = body.answers;
        reliableAttempt.revision++;
        lastReliablePacket = body.request_id;
      }
      if ((window as any).__holdAnswer)
        await new Promise<void>((r) => {
          (window as any).__releaseAnswer = r;
        });
      if ((window as any).__loseAck) {
        (window as any).__loseAck = false;
        throw new TypeError("Synthetic response lost after commit");
      }
    }
    if (action === "finish") {
      reliableAttempt.status = "submitted";
      reliableAttempt.finished_at = new Date().toISOString();
    }
    reliableAttempt.server_now = new Date().toISOString();
    const { id, status, revision, server_now, deadline, can_answer } =
      reliableAttempt;
    return Response.json({
      result:
        body.compact && status === "working"
          ? {
              id,
              status,
              revision,
              server_now,
              deadline,
              can_answer,
              compact: true,
            }
          : structuredClone(reliableAttempt),
    });
  }
  if (path.startsWith("/api/retensi-lampiran/")) {
    if (action === "settings")
      attachmentState.policy = {
        ...body.data,
        revision: attachmentState.policy.revision + 1,
      };
    const a = attachmentState.rows.find((a) => a.id === body.target);
    if (a && action === "hold") {
      a.retention_hold = body.data.hold;
      if (a.retention_hold && a.state === "queued") a.state = "cancelled";
    }
    if (a && action === "cancel") a.state = "cancelled";
    if (a && action === "requeue") a.state = "queued";
    if (a && action === "backup") {
      a.backup_reference = body.data.reference;
      a.backup_verified_at = now;
    }
    if (action === "run")
      for (const a of attachmentState.rows)
        if (a.state === "queued" && a.backup_verified_at) {
          a.state = "deleted";
          a.retention_deleted_at = now;
        }
    attachmentState.summary.queued = attachmentState.rows.filter(
      (a) => a.state === "queued",
    ).length;
    attachmentState.summary.deleted = attachmentState.rows.filter(
      (a) => a.state === "deleted",
    ).length;
    return Response.json({
      ok: true,
      result: {
        ...structuredClone(attachmentState),
        offset: body.offset ?? 0,
        has_more: !body.offset,
        rows: body.offset ? [] : structuredClone(attachmentState.rows),
      },
    });
  }
  if ((window as any).__fail)
    return new Response("<html>Upstream unavailable</html>", { status: 502 });
  await new Promise((r) => setTimeout(r, 30));
  if (path.startsWith("/api/alur-akademik/")) {
    if (action === "state") {
      const rows = (
        isStudent
          ? roster.slice(0, 1)
          : roster.slice(
              Number(body.offset || 0),
              Number(body.offset || 0) + 100,
            )
      ).map((r, i) => ({
        ...r,
        assignment_average: params.has("flowClosed") ? null : 80,
        quiz_average: params.has("flowClosed") ? null : 90,
        weighted_final: params.has("flowClosed") ? null : 85,
        goals: [
          {
            goal_id: flowGoalId,
            score: params.has("flowClosed") ? null : 80,
            assessed: params.has("flowClosed") ? 0 : 1,
            required: 1,
            mastered: params.has("flowClosed") ? null : i % 2 === 0,
            materials_completed: 1,
          },
        ],
      }));
      return Response.json({
        ok: true,
        result: {
          ...flowFixture,
          rows,
          has_more:
            !isStudent && Number(body.offset || 0) === 0 && roster.length > 100,
        },
      });
    }
    if (action === "snapshot")
      return Response.json({
        ok: true,
        result: { rows: roster.slice(0, 3).map((r) => ({ ...r, score: 80 })) },
      });
    if (action === "history")
      return Response.json({
        ok: true,
        result: {
          rows:
            empty || params.has("flowClosed")
              ? []
              : Array.from({ length: body.offset ? 2 : 26 }, (_, i) => ({
                  id: "history-" + String(body.offset || 0) + i,
                  student_id: student,
                  full_name: long,
                  kind: "assignment",
                  title: long,
                  position: null,
                  old_score: 50,
                  new_score: 80,
                  reason: long,
                  created_at: now,
                })),
        },
      });
    if (action === "goal-save") {
      const d = body.data;
      const existing = flowFixture.goals.find((g) => g.id === body.target);
      if (existing)
        Object.assign(existing, d, { revision: existing.revision + 1 });
      else flowFixture.goals.push({ id: "new-goal", ...d });
    }
    if (action === "goal-link") {
      const d = body.data;
      if (d.linked)
        flowFixture.links.push({
          goal_id: d.goal_id,
          kind: d.kind,
          activity_id: d.activity_id,
        });
      else
        flowFixture.links = flowFixture.links.filter(
          (l) => l.activity_id !== d.activity_id || l.goal_id !== d.goal_id,
        );
    }
    if (action === "lock" || action === "unlock") {
      flowFixture.locked = action === "lock";
      flowFixture.revision++;
    }
    if (action === "followup-complete" || action === "followup-withdraw") {
      const f = flowFixture.followups.find((f) => f.id === body.target);
      if (f)
        Object.assign(f, body.data, {
          status: action === "followup-complete" ? "completed" : "withdrawn",
          revision: f.revision + 1,
        });
    }
    if (action === "rollover-list")
      return Response.json({
        ok: true,
        result: {
          runs: [
            {
              id: "run-flow",
              source: long,
              destination: long,
              status: rolloverCommitted ? "committed" : "preview",
              mode: "semester",
              participant_count: 3,
              created_at: now,
              committed_at: null,
            },
          ],
        },
      });
    if (
      action === "rollover-commit" &&
      body.data.confirmation !== "PINDAHKAN PESERTA"
    )
      return Response.json(
        { ok: false, message: "Ketik konfirmasi yang diminta." },
        { status: 409 },
      );
    if (action === "rollover-commit") rolloverCommitted = true;
    if (action?.startsWith("rollover-"))
      return Response.json({
        ok: true,
        result: {
          run: {
            id: "run-flow",
            source_id: id,
            destination_id: "dest-room",
            status: rolloverCommitted ? "committed" : "preview",
            mode: "semester",
            participant_count: 3,
            created_at: now,
            committed_at: rolloverCommitted ? now : null,
            expires_at: "2030-12-01T00:00:00Z",
          },
          readiness: { unfinalized_courses: 2, working_quizzes: 0 },
          rows: roster.slice(0, 3).map((r, i) => ({
            ...r,
            student_id: r.id,
            source_enrollment_id: "source-enrollment-" + i,
            source_exists: true,
            destination_enrollment_id: rolloverCommitted
              ? "destination-enrollment-" + i
              : null,
            destination_status: rolloverCommitted ? "active" : null,
          })),
        },
      });
    return Response.json({ ok: true, result: { id: "new-flow-record" } });
  }
  if (path.startsWith("/api/keamanan/")) {
    if (action === "state")
      return Response.json({
        ok: true,
        result: {
          factors: params.has("mfaEnabled")
            ? [{ id, name: "Autentikator pribadi" }]
            : [],
          sessions: [
            {
              id,
              current: true,
              created_at: now,
              updated_at: null,
              user_agent: "Browser perangkat saat ini",
            },
            {
              id: "other-session",
              current: false,
              created_at: now,
              updated_at: now,
              user_agent: long,
            },
          ],
          events: [
            { id: "event", field: "security.nik_revealed", created_at: now },
          ],
        },
      });
    if (action === "enroll")
      return Response.json({
        ok: true,
        result: {
          factor_id: id,
          qr:
            "data:image/svg+xml;utf-8," +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>',
            ),
          secret: "TEST_ONLY_NOT_A_REAL_KEY",
        },
      });
    if (action === "reveal-nik") {
      if ((window as any).__securityDelay)
        await new Promise((r) => setTimeout(r, 250));
      return Response.json({ ok: true, result: { nik: "0012345678901234" } });
    }
    if (action === "verify")
      return Response.json({
        ok: true,
        next: "/ruang-belajar",
        message: "Verifikasi berhasil.",
      });
    return Response.json({
      ok: true,
      message: "Permintaan keamanan berhasil.",
    });
  }
  if (path.startsWith("/api/profil/")) {
    if (action === "email")
      return Response.json({
        ok: true,
        next: "/verifikasi",
        message: "Verifikasi email baru.",
      });
    if (action !== "read") {
      if (action === "photo" || action === "remove-photo") {
        profileData.has_photo = action === "photo";
        profileData.next.photo = "2030-12-31T00:00:00Z";
      } else if (action === "name") {
        profileData.name = body.name;
        profileData.next.name = "2030-12-31T00:00:00Z";
      } else if (action === "phone") profileData.phone = body.phone;
      else if (action === "identity") {
        profileData.nik = "";
        profileData.has_nik = !body.clear_nik;
        profileData.nik_masked = body.clear_nik ? "" : "••••••••••••1234";
        profileData.nip = body.nip || "";
        profileData.npk = body.npk || "";
        profileData.next.identity = "2030-12-31T00:00:00Z";
      } else if (action === "username") {
        profileData.username = body.username;
        profileData.next.username = "2030-12-31T00:00:00Z";
      }
      profileData.revision++;
    }
    return Response.json({
      ok: true,
      result: { ...profileData, next: { ...profileData.next } },
      message: "Perubahan profil berhasil disimpan.",
    });
  }
  let result: unknown = {};
  if (path.includes("/identitas/")) {
    if(action === "email") return params.has("mailfail") ? Response.json({message:"Email belum berhasil dikirim. Periksa alamat atau coba kirim ulang."},{status:503}) : Response.json({message:`Email verifikasi berhasil dikirim ke ${body.email}. Periksa kotak masuk dan folder spam.`});
    if(action === "admin-reset-password") {
      if(params.has("resetfail")) return Response.json({message:"Reset password belum berhasil. Coba kembali."},{status:503});
      const user = managedUsers?.find(u=>u.id===body.target);if(user) user.must_change_password=true;
      return Response.json({message:"Password pengguna berhasil direset menjadi 12345678. Pengguna wajib mengganti password saat login berikutnya."});
    }
    if (action === "admin-list")
      return Response.json({
        users:
          managedUsers ??
          roster.slice(0, 3).map((r) => ({
            ...r,
            username_normalized: long,
            contact_email: null,
            email_verified_at: now,
            must_change_password: false,
            status: "active",
            roles: ["teacher"],
          })),
      });
    if (managedUsers && action === "admin-create")
      managedUsers.push({
        id: "new-user",
        username_normalized: body.username,
        full_name: body.name,
        contact_email: body.email || null,
        email_verified_at: null,
        must_change_password: true,
        status: "active",
        roles: body.roles,
      });
    if (managedUsers && action === "admin-update") {
      const user = managedUsers.find((u) => u.id === body.target);
      if (user) {
        user.status = body.status;
        user.roles = body.roles;
      }
    }
    return Response.json({ message: "Tersimpan" });
  }
  switch (action) {
    case "course":
      result = course;
      break;
    case "features":
      result = features;
      break;
    case "weighted-report":
    case "report":
      result = report(body.offset ?? 0);
      break;
    case "portal":
      result = {
        children: [],
        courses: [
          {
            id,
            school_id: school,
            classroom: "7A",
            subject: long,
            teacher: long,
            year: "2026/2027",
            semester: 1,
            semester_status: "active",
          },
        ],
      };
      break;
    case "inbox":
      result = [];
      break;
    case "file-preview":
      if ((window as any).__previewFail)
        return Response.json(
          { message: "Berkas tidak dapat diakses." },
          { status: 403 },
        );
      return Response.json({
        ok: true,
        url:
          body.target === "preview-image"
            ? "/preview-image.png"
            : "/preview-file.pdf",
        mime: body.target === "preview-image" ? "image/png" : "application/pdf",
      });
    case "file-remove":
      if ((window as any).__removeFail)
        return Response.json(
          { message: "Penghapusan belum selesai. Coba lagi." },
          { status: 503 },
        );
      course.assets = course.assets.filter((a) => a.id !== body.target);
      break;
    case "channel-readiness":
      result = {
        telegram: {
          ready: params.has("channels"),
          message: params.has("channels")
            ? "Konfigurasi server tersedia."
            : "Kredensial penyedia belum dikonfigurasi untuk sekolah ini.",
        },
        whatsapp: {
          ready: params.has("channels"),
          message: params.has("channels")
            ? "Konfigurasi server tersedia."
            : "Kredensial penyedia belum dikonfigurasi untuk sekolah ini.",
        },
      };
      break;
    case "channel-queue":
      channelJobs = [
        {
          message_id: id,
          channel: "telegram",
          subject: "Kegiatan sekolah",
          total: 3,
          pending: 3,
          accepted: 0,
          uncertain: 0,
        },
      ];
      break;
    case "channel-send":
      channelJobs = [
        { ...channelJobs[0], pending: 0, accepted: 2, uncertain: 1 },
      ];
      result = { accepted: 2, uncertain: 1 };
      break;
    case "settings":
      result = dev;
      break;
    case "platform-state":
      result = {
        features: {
          multi_school: true,
          acceptance_reference: "Asynchronous feature setting",
        },
        schools: [{ id: school, name: long }],
      };
      break;
    case "schools":
      result = { central: true, schools: [{ id: school, name: long }] };
      break;
    case "retention-list":
      result = {
        records: [],
        students: roster,
        years: [
          {
            id,
            name: "2025/2026",
            starts_on: "2025-07-01",
            ends_on: "2026-06-30",
          },
        ],
      };
      break;
    case "list":
      result = {
        quizzes: empty
          ? []
          : [
              {
                id,
                title: long,
                instructions: long,
                status: "draft",
                duration_minutes: 30,
                opens_at: now,
                closes_at: now,
                grades_visible: false,
                explanations_visible: false,
                updated_at: now,
              },
            ],
        offset: 0,
        has_more: false,
        context: ctx,
      };
      break;
    case "submission-detail":
      result = { body: long, links: [], assets: [], grade: null };
      break;
    case "message-status":
      result = params.has("channels")
        ? [{ id, subject: "Kegiatan sekolah" }]
        : [];
      break;
    case "channel-state":
      result = channelJobs;
      break;
    case "bank-list":
    case "discussion-list":
    case "history":
      result = [];
      break;
    case "daily":
      result = { can_write: true, roster, attendance: [] };
      break;
    case "daily-report":
      result = {
        records: params.has("tables")
          ? roster.map((s) => ({
              student_id: s.id,
              full_name: s.full_name,
              status: "present",
              count: 3,
            }))
          : [],
      };
      break;
    case "bank-import":
      if ((window as any).__validImport) {
        result = { questions: [question] };
        break;
      }
      return Response.json({ message: "Baris 2 tidak valid" }, { status: 400 });
  }
  return Response.json({ ok: true, result: studentView(result) });
};
const academic = {
  school: {
    id: school,
    name: long,
    education_level: "MTs/SMP",
    updated_at: now,
  },
  users: roster.map((s) => ({ ...s, roles: ["student"], status: "active" })),
  semesters: [],
  classrooms: [],
  academic_years: [],
  subjects: params.has("tables")
    ? Array.from({ length: 40 }, (_, i) => ({
        id: `subject-${i}`,
        code: `MAPEL${i}`,
        name: long,
        active: true,
      }))
    : [],
};
const rolloverState: AcademicState = {
  ...academic,
  academic_years: [{ id, name: "2026/2027" }],
  semesters: [
    { id, academic_year_id: id, number: 1, status: "active" },
    { id: "dest-semester", academic_year_id: id, number: 2, status: "draft" },
  ],
  classrooms: [
    { id, semester_id: id, name: "7A", grade_level_id: id },
    {
      id: "dest-room",
      semester_id: "dest-semester",
      name: "7A",
      grade_level_id: id,
    },
  ],
  users: roster.map((r) => ({
    ...r,
    username_normalized: r.id,
    status: "active",
    roles: ["student"],
  })),
  student_enrollments: roster.map((r) => ({
    id: "enroll-" + r.id,
    classroom_id: id,
    semester_id: id,
    student_id: r.id,
    status: "active",
  })),
};
function Fixture() {
  const [mode] = useState(view);
  if (mode === "verify-feedback") return <AuthShell title="Verifikasi email Anda" description="Verifikasi email untuk melanjutkan."><AuthForm action="email" label="Kirim tautan verifikasi" fields={[{ name:"email", label:"Email pribadi atau wali", type:"email" }]} /></AuthShell>;
  if (mode === "auth")
    return (
      <AuthShell
        title="Masuk ke akun Anda"
        description={
          params.has("realistic")
            ? "Masuk menggunakan username dan password yang diberikan admin madrasah."
            : long
        }
      >
        <AuthForm
          action="login"
          label="Masuk"
          fields={[
            { name: "username", label: "Username" },
            { name: "password", label: "Password", type: "password" },
          ]}
        />
        <LogoutButton />
      </AuthShell>
    );
  if (mode === "dashboard")
    return (
      <WorkspaceDashboard
        name={params.has("realistic") ? "Ahmad Fadli" : long}
        roles={isStudent ? ["student"] : ["admin", "teacher"]}
        school={school}
      />
    );
  if (mode === "quiz")
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <QuizAttempt initial={attempt} course={id} />
      </main>
    );
  return (
    <AppShell>
      {mode === "course" ? (
        <CourseWorkspace initial={studentView(course)} />
      ) : mode === "flow" ? (
        <AcademicFlowPanel course={id} />
      ) : mode === "rollover" ? (
        <AcademicRollover
          school={school}
          state={rolloverState}
          onComplete={async () => {}}
        />
      ) : mode === "security" ? (
        <SecurityWorkspace admin />
      ) : mode === "mfa" ? (
        <MfaChallenge factors={[{ id, name: "Autentikator pribadi" }]} />
      ) : mode === "profile" ? (
        <ProfileWorkspace initial={profileData} />
      ) : mode === "academic" ? (
        <AcademicManager initial={studentView(academic)} school={school} />
      ) : mode === "users" ? (
        <UserManager school={school} />
      ) : mode === "daily" ? (
        <DailyAttendance
          school={school}
          meta={{
            today: "2026-10-18",
            classrooms: [
              {
                id,
                name: long,
                semester_id: id,
                starts_on: "2026-07-01",
                ends_on: "2026-12-31",
                semester_status: "active",
                year: "2026/2027",
                semester: 1,
              },
            ],
          }}
        />
      ) : mode === "quiz" ? (
        <QuizAttempt initial={attempt} course={id} />
      ) : mode === "monitoring" ? (
        <MonitoringDashboard school={school} />
      ) : mode === "attachment-retention" ? (
        <>
          <AttachmentRetention school={school} />
          <Files
            course={id}
            assets={[
              {
                id: "gone",
                name: "Lampiran terhapus.pdf",
                retention_deleted_at: now,
              },
            ]}
          />
        </>
      ) : mode === "retention" ? (
        <RetentionManager school={school} />
      ) : mode === "development" ? (
        <>
          <SchoolSwitcher selected={school} />
          <DevelopmentSettings school={school} central />
        </>
      ) : (
        <OfflineWorkspace />
      )}
    </AppShell>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
