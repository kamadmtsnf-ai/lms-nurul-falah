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
    await t.test(
      "final cohort excludes inactive enrollments while preserving their ordinary report history",
      async () => {
        await f.db.query(
          "update student_enrollments set status='inactive' where student_id=$1",
          [f.actors[3].id],
        );
        assert.equal((await flow(1, "state")).rows.length, 1);
        assert.equal((await rpc(3, "quiz", "report")).rows.length, 1);
        const result = await flow(1, "lock", {
          revision: 2,
          reason: "Finalisasi peserta aktif saja",
        });
        const snap = await flow(1, "snapshot", {}, result.finalization_id);
        assert.equal(snap.rows.length, 1);
        assert.equal(snap.rows[0].id, f.actors[2].id);
        await assert.rejects(
          () => flow(3, "snapshot", {}, result.finalization_id),
          /Snapshot tidak dapat/,
        );
        await flow(0, "unlock", {
          revision: 3,
          reason: "Pemeriksaan setelah rekonsiliasi",
        });
        await f.db.query(
          "update student_enrollments set status='active' where student_id=$1",
          [f.actors[3].id],
        );
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

test("quiz corrections, guardian isolation, progress and head-of-school reopening", async () => {
  const f = await fixture(3);
  const flow = (
    actor: number,
    cmd: string,
    data: Record<string, unknown> = {},
    target?: string,
  ) =>
    f.as(
      actor,
      async (tx) =>
        (
          await tx.query<{ v: any }>(
            "select public.academic_flow_command($1,$2::jsonb) v",
            [cmd, JSON.stringify({ course: f.course, school, data, target })],
          )
        ).rows[0].v,
    );
  const adv = (cmd: string, data: Record<string, unknown>) =>
    f.as(
      1,
      async (tx) =>
        (
          await tx.query<{ v: any }>(
            "select public.advanced_command($1,$2::jsonb) v",
            [cmd, JSON.stringify({ course: f.course, data })],
          )
        ).rows[0].v,
    );
  try {
    await f.db.query("delete from student_enrollments where student_id=$1", [
      f.actors[4].id,
    ]);
    await f.db.query(
      "update membership_roles set role_code='guardian' where membership_id=(select id from school_memberships where user_id=$1)",
      [f.actors[4].id],
    );
    await f.academic("guardian_students", {
      guardian_id: f.actors[4].id,
      student_id: f.actors[2].id,
      relationship: "Ibu",
      active: true,
    });
    const q = (
      await f.command(1, "save", {
        data: {
          title: "Kuis esai",
          instructions: "Jawab esai",
          status: "published",
          opens_at: new Date(Date.now() - 60000).toISOString(),
          closes_at: new Date(Date.now() + 3600000).toISOString(),
          duration_minutes: 30,
          max_attempts: 2,
          questions: [
            {
              kind: "essay",
              prompt: "Jelaskan konsep",
              options: [],
              points: 10,
              explanation: "",
            },
          ],
        },
      })
    ).id;
    const a = (await f.command(2, "start", { target: q })).id;
    await f.command(2, "answers", {
      target: a,
      revision: 0,
      request_id: randomUUID(),
      answers: [{ position: 1, choice: "Jawaban esai" }],
    });
    await f.command(2, "finish", { target: a, revision: 1 });
    await f.command(1, "essay-grade", {
      target: a,
      data: { position: 1, score: 5, feedback: "Awal", expected_revision: 0 },
    });
    await assert.rejects(
      () =>
        f.command(1, "essay-grade", {
          target: a,
          data: {
            position: 1,
            score: 6,
            feedback: "Koreksi",
            expected_revision: 1,
          },
        }),
      /alasan/,
    );
    await f.command(1, "essay-grade", {
      target: a,
      data: {
        position: 1,
        score: 6,
        feedback: "Koreksi",
        expected_revision: 1,
        reason: "Peninjauan rubrik esai",
      },
    });
    const b = (await f.command(3, "start", { target: q })).id;
    await f.command(3, "finish", { target: b, revision: 0 });
    await f.command(1, "essay-grade", {
      target: b,
      data: { position: 1, score: 10, feedback: "Baik", expected_revision: 0 },
    });
    await adv("weights", {
      assignment_weight: 0,
      quiz_weight: 100,
      visible: true,
    });
    const goal = (
      await flow(1, "goal-save", {
        code: "TP-KUIS",
        title: "Pemahaman konsep dari kuis",
        threshold: 75,
      })
    ).id;
    await flow(1, "goal-link", {
      goal_id: goal,
      activity_id: q,
      kind: "quiz",
      linked: true,
      revision: 0,
    });
    const remedial = (
      await flow(1, "followup-create", {
        student_id: f.actors[2].id,
        kind: "remedial",
        activity_kind: "quiz",
        activity_id: q,
        plan: "Diskusi dan penilaian ulang",
        due_on: "2026-12-01",
        policy: "latest",
        cap: 75,
      })
    ).id;
    await flow(
      1,
      "followup-complete",
      { revision: 0, result_score: 90, note: "Hasil diskusi terukur" },
      remedial,
    );
    const hidden = await flow(4, "state");
    assert.equal(hidden.rows.length, 1);
    assert.equal(hidden.rows[0].id, f.actors[2].id);
    assert.equal(hidden.followups[0].result_score, null);
    assert.equal((await flow(4, "history")).rows.length, 0);
    const edit = await f.command(1, "edit", { target: q });
    await f.command(1, "release", {
      target: q,
      data: {
        grades_visible: true,
        explanations_visible: false,
        expected_updated_at: edit.updated_at,
      },
    });
    assert.equal((await flow(4, "state")).rows[0].weighted_final, 90);
    assert.equal((await flow(4, "history")).rows.length, 2);
    const retry = (
      await f.command(2, "start", { target: q, new_attempt: true })
    ).id;
    await assert.rejects(
      () => flow(1, "lock", { revision: 0, reason: "Ingin finalisasi" }),
      /kuis berlangsung/,
    );
    await f.command(2, "finish", { target: retry, revision: 0 });
    await f.command(1, "essay-grade", {
      target: retry,
      data: {
        position: 1,
        score: 8,
        feedback: "Peningkatan",
        expected_revision: 0,
      },
    });
    const current = await flow(4, "state");
    assert.equal(current.rows[0].weighted_final, 80);
    assert.equal(current.rows[0].goals[0].mastered, true);
    assert.equal(current.followups[0].baseline_changed, true);
    await flow(1, "lock", {
      revision: 0,
      reason: "Seluruh nilai telah diperiksa",
    });
    await assert.rejects(
      () =>
        f.command(1, "essay-grade", {
          target: retry,
          data: {
            position: 1,
            score: 9,
            feedback: "Koreksi",
            expected_revision: 1,
            reason: "Peninjauan ulang",
          },
        }),
      /terkunci/,
    );
    await f.db.query(
      "insert into membership_roles(school_id,membership_id,role_code) select $1,id,'principal' from school_memberships where user_id=$2",
      [school, f.actors[4].id],
    );
    assert.equal((await flow(4, "state")).can_unlock, true);
    await flow(4, "unlock", {
      revision: 1,
      reason: "Persetujuan kepala madrasah",
    });
    assert.equal((await flow(1, "state")).locked, false);
  } finally {
    await f.db.close();
  }
});

test("promotion supports advancing/repeating without period activation or loss of source enrollment", async () => {
  const f = await fixture(2);
  const flow = (
    cmd: string,
    data: Record<string, unknown> = {},
    target?: string,
  ) =>
    f.as(
      0,
      async (tx) =>
        (
          await tx.query<{ v: any }>(
            "select public.academic_flow_command($1,$2::jsonb) v",
            [cmd, JSON.stringify({ school, data, target })],
          )
        ).rows[0].v,
    );
  try {
    const c = (
        await f.db.query<{
          classroom_id: string;
          semester_id: string;
          grade_level_id: string;
          academic_year_id: string;
          updated_at: string;
        }>(
          "select cl.id classroom_id,cl.semester_id,cl.grade_level_id,s.academic_year_id,s.updated_at from classrooms cl join semesters s on s.id=cl.semester_id join teaching_classes tc on tc.classroom_id=cl.id where tc.id=$1",
          [f.course],
        )
      ).rows[0],
      y = new Date().getUTCFullYear();
    await f.academic("semesters", {
      id: c.semester_id,
      expected_updated_at: c.updated_at,
      academic_year_id: c.academic_year_id,
      number: 1,
      starts_on: `${y}-01-01`,
      ends_on: `${y}-06-30`,
      status: "active",
    });
    const genap = await f.academic("semesters", {
        academic_year_id: c.academic_year_id,
        number: 2,
        starts_on: `${y}-07-01`,
        ends_on: `${y}-12-31`,
        status: "active",
      }),
      src = await f.academic("classrooms", {
        semester_id: genap,
        grade_level_id: c.grade_level_id,
        name: "7 Genap",
      });
    for (const a of f.actors.slice(2))
      await f.academic("student_enrollments", {
        classroom_id: src,
        semester_id: genap,
        student_id: a.id,
        status: "active",
      });
    const year = await f.academic("academic_years", {
        name: String(y + 1),
        starts_on: `${y + 1}-01-01`,
        ends_on: `${y + 1}-12-31`,
        status: "draft",
      }),
      sem = await f.academic("semesters", {
        academic_year_id: year,
        number: 1,
        starts_on: `${y + 1}-01-01`,
        ends_on: `${y + 1}-06-30`,
        status: "draft",
      }),
      g8 = await f.academic("grade_levels", { number: 8, name: "8" }),
      g9 = await f.academic("grade_levels", { number: 9, name: "9" }),
      r8 = await f.academic("classrooms", {
        semester_id: sem,
        grade_level_id: g8,
        name: "8 A",
      }),
      r7 = await f.academic("classrooms", {
        semester_id: sem,
        grade_level_id: c.grade_level_id,
        name: "7 Mengulang",
      }),
      r9 = await f.academic("classrooms", {
        semester_id: sem,
        grade_level_id: g9,
        name: "9 Salah",
      });
    await assert.rejects(
      () =>
        flow("rollover-preview", {
          source: src,
          destination: r9,
          mode: "promotion",
          students: [f.actors[2].id],
        }),
      /naik satu tingkat/,
    );
    for (const [student, dest] of [
      [f.actors[2].id, r8],
      [f.actors[3].id, r7],
    ]) {
      const p = await flow("rollover-preview", {
        source: src,
        destination: dest,
        mode: "promotion",
        students: [student],
      });
      await flow(
        "rollover-commit",
        { confirmation: "PINDAHKAN PESERTA" },
        p.run.id,
      );
    }
    assert.equal(
      (
        await f.db.query(
          "select id from student_enrollments where classroom_id=$1",
          [src],
        )
      ).rows.length,
      2,
    );
    assert.equal(
      (
        await f.db.query<{ status: string }>(
          "select status from semesters where id=$1",
          [sem],
        )
      ).rows[0].status,
      "draft",
    );
    assert.equal(
      (
        await f.db.query(
          "select id from student_enrollments where semester_id=$1",
          [sem],
        )
      ).rows.length,
      2,
    );
  } finally {
    await f.db.close();
  }
});

test("finalization covers all 132 students across report pages", async () => {
  const f = await fixture(132);
  try {
    const task = (
      await f.db.query<{ id: string }>(
        "insert into learning_assignments(school_id,teaching_class_id,title,instructions,formats,due_at,max_score,status,created_by) values($1,$2,'Nilai 132 siswa','Latihan',array['text'],clock_timestamp()+interval '1 day',100,'published',$3) returning id",
        [school, f.course, f.actors[1].id],
      )
    ).rows[0].id;
    await f.db.query(
      "insert into learning_submissions(school_id,assignment_id,student_id) select $1,$2,unnest($3::uuid[])",
      [school, task, f.actors.slice(2).map((a) => a.id)],
    );
    await f.db.query(
      "insert into learning_submission_versions(id,school_id,submission_id,version,is_late) select gen_random_uuid(),school_id,id,1,false from learning_submissions where assignment_id=$1",
      [task],
    );
    await f.db.query(
      "update learning_submissions s set latest_version_id=v.id,revision=1 from learning_submission_versions v where v.submission_id=s.id and s.assignment_id=$1",
      [task],
    );
    await f.db.query(
      "insert into learning_grades(version_id,school_id,score,graded_by) select latest_version_id,school_id,90,$2 from learning_submissions where assignment_id=$1",
      [task, f.actors[1].id],
    );
    await f.as(1, (tx) =>
      tx.query("select public.advanced_command('weights',$1::jsonb)", [
        JSON.stringify({
          course: f.course,
          data: { assignment_weight: 100, quiz_weight: 0, visible: true },
        }),
      ]),
    );
    const call = (cmd: string, extra: Record<string, unknown> = {}) =>
      f.as(
        1,
        async (tx) =>
          (
            await tx.query<{ v: any }>(
              "select public.academic_flow_command($1,$2::jsonb) v",
              [cmd, JSON.stringify({ course: f.course, ...extra })],
            )
          ).rows[0].v,
      );
    assert.equal((await call("state")).rows.length, 100);
    assert.equal((await call("state", { offset: 100 })).rows.length, 32);
    await call("lock", {
      data: { revision: 0, reason: "Verifikasi lengkap 132 peserta" },
    });
    assert.equal(
      (await f.db.query("select * from private.final_grade_rows")).rows.length,
      132,
    );
  } finally {
    await f.db.close();
  }
});
