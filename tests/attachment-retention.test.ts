import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, school } from "../scripts/testing/fixture";
import { processRetention } from "../src/lib/attachment-retention/worker";
import { retentionActions } from "../src/lib/attachment-retention/validation";
test("retention validation rejects unsafe settings and ambiguous backup claims", () => {
  assert.equal(
    retentionActions.settings.safeParse({
      revision: 0,
      enabled: true,
      pending_days: 0,
      material_days: 1,
      submission_days: 1,
      grace_days: 0,
      backup_required: false,
    }).success,
    false,
  );
  assert.equal(
    retentionActions.backup.safeParse({
      reference: "file",
      confirmation: "yes",
    }).success,
    false,
  );
  assert.equal(
    retentionActions.run.safeParse({ confirmation: "JALANKAN BATCH RETENSI" })
      .success,
    true,
  );
});
test("storage worker never acknowledges failure or an uncertain database result", async () => {
  let issued = false;
  const calls: string[] = [];
  const command = async (cmd: string) => {
    calls.push(cmd);
    if (cmd === "claim" && !issued) {
      issued = true;
      return { id: "asset", path: school + "/course/asset", token: "lease" };
    }
    return {};
  };
  const r = await processRetention(
    {
      command,
      remove: async () => {
        throw Error("network");
      },
    },
    school,
    { limit: 1 },
  );
  assert.equal(r.failed, 1);
  assert.deepEqual(calls, ["scan", "claim", "fail"]);
  issued = false;
  calls.length = 0;
  await assert.rejects(
    () =>
      processRetention(
        {
          command: async (cmd) => {
            const r = await command(cmd);
            if (cmd === "ack") throw Error("lost ack");
            return r;
          },
          remove: async () => {},
        },
        school,
        { limit: 1 },
      ),
    /lost ack/,
  );
  assert.equal(calls.includes("fail"), false);
});
test("attachment lifecycle: admin scope, safe queue, hold, grace, backup, lease, tombstone and metadata preservation", async (t) => {
  const f = await fixture(3);
  try {
    const api = (actor: number, cmd: string, p: Record<string, unknown> = {}) =>
      f.as(
        actor,
        async (tx) =>
          (
            await tx.query<{ v: any }>(
              "select public.attachment_retention_command($1,$2::jsonb) v",
              [cmd, JSON.stringify({ school, ...p })],
            )
          ).rows[0].v,
      );
    const worker = async (cmd: string, p: Record<string, unknown> = {}) =>
      (
        await f.db.query<{ v: any }>(
          "select public.attachment_retention_worker($1,$2::jsonb) v",
          [cmd, JSON.stringify({ school, ...p })],
        )
      ).rows[0].v;
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
    const meeting = (
      await learning(1, "meeting-save", {
        data: { title: "Fixture meeting", starts_at: new Date().toISOString() },
      })
    ).id;
    const material = (
      await learning(1, "material-save", {
        data: {
          title: "Old lesson",
          meeting_id: meeting,
          body: "Keep academic content",
          links: [],
          status: "published",
          publish_at: null,
        },
      })
    ).id;
    const task = (
      await learning(1, "assignment-save", {
        data: {
          title: "Old task",
          instructions: "Keep assignment",
          formats: ["file"],
          due_at: new Date(Date.now() + 86400000).toISOString(),
          accept_late: false,
          max_score: 100,
          status: "published",
          publish_at: null,
        },
      })
    ).id;
    async function asset(
      type: string,
      target: string,
      status = "ready",
      owner = f.actors[1].id,
    ) {
      const id = randomUUID();
      await f.db.query(
        "insert into learning_assets(id,school_id,teaching_class_id,owner_id,target_type,target_id,name,kind,mime,bytes,object_path,status,created_at,expires_at) values($1,$2,$3,$4,$5,$6,'fixture.pdf','document','application/pdf',123,$7,$8,clock_timestamp()-interval '3 years',clock_timestamp()-interval '3 years')",
        [
          id,
          school,
          f.course,
          owner,
          type,
          target,
          school + "/" + f.course + "/" + id,
          status,
        ],
      );
      return id;
    }
    const pending = await asset("submission", task, "pending", f.actors[2].id),
      mat = await asset("material", material),
      submission = await asset("submission", task, "ready", f.actors[2].id);
    const sub = randomUUID(),
      version = randomUUID();
    await f.db.query(
      "insert into learning_submissions(id,school_id,assignment_id,student_id) values($1,$2,$3,$4)",
      [sub, school, task, f.actors[2].id],
    );
    await f.db.query(
      "insert into learning_submission_versions(id,school_id,submission_id,version,body,asset_ids,is_late) values($1,$2,$3,1,'history',$4,false)",
      [version, school, sub, [submission]],
    );
    await f.db.query(
      "update learning_submissions set latest_version_id=$1,revision=1 where id=$2",
      [version, sub],
    );
    await f.db.query(
      "insert into learning_grades(version_id,school_id,score,graded_by) values($1,$2,80,$3)",
      [version, school, f.actors[1].id],
    );
    let settings = {
      revision: 0,
      enabled: false,
      pending_days: 1,
      material_days: 1,
      submission_days: 1,
      grace_days: 1,
      backup_required: true,
      confirmation: "AKTIFKAN RETENSI",
    };
    await t.test("default preview, strict admin access and RLS", async () => {
      assert.deepEqual(await learning(1, "asset-cleanup"), []);
      const s = await api(0, "state");
      assert.equal(s.policy.enabled, false);
      assert.equal(s.policy.backup_required, true);
      for (const actor of [1, 2, 3, 4])
        await assert.rejects(() => api(actor, "state"), /admin/);
      await assert.rejects(
        () =>
          f.as(2, async (tx) =>
            tx.exec("select * from private.attachment_queue"),
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          f.as(2, async (tx) =>
            tx.query(
              "select public.attachment_retention_worker($1,$2::jsonb)",
              ["schools", "{}"],
            ),
          ),
        /permission denied/,
      );
      await api(0, "settings", { data: settings });
    });
    await t.test(
      "active content excluded, expired pending queues safely with no default execution",
      async () => {
        const s = await api(0, "scan");
        assert.equal(s.summary.queued, 1);
        assert.equal(
          s.rows.find((r: any) => r.id === mat).eligible_category,
          null,
        );
        assert.deepEqual(await worker("claim"), {});
      },
    );
    await t.test(
      "hold prevents queue and explicit removal; cancel persists until deliberate requeue",
      async () => {
        await api(0, "hold", { target: pending, data: { hold: true } });
        assert.equal((await api(0, "scan")).summary.queued, 0);
        await assert.rejects(
          () =>
            f.db.query(
              "update learning_assets set status='removed' where id=$1",
              [pending],
            ),
          /dipertahankan/,
        );
        await api(0, "hold", { target: pending, data: { hold: false } });
        assert.equal((await api(0, "scan")).summary.queued, 0);
        await api(0, "requeue", { target: pending });
      },
    );
    await t.test(
      "enable requires confirmation, policy revision extends grace, pending needs no academic backup",
      async () => {
        await assert.rejects(
          () =>
            api(0, "settings", {
              data: {
                ...settings,
                revision: 1,
                enabled: true,
                confirmation: "",
              },
            }),
          /Konfirmasi/,
        );
        settings = { ...settings, revision: 1, enabled: true };
        await api(0, "settings", { data: settings });
        await worker("scan");
        assert.deepEqual(await worker("claim"), {});
        await f.db.query(
          "update private.attachment_queue set delete_after=clock_timestamp()-interval '1 day' where asset_id=$1",
          [pending],
        );
        const c = await worker("claim");
        assert.equal(c.id, pending);
        await assert.rejects(
          () => api(0, "hold", { target: pending, data: { hold: true } }),
          /dimulai/,
        );
        await worker("fail", { target: c.id, token: c.token });
        assert.equal((await api(0, "state")).summary.failed, 1);
        await api(0, "retry", { target: pending });
        const retry = await worker("claim");
        assert.equal(retry.id, pending);
        await assert.rejects(
          () => worker("ack", { target: c.id, token: c.token }),
          /Lease/,
        );
        await worker("ack", { target: retry.id, token: retry.token });
        assert.equal((await api(0, "state")).summary.deleted, 1);
      },
    );
    await t.test(
      "new reference during grace cancels an orphan candidate",
      async () => {
        const unused = await asset("submission", task, "ready", f.actors[2].id);
        await api(0, "scan");
        await f.db.query(
          "update private.attachment_queue set delete_after=clock_timestamp()-interval '1 day' where asset_id=$1",
          [unused],
        );
        await f.db.query(
          "insert into learning_submission_versions(id,school_id,submission_id,version,body,asset_ids,is_late) values($1,$2,$3,2,'new reference',$4,false)",
          [randomUUID(), school, sub, [unused]],
        );
        assert.deepEqual(await worker("claim"), {});
        assert.equal(
          (await api(0, "state")).rows.find((a: any) => a.id === unused).state,
          "cancelled",
        );
      },
    );
    const semester = (
      await f.db.query<{ id: string }>(
        "select s.id from semesters s join classrooms r on r.semester_id=s.id join teaching_classes c on c.classroom_id=r.id where c.id=$1",
        [f.course],
      )
    ).rows[0].id;
    await t.test(
      "archived semester and finalized grades determine academic eligibility",
      async () => {
        await f.db.exec(
          "alter table semesters disable trigger user;alter table learning_materials disable trigger user;alter table learning_assignments disable trigger user;",
        );
        await f.db.query(
          "update semesters set status='archived',starts_on=(clock_timestamp()-interval '4 years')::date,updated_at=clock_timestamp()-interval '3 years',ends_on=(clock_timestamp()-interval '2 years')::date where id=$1",
          [semester],
        );
        await f.db.query(
          "update learning_materials set updated_at=clock_timestamp()-interval '3 years' where id=$1",
          [material],
        );
        await f.db.query(
          "update learning_assignments set updated_at=clock_timestamp()-interval '3 years' where id=$1",
          [task],
        );
        await f.db.exec(
          "alter table semesters enable trigger user;alter table learning_materials enable trigger user;alter table learning_assignments enable trigger user;",
        );
        let s = await api(0, "scan");
        assert.equal(
          s.rows.find((r: any) => r.id === submission).eligible_category,
          null,
        );
        await f.db.query(
          "insert into private.course_grade_state(course_id,locked) values($1,true)",
          [f.course],
        );
        s = await api(0, "scan");
        assert.equal(
          s.rows.find((r: any) => r.id === submission).eligible_category,
          "submission",
        );
        assert.equal(s.summary.queued, 2);
        await f.db.query(
          "update private.attachment_queue set delete_after=clock_timestamp()-interval '1 day' where state='queued'",
        );
        assert.deepEqual(await worker("claim"), {});
      },
    );
    await t.test(
      "backup statement, in-flight freeze, immutable history and tombstones",
      async () => {
        for (const id of [mat, submission])
          await api(0, "backup", {
            target: id,
            data: {
              reference: "synthetic archive verified restore",
              confirmation: "BACKUP SUDAH DIVERIFIKASI",
            },
          });
        const first = await worker("claim");
        assert.ok([mat, submission].includes(first.id));
        await assert.rejects(
          () =>
            f.db.query("update semesters set status='active' where id=$1", [
              semester,
            ]),
          /penghapusan/,
        );
        await assert.rejects(
          () =>
            f.db.query(
              "update private.course_grade_state set locked=false where course_id=$1",
              [f.course],
            ),
          /penghapusan/,
        );
        await worker("ack", { target: first.id, token: first.token });
        const second = await worker("claim");
        await worker("ack", { target: second.id, token: second.token });
        await assert.rejects(
          () =>
            f.db.query(
              "insert into learning_submission_versions(id,school_id,submission_id,version,asset_ids,is_late) values($1,$2,$3,99,$4,false)",
              [randomUUID(), school, sub, [submission]],
            ),
          /Lampiran tidak tersedia/,
        );
        const detail = await learning(1, "submission-detail", { target: sub });
        assert.equal(detail.assets[0].retention_deleted_at !== null, true);
        const history = await learning(1, "history", {
          target: sub,
          data: { student_id: f.actors[2].id },
        });
        assert.ok(
          history.some((v: any) =>
            v.retention_deleted_asset_ids.includes(submission),
          ),
        );
        assert.equal(
          Number(
            (
              await f.db.query<{ score: number }>(
                "select score from learning_grades where version_id=$1",
                [version],
              )
            ).rows[0].score,
          ),
          80,
        );
        assert.equal(
          (
            await f.db.query<{ body: string }>(
              "select body from learning_submission_versions where id=$1",
              [version],
            )
          ).rows[0].body,
          "history",
        );
        await assert.rejects(
          () => learning(2, "asset-info", { target: submission }),
          /diakses/,
        );
      },
    );
  } finally {
    await f.db.close();
  }
});
