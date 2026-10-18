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
const long = "DataPanjangTanpaSpasi".repeat(15),
  now = "2026-10-18T03:00:00Z";
const roster = empty
  ? []
  : Array.from({ length: 132 }, (_, i) => ({
      id: i === 0 ? student : `student-${i}`,
      full_name: i === 0 ? long : `Siswa ${i + 1}`,
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
  assignments: empty ? [] : [task],
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
  assets: [],
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
const report = (offset = 0) => ({
  offset,
  has_more: offset === 0,
  generated_at: now,
  course: course.course,
  rows: empty
    ? []
    : roster
        .slice(0, 5)
        .map((r) => ({
          ...r,
          present: 1,
          attendance_recorded: 1,
          overdue_missing: 0,
          submissions: 1,
          assignment_average: 80,
          quiz_average: 70,
          weighted_final: 75,
        })),
  quizzes: [],
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
    channels_enabled: false,
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
const requests: Record<string, unknown>[] = [];
(window as any).__requests = requests;
(window as any).__fail = false;
window.fetch = async (url, options) => {
  const path = String(url),
    action = path.split("/").at(-1),
    body = JSON.parse(String(options?.body ?? "{}"));
  requests.push({ path, ...body });
  if ((window as any).__fail)
    return new Response("<html>Upstream unavailable</html>", { status: 502 });
  await new Promise((r) => setTimeout(r, 30));
  let result: unknown = {};
  if (path.includes("/identitas/")) {
    if (action === "admin-list")
      return Response.json({
        users: roster
          .slice(0, 3)
          .map((r) => ({
            ...r,
            username_normalized: long,
            contact_email: null,
            email_verified_at: now,
            must_change_password: false,
            status: "active",
            roles: ["teacher"],
          })),
      });
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
    case "bank-list":
    case "message-status":
    case "channel-state":
    case "discussion-list":
    case "history":
      result = [];
      break;
    case "daily":
      result = { can_write: true, roster, attendance: [] };
      break;
    case "daily-report":
      result = { records: [] };
      break;
    case "bank-import":
      if ((window as any).__validImport) {
        result = { questions: [question] };
        break;
      }
      return Response.json({ message: "Baris 2 tidak valid" }, { status: 400 });
  }
  return Response.json({ ok: true, result });
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
};
function Fixture() {
  const [mode] = useState(view);
  if (mode === "auth")
    return (
      <AuthShell title="Masuk ke akun Anda" description={long}>
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
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-7 flex items-center justify-between">
        <a href="#">Kembali ke ruang belajar</a>
        <LogoutButton />
      </header>
      {mode === "course" ? (
        <CourseWorkspace initial={course} />
      ) : mode === "academic" ? (
        <AcademicManager initial={academic} school={school} />
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
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
