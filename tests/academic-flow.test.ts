import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, school } from "../scripts/testing/fixture";
import { flowActions } from "../src/lib/academic-flow/validation";
test("academic flow validation rejects duplicate students, forged fields and enrichment replacing grades", () => {
  const student = randomUUID();
  assert.equal(
    flowActions["rollover-preview"].safeParse({
      source: randomUUID(),
      destination: randomUUID(),
      mode: "semester",
      students: [student, student],
    }).success,
    false,
  );
  assert.equal(
    flowActions.lock.safeParse({ revision: 0, reason: "ok", role: "admin" })
      .success,
    false,
  );
  assert.equal(
    flowActions["followup-create"].safeParse({
      student_id: student,
      kind: "enrichment",
      activity_kind: "assignment",
      activity_id: randomUUID(),
      plan: "Latihan konsep",
      due_on: "2026-12-01",
      policy: "latest",
      cap: 75,
    }).success,
    false,
  );
});
test("academic workflow database integration", async (t) => {
  const f = await fixture(2);
  const rpc = (
    actor: number,
    name: string,
    cmd: string,
    p: Record<string, unknown> = {},
  ) =>
    f.as(
      actor,
      async (tx) =>
        (
          await tx.query<{ v: any }>(
            `select public.${name}_command($1,$2::jsonb) v`,
            [cmd, JSON.stringify({ course: f.course, school, ...p })],
          )
        ).rows[0].v,
    );
  const flow = (
      actor: number,
      cmd: string,
      data: Record<string, unknown> = {},
      target?: string,
    ) =>
      rpc(actor, "academic_flow", cmd, { data, ...(target ? { target } : {}) }),
    learn = (actor: number, cmd: string, p: Record<string, unknown> = {}) =>
      rpc(actor, "learning", cmd, p),
    adv = (cmd: string, data: Record<string, unknown>) =>
      rpc(1, "advanced", cmd, { data });
  const grade = async (id: string) =>
    (
      await f.db.query<{ score: number; updated_at: string }>(
        "select score,updated_at from learning_grades where version_id=$1",
        [id],
      )
    ).rows[0];
  try {
    const task = (
      await learn(1, "assignment-save", {
        data: {
          title: "Tugas terukur",
          instructions: "Latihan",
          formats: ["text"],
          due_at: new Date(Date.now() + 86400000).toISOString(),
          accept_late: true,
          max_score: 100,
          status: "published",
          publish_at: null,
        },
      })
    ).id;
    const versions = [randomUUID(), randomUUID()];
    for (let i = 0; i < 2; i++)
      await learn(i + 2, "submit", {
        target: task,
        data: {
          request_id: versions[i],
          revision: 0,
          body: "Jawaban lengkap",
          links: [],
          asset_ids: [],
        },
      });
    await learn(1, "grade", {
      target: versions[0],
      data: { score: 50, feedback: "Perlu latihan" },
    });
    await adv("weights", {
      assignment_weight: 100,
      quiz_weight: 0,
      visible: false,
    });
    let gid = "",
      fid = "";
    await t.test(
      "TP and mappings require manager, same course and current revision",
      async () => {
        await assert.rejects(
          () =>
            flow(2, "goal-save", {
              code: "TP1",
              title: "Memahami konsep",
              threshold: 75,
            }),
          /Hanya/,
        );
        gid = (
          await flow(1, "goal-save", {
            code: "TP1",
            title: "Memahami konsep",
            threshold: 75,
          })
        ).id;
        await flow(1, "goal-link", {
          goal_id: gid,
          kind: "assignment",
          activity_id: task,
          linked: true,
          revision: 0,
        });
        await assert.rejects(
          () =>
            flow(1, "goal-link", {
              goal_id: gid,
              kind: "quiz",
              activity_id: randomUUID(),
              linked: true,
              revision: 1,
            }),
          /Aktivitas/,
        );
        await assert.rejects(
          () =>
            flow(
              1,
              "goal-save",
              {
                code: "TP1",
                title: "Data usang",
                threshold: 75,
                active: true,
                revision: 0,
              },
              gid,
            ),
          /berubah/,
        );
        assert.equal((await flow(1, "state")).rows[0].goals[0].mastered, false);
      },
    );
    await t.test(
      "finalization rejects incomplete grades; remedial changes effective reports without overwriting base",
      async () => {
        await assert.rejects(
          () => flow(1, "lock", { revision: 0, reason: "Penilaian selesai" }),
          /seluruh nilai lengkap/,
        );
        fid = (
          await flow(1, "followup-create", {
            student_id: f.actors[2].id,
            kind: "remedial",
            activity_kind: "assignment",
            activity_id: task,
            plan: "Latihan ulang konsep dasar",
            due_on: "2026-12-01",
            policy: "highest",
            cap: 75,
          })
        ).id;
        await flow(
          1,
          "followup-complete",
          {
            revision: 0,
            result_score: 80,
            note: "Hasil latihan terverifikasi",
          },
          fid,
        );
        assert.equal(Number((await grade(versions[0])).score), 50);
        const row = (await flow(1, "state")).rows.find(
          (r: any) => r.id === f.actors[2].id,
        );
        assert.equal(row.weighted_final, 80);
        assert.equal(row.goals[0].mastered, true);
        assert.equal(
          (await rpc(1, "quiz", "report")).rows.find(
            (r: any) => r.id === f.actors[2].id,
          ).assignment_average,
          80,
        );
      },
    );
    await t.test(
      "closed grades hide mastery, follow-up results/notes and history; released data is owner scoped",
      async () => {
        const hidden = await flow(2, "state");
        assert.equal(hidden.rows.length, 1);
        assert.equal(hidden.rows[0].assignment_average, null);
        assert.equal(hidden.rows[0].goals[0].score, null);
        assert.equal(hidden.followups[0].result_score, null);
        assert.equal(hidden.followups[0].note, "");
        assert.equal("base_signature" in hidden.followups[0], false);
        assert.equal((await flow(2, "history")).rows.length, 0);
        await learn(1, "grade", {
          target: versions[1],
          data: { score: 60, feedback: "Nilai awal" },
        });
        const a = (await learn(1, "course")).assignments[0];
        await learn(1, "release-grades", {
          target: task,
          data: { visible: true, expected_updated_at: a.updated_at },
        });
        await adv("weights", {
          assignment_weight: 100,
          quiz_weight: 0,
          visible: true,
        });
        assert.equal((await flow(2, "state")).rows[0].weighted_final, 80);
        assert.equal((await flow(2, "history")).rows.length, 1);
        await assert.rejects(
          () =>
            flow(
              2,
              "followup-complete",
              { revision: 1, result_score: 100, note: "Nilai palsu" },
              fid,
            ),
          /Hanya/,
        );
      },
    );
    await t.test(
      "locked final snapshots freeze grades, submissions, goals and weights but allow release; only authorized reopening works",
      async () => {
        await flow(1, "lock", {
          revision: 0,
          reason: "Seluruh nilai diperiksa",
        });
        assert.equal((await flow(1, "state")).locked, true);
        assert.equal(
          (await f.db.query("select * from private.final_grade_rows")).rows
            .length,
          2,
        );
        const g = await grade(versions[0]);
        await assert.rejects(
          () =>
            learn(1, "grade", {
              target: versions[0],
              data: {
                score: 90,
                feedback: "Koreksi",
                reason: "Koreksi hasil",
                expected_updated_at: g.updated_at,
              },
            }),
          /terkunci/,
        );
        await assert.rejects(
          () =>
            learn(2, "submit", {
              target: task,
              data: {
                request_id: randomUUID(),
                revision: 1,
                body: "Revisi",
                links: [],
                asset_ids: [],
              },
            }),
          /terkunci/,
        );
        await assert.rejects(
          () =>
            adv("weights", {
              assignment_weight: 50,
              quiz_weight: 50,
              visible: true,
            }),
          /terkunci/,
        );
        await assert.rejects(
          () =>
            flow(1, "goal-save", {
              code: "TP2",
              title: "Tujuan baru",
              threshold: 75,
            }),
          /terkunci/,
        );
        await assert.rejects(
          () => flow(1, "unlock", { revision: 1, reason: "Perlu koreksi" }),
          /Hanya admin/,
        );
        await adv("weights", {
          assignment_weight: 100,
          quiz_weight: 0,
          visible: false,
        });
        assert.equal((await flow(2, "state")).rows[0].weighted_final, null);
        await adv("weights", {
          assignment_weight: 100,
          quiz_weight: 0,
          visible: true,
        });
        await flow(0, "unlock", {
          revision: 1,
          reason: "Koreksi setelah pemeriksaan",
        });
        await assert.rejects(
          () => flow(0, "unlock", { revision: 1, reason: "Permintaan usang" }),
          /berubah/,
        );
      },
    );
    await t.test(
      "grade corrections need reasons and invalidate obsolete remedial; immutable snapshots and history remain",
      async () => {
        const g = await grade(versions[0]);
        await assert.rejects(
          () =>
            learn(1, "grade", {
              target: versions[0],
              data: {
                score: 55,
                feedback: "Koreksi",
                expected_updated_at: g.updated_at,
              },
            }),
          /alasan/,
        );
        await learn(1, "grade", {
          target: versions[0],
          data: {
            score: 55,
            feedback: "Koreksi hasil",
            reason: "Perbaikan hitung rubrik",
            expected_updated_at: g.updated_at,
          },
        });
        const state = await flow(1, "state");
        assert.equal(
          state.rows.find((r: any) => r.id === f.actors[2].id).weighted_final,
          55,
        );
        assert.equal(state.followups[0].baseline_changed, true);
        const h = (await flow(1, "history", { student_id: f.actors[2].id }))
          .rows[0];
        assert.equal(h.old_score, 50);
        assert.equal(h.new_score, 55);
        assert.equal(
          Number(
            (
              await f.db.query<{ score: number }>(
                "select score from private.final_grade_rows where student_id=$1",
                [f.actors[2].id],
              )
            ).rows[0].score,
          ),
          80,
        );
      },
    );
    await t.test(
      "all replacement policies, enrichment, withdrawal and stale revisions",
      async () => {
        for (const [policy, result, expected] of [
          ["highest", 40, 55],
          ["latest", 40, 40],
          ["capped", 95, 75],
          ["preserve", 95, 55],
        ] as const) {
          const id = (
            await flow(1, "followup-create", {
              student_id: f.actors[2].id,
              kind: policy === "preserve" ? "enrichment" : "remedial",
              activity_kind: "assignment",
              activity_id: task,
              plan: "Kegiatan tindak lanjut",
              due_on: "2026-12-01",
              policy,
              cap: 75,
            })
          ).id;
          await flow(
            1,
            "followup-complete",
            {
              revision: 0,
              result_score: result,
              note: "Hasil kegiatan dicatat",
            },
            id,
          );
          assert.equal(
            (await flow(1, "state")).rows.find(
              (r: any) => r.id === f.actors[2].id,
            ).weighted_final,
            expected,
          );
          await assert.rejects(
            () =>
              flow(
                1,
                "followup-complete",
                { revision: 0, result_score: 100, note: "Permintaan usang" },
                id,
              ),
            /berubah/,
          );
          await flow(
            1,
            "followup-withdraw",
            { revision: 1, note: "Penarikan hasil untuk pemeriksaan" },
            id,
          );
        }
      },
    );
    await t.test(
      "nonactive accounts hidden without deleting history",
      async () => {
        await f.db.query("update profiles set status='disabled' where id=$1", [
          f.actors[2].id,
        ]);
        const s = await flow(1, "state");
        assert.equal(
          s.rows.some((r: any) => r.id === f.actors[2].id),
          false,
        );
        assert.equal(
          s.followups.some((r: any) => r.student_id === f.actors[2].id),
          false,
        );
        assert.equal(
          (await flow(1, "history")).rows.some(
            (r: any) => r.student_id === f.actors[2].id,
          ),
          false,
        );
        assert.equal(Number((await grade(versions[0])).score), 55);
        await f.db.query("update profiles set status='active' where id=$1", [
          f.actors[2].id,
        ]);
      },
    );
    const room = (
        await f.db.query<{ classroom_id: string }>(
          "select classroom_id from teaching_classes where id=$1",
          [f.course],
        )
      ).rows[0].classroom_id,
      sem = (
        await f.db.query<{
          id: string;
          academic_year_id: string;
          updated_at: string;
        }>(
          "select s.* from semesters s join classrooms c on c.semester_id=s.id where c.id=$1",
          [room],
        )
      ).rows[0],
      grade7 = (
        await f.db.query<{ grade_level_id: string }>(
          "select grade_level_id from classrooms where id=$1",
          [room],
        )
      ).rows[0].grade_level_id,
      y = new Date().getUTCFullYear();
    await f.academic("semesters", {
      id: sem.id,
      expected_updated_at: sem.updated_at,
      academic_year_id: sem.academic_year_id,
      number: 1,
      starts_on: `${y}-01-01`,
      ends_on: `${y}-06-30`,
      status: "active",
    });
    const ds = await f.academic("semesters", {
        academic_year_id: sem.academic_year_id,
        number: 2,
        starts_on: `${y}-07-01`,
        ends_on: `${y}-12-31`,
        status: "draft",
      }),
      dest = await f.academic("classrooms", {
        semester_id: ds,
        grade_level_id: grade7,
        name: "7A Genap",
      });
    await t.test(
      "rollover validates roles/participants, revalidates preview and commits atomically and idempotently while keeping archives",
      async () => {
        await assert.rejects(() => flow(1, "rollover-list"), /Hanya admin/);
        const d = {
          source: room,
          destination: dest,
          mode: "semester",
          students: [f.actors[2].id, f.actors[3].id],
        };
        await assert.rejects(
          () =>
            flow(0, "rollover-preview", {
              ...d,
              students: [f.actors[2].id, randomUUID()],
            }),
          /Peserta berubah/,
        );
        const p = await flow(0, "rollover-preview", d);
        assert.equal(p.rows.length, 2);
        await f.db.query(
          "update profiles set full_name='Perubahan setelah pratinjau' where id=$1",
          [f.actors[2].id],
        );
        await assert.rejects(
          () =>
            flow(
              0,
              "rollover-commit",
              { confirmation: "PINDAHKAN PESERTA" },
              p.run.id,
            ),
          /Data berubah/,
        );
        assert.equal(
          (
            await f.db.query(
              "select id from student_enrollments where classroom_id=$1",
              [dest],
            )
          ).rows.length,
          0,
        );
        const fresh = await flow(0, "rollover-preview", d);
        await assert.rejects(
          () =>
            flow(0, "rollover-commit", { confirmation: "YA" }, fresh.run.id),
          /Konfirmasi/,
        );
        const c = await flow(
            0,
            "rollover-commit",
            { confirmation: "PINDAHKAN PESERTA" },
            fresh.run.id,
          ),
          retry = await flow(
            0,
            "rollover-commit",
            { confirmation: "PINDAHKAN PESERTA" },
            fresh.run.id,
          );
        assert.deepEqual(retry.rows, c.rows);
        assert.equal(c.run.status, "committed");
        assert.equal(
          (
            await f.db.query(
              "select id from student_enrollments where classroom_id=$1",
              [room],
            )
          ).rows.length,
          2,
        );
        assert.equal(
          (
            await f.db.query(
              "select id from student_enrollments where classroom_id=$1",
              [dest],
            )
          ).rows.length,
          2,
        );
        assert.equal(
          (
            await f.db.query<{ status: string }>(
              "select status from semesters where id=$1",
              [ds],
            )
          ).rows[0].status,
          "draft",
        );
        await assert.rejects(
          () => flow(0, "rollover-preview", d),
          /sudah memiliki/,
        );
        assert.ok(
          c.rows.every(
            (r: any) => r.source_exists && r.destination_status === "active",
          ),
        );
      },
    );
    await t.test("RLS, scoped RPC and MFA remain enforced", async () => {
      await assert.rejects(
        () =>
          f.as(3, (tx) => tx.query("select * from private.final_grade_rows")),
        /permission denied/,
      );
      await assert.rejects(
        () => rpc(3, "academic_flow", "state", { course: randomUUID() }),
        /diakses/,
      );
      await f.db.query(
        "insert into auth.mfa_factors values($1,$2,'verified','totp')",
        [randomUUID(), f.actors[0].id],
      );
      await assert.rejects(
        () => flow(0, "rollover-list"),
        /Verifikasi dua langkah/,
      );
    });
  } finally {
    await f.db.close();
  }
});
