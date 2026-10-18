import { PGlite } from "@electric-sql/pglite";
import { randomBytes } from "node:crypto";
import {
  encryptBackup,
  decryptBackup,
} from "../scripts/testing/backup-crypto.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, school } from "../scripts/testing/fixture";
test("acceptance matrix: admin, teacher, student, guardian, principal, homeroom, duty, multirole and inactive", async (t) => {
  const f = await fixture(8);
  try {
    const roles: Record<number, string> = {
      3: "guardian",
      4: "principal",
      5: "homeroom_teacher",
      6: "duty_teacher",
      7: "teacher",
      8: "teacher",
    };
    for (const [key, role] of Object.entries(roles)) {
      const i = Number(key);
      await f.db.query("delete from student_enrollments where student_id=$1", [
        f.actors[i].id,
      ]);
      await f.db.query(
        "update membership_roles set role_code=$1 where membership_id=(select id from school_memberships where user_id=$2 and school_id=$3)",
        [role, f.actors[i].id, school],
      );
    }
    await f.db.query(
      "insert into membership_roles select school_id,id,'admin' from school_memberships where user_id=$1",
      [f.actors[8].id],
    );
    const room = (
      await f.db.query<{ classroom_id: string }>(
        "select classroom_id from teaching_classes where id=$1",
        [f.course],
      )
    ).rows[0].classroom_id;
    const semester = (
      await f.db.query<{ semester_id: string }>(
        "select semester_id from classrooms where id=$1",
        [room],
      )
    ).rows[0].semester_id;
    await f.academic("guardian_students", {
      guardian_id: f.actors[3].id,
      student_id: f.actors[2].id,
      relationship: "Wali",
      active: true,
    });
    await f.academic("homeroom_assignments", {
      classroom_id: room,
      teacher_id: f.actors[5].id,
    });
    await f.academic("duty_assignments", {
      semester_id: semester,
      teacher_id: f.actors[6].id,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      active: true,
    });
    const learning = (
      actor: number,
      cmd: string,
      p: Record<string, unknown> = {},
    ) =>
      f.as(
        actor,
        async (tx) =>
          (
            await tx.query<{ v: any }>(
              "select public.learning_command($1,$2::jsonb) v",
              [cmd, JSON.stringify({ course: f.course, ...p })],
            )
          ).rows[0].v,
      );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const [actor, name, manager, reviewer] of [
      [0, "admin", true, true],
      [1, "teacher", true, true],
      [2, "student", false, false],
      [3, "guardian", false, false],
      [4, "principal", false, true],
      [5, "homeroom", false, true],
      [8, "multirole", true, true],
    ] as const) {
      await t.test(name + " scope and write policy", async () => {
        const report = await f.command(actor, "report");
        assert.ok(report.rows.length >= 1);
        if (actor === 2 || actor === 3)
          assert.deepEqual(
            report.rows.map((r: any) => r.id),
            [f.actors[2].id],
          );
        const course = await learning(actor, "course");
        assert.equal(course.context.manager, manager);
        assert.equal(course.context.reviewer, reviewer);
        const write = () =>
          learning(actor, "meeting-save", {
            data: {
              title: "Acceptance " + name,
              starts_at: new Date().toISOString(),
            },
          });
        if (manager) await write();
        else await assert.rejects(write);
      });
    }
    await t.test(
      "duty records daily attendance but cannot grade or open unrelated course",
      async () => {
        await assert.rejects(() => learning(6, "course"));
        await learning(6, "daily-save", {
          school,
          classroom: room,
          date: today,
          entries: [{ student: f.actors[2].id, status: "present", reason: "" }],
        });
        await assert.rejects(() =>
          learning(6, "grade", { target: f.course, data: { score: 100 } }),
        );
      },
    );
    await t.test(
      "ordinary teacher cannot replace daily duty, and unrelated teacher is denied course",
      async () => {
        await assert.rejects(() =>
          learning(1, "daily-save", {
            school,
            classroom: room,
            date: today,
            entries: [
              { student: f.actors[2].id, status: "present", reason: "" },
            ],
          }),
        );
        await assert.rejects(() => learning(7, "course"));
      },
    );
    await t.test(
      "inactive account and revoked session cannot use any role privilege",
      async () => {
        await f.db.query("update profiles set status='disabled' where id=$1", [
          f.actors[9].id,
        ]);
        await assert.rejects(() => f.command(9, "report"));
        await f.db.query("delete from auth.sessions where id=$1", [
          f.actors[8].session,
        ]);
        await assert.rejects(() => learning(8, "course"));
      },
    );
    await t.test(
      "full synthetic application image restores data, roles, RLS and authorized reports",
      async () => {
        const key = randomBytes(32),
          image = await f.db.dumpDataDir();
        const encrypted = encryptBackup(
          Buffer.from(await image.arrayBuffer()),
          key,
        );
        const restored = new PGlite({
          loadDataDir: new Blob([
            new Uint8Array(decryptBackup(encrypted, key)),
          ]),
        });
        try {
          await restored.waitReady;
          const before = (
            await f.db.query<any>("select count(*) n from profiles")
          ).rows[0].n;
          assert.equal(
            (await restored.query<any>("select count(*) n from profiles"))
              .rows[0].n,
            before,
          );
          await restored.query(
            "select set_config('request.jwt.claims',$1,false)",
            [
              JSON.stringify({
                sub: f.actors[4].id,
                session_id: f.actors[4].session,
                role: "authenticated",
              }),
            ],
          );
          await restored.exec("set role authenticated");
          const report = (
            await restored.query<{ v: any }>(
              "select public.quiz_command($1,$2::jsonb) v",
              ["report", JSON.stringify({ course: f.course })],
            )
          ).rows[0].v;
          assert.ok(report.rows.some((r: any) => r.id === f.actors[2].id));
          await assert.rejects(
            () => restored.exec("select * from private.quiz_answers"),
            /permission denied/,
          );
        } finally {
          await restored.close();
          key.fill(0);
        }
      },
    );
  } finally {
    await f.db.close();
  }
});
