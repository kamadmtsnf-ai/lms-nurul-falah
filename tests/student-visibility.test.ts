import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterStudentLists,
  visibleStudentLists,
  studentIdsInLists,
} from "../src/lib/students/visibility";

test("disabled students excluded consistently from academic, attendance, grade, quiz, parent and group lists without mutating history", () => {
  const payload = {
    roster: [{ id: "on" }, { id: "off" }],
    users: [
      { id: "on", roles: ["student"] },
      { id: "off", roles: ["student"] },
      { id: "teacher", roles: ["teacher"] },
    ],
    student_details: [{ student_id: "off" }, { student_id: "on" }],
    student_enrollments: [{ student_id: "off" }],
    guardian_students: [{ student_id: "off" }],
    meeting_roster: [{ student_id: "on" }, { student_id: "off" }],
    attendance: [{ student_id: "off", status: "present" }],
    daily: [{ student_id: "off" }],
    submissions: [{ student_id: "off" }],
    grades: [{ student_id: "off" }],
    rows: [{ id: "on" }, { id: "off" }],
    quizzes: [{ student_id: "off" }],
    children: [{ id: "off" }],
    context: { children: ["on", "off"] },
    groups: [{ id: "group", members: [{ id: "on" }, { id: "off" }] }],
    progress: [{ student_id: "off" }],
    materials: [{ id: "material" }],
    has_more: true,
    offset: 100,
  };
  const original = structuredClone(payload),
    r = visibleStudentLists(payload, new Set(["on"]));
  assert.deepEqual(payload, original);
  assert.deepEqual(r.roster, [{ id: "on" }]);
  assert.equal(r.users.length, 2);
  assert.equal(r.users[1].id, "teacher");
  for (const key of [
    "student_enrollments",
    "guardian_students",
    "attendance",
    "daily",
    "submissions",
    "grades",
    "quizzes",
    "children",
    "progress",
  ] as const)
    assert.equal(r[key].length, 0, key);
  assert.deepEqual(r.context.children, ["on"]);
  assert.deepEqual(r.groups[0].members, [{ id: "on" }]);
  assert.equal(r.groups[0].id, "group");
  assert.equal(r.materials[0].id, "material");
  assert.equal(r.has_more, true);
  assert.equal(r.offset, 100);
  assert.deepEqual(
    visibleStudentLists(payload, new Set(["on", "off"])),
    payload,
  );
  assert.deepEqual(studentIdsInLists(payload).sort(), ["off", "on"]);
});
test("profile checks batch/deduplicate authorized ids, fail closed, and skip unrelated responses", async () => {
  const rows = Array.from({ length: 301 }, (_, i) => ({ id: `s${i}` }));
  const batches: number[] = [];
  const result = await filterStudentLists(
    { rows, roster: rows },
    async (ids) => {
      batches.push(ids.length);
      return ids.filter((id) => id !== "s300");
    },
  );
  assert.deepEqual(batches, [150, 150, 1]);
  assert.equal(result.rows.length, 300);
  assert.equal(result.roster.length, 300);
  await assert.rejects(
    () =>
      filterStudentLists({ rows }, async () => {
        throw Error("unavailable");
      }),
    /unavailable/,
  );
  assert.equal(
    (await filterStudentLists({ rows }, async () => [])).rows.length,
    0,
  );
  await filterStudentLists({ questions: [{ id: "question" }] }, async () => {
    throw Error("unnecessary lookup");
  });
});
test("real database account status controls daily/course/report/academic lists; reactivation restores history and identity admin remains unfiltered", async () => {
  const { fixture, school } = await import("../scripts/testing/fixture");
  const f = await fixture(3);
  try {
    const rpc = (name: string, cmd: string, p: Record<string, unknown>) =>
      f.as(
        0,
        async (tx) =>
          (
            await tx.query<{ v: any }>(
              `select public.${name}($1,$2::jsonb) v`,
              [cmd, JSON.stringify(p)],
            )
          ).rows[0].v,
      );
    const visible = async (payload: any) =>
      filterStudentLists(payload, async (ids) =>
        (
          await f.db.query<{ id: string }>(
            "select id from profiles where id=any($1::uuid[]) and status='active'",
            [ids],
          )
        ).rows.map((r) => r.id),
      );
    const off = f.actors[2].id;
    const before = await rpc("learning_command", "course", {
      course: f.course,
    });
    assert.equal(before.roster.length, 3);
    await f.db.query("update profiles set status='disabled' where id=$1", [
      off,
    ]);
    for (const [name, cmd, p] of [
      ["learning_command", "course", { course: f.course }],
      [
        "learning_command",
        "daily",
        {
          school,
          classroom: before.context.classroom,
          date: new Date().toISOString().slice(0, 10),
        },
      ],
      ["quiz_command", "report", { course: f.course }],
      ["advanced_command", "weighted-report", { course: f.course }],
      ["academic_command", "state", { school }],
    ] as const) {
      const raw = await rpc(name, cmd, p),
        result = await visible(raw);
      assert.ok(!studentIdsInLists(result).includes(off), cmd);
      if (cmd === "report" || cmd === "weighted-report") assert.ok(!studentIdsInLists(raw).includes(off), `${cmd} filters disabled students in database too`);
      else assert.ok(studentIdsInLists(raw).includes(off), `${cmd} fixture contains inactive student`);
    }
    const managed = (
      await f.db.query<{ v: any[] }>(
        "select public.identity_command($1,$2::jsonb) v",
        [
          "admin_list",
          JSON.stringify({
            actor: f.actors[0].id,
            session: f.actors[0].session,
            school,
            offset: 0,
          }),
        ],
      )
    ).rows[0].v;
    assert.equal(managed.find((r) => r.id === off).status, "disabled");
    assert.equal(
      (
        await f.db.query<{ n: number }>(
          "select count(*)::int n from student_enrollments where student_id=$1",
          [off],
        )
      ).rows[0].n,
      1,
    );
    await f.db.query("update profiles set status='active' where id=$1", [off]);
    assert.equal((await visible(before)).roster.length, 3);
  } finally {
    await f.db.close();
  }
});
