import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, school } from "../scripts/testing/fixture";
import {
  removeTeachingFile,
  type TeachingFile,
} from "../src/lib/learning/remove-file";
test("server deletion: checked RPC context, role, scope, archive, audit and retry after Storage failure", async () => {
  const { db, as, course, actors } = await fixture(2);
  let storageFails = false;
  const removed: string[] = [];
  const learning = (a: number, cmd: string, p: Record<string, unknown> = {}) =>
    as(
      a,
      async (tx) =>
        (
          await tx.query<{ v: any }>(
            "select public.learning_command($1,$2::jsonb) v",
            [cmd, JSON.stringify({ course, ...p })],
          )
        ).rows[0].v,
    );
  const remove = (a: number, id: string, c = course) =>
    removeTeachingFile(c, id, {
      context: async () =>
        (
          await as(
            a,
            async (tx) =>
              (
                await tx.query<{ v: any }>(
                  "select public.learning_command($1,$2::jsonb) v",
                  ["course", JSON.stringify({ course: c })],
                )
              ).rows[0].v,
          )
        ).context,
      find: async () =>
        (
          await db.query<TeachingFile>(
            "select * from learning_assets where id=$1 and teaching_class_id=$2",
            [id, c],
          )
        ).rows[0] ?? null,
      targetExists: async (file) =>
        (
          await db.query(
            "select id from " +
              (file.target_type === "material"
                ? "learning_materials"
                : "learning_assignments") +
              " where id=$1 and teaching_class_id=$2",
            [file.target_id, c],
          )
        ).rows.length > 0,
      auditRequest: async (file) => {
        await db.query(
          "insert into audit_logs(school_id,actor_id,action,entity,entity_id) values($1,$2,'learning.file-remove-request','learning_assets',$3)",
          [file.school_id, actors[a].id, id],
        );
      },
      markRemoved: async (file) => {
        await db.query(
          "update learning_assets set status='removed' where id=$1 and teaching_class_id=$2 and status=$3",
          [id, c, file.status],
        );
      },
      removeObject: async (path) => {
        if (storageFails) throw new Error("Storage unavailable");
        removed.push(path);
      },
    });
  try {
    const meeting = (
      await learning(1, "meeting-save", {
        data: { title: "Pertemuan", starts_at: new Date().toISOString() },
      })
    ).id;
    const material = (
      await learning(1, "material-save", {
        data: {
          title: "Materi",
          meeting_id: meeting,
          body: "Isi",
          links: [],
          status: "published",
          publish_at: null,
        },
      })
    ).id;
    const assignment = (
      await learning(1, "assignment-save", {
        data: {
          title: "Tugas",
          instructions: "Isi",
          formats: ["file"],
          due_at: new Date(Date.now() + 3600000).toISOString(),
          accept_late: false,
          max_score: 100,
          status: "published",
          publish_at: null,
        },
      })
    ).id;
    async function asset(type: string, target: string) {
      const id = randomUUID(),
        path = `${school}/${course}/${id}`;
      await db.query(
        "insert into learning_assets(id,school_id,teaching_class_id,owner_id,target_type,target_id,name,kind,mime,bytes,object_path,status) values($1,$2,$3,$4,$5,$6,'materi.pdf','document','application/pdf',100,$7,'ready')",
        [id, school, course, actors[1].id, type, target, path],
      );
      return { id, path };
    }
    const mat = await asset("material", material),
      task = await asset("assignment", assignment),
      submission = await asset("submission", assignment);
    await assert.rejects(() => remove(2, mat.id), /pengampu/);
    await assert.rejects(() => remove(1, mat.id, randomUUID()), /diakses/);
    await assert.rejects(() => remove(1, submission.id), /tidak ditemukan/);
    assert.equal(
      (await learning(2, "asset-info", { target: mat.id })).id,
      mat.id,
    );
    storageFails = true;
    await assert.rejects(() => remove(1, mat.id), /Storage unavailable/);
    await assert.rejects(
      () => learning(2, "asset-info", { target: mat.id }),
      /diakses/,
    );
    assert.equal(removed.length, 0);
    storageFails = false;
    await remove(1, mat.id);
    assert.deepEqual(removed, [mat.path]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from audit_logs where entity_id=$1 and action='learning.file-remove-request'",
          [mat.id],
        )
      ).rows[0].n,
      1,
    );
    await remove(0, task.id);
    assert.ok(removed.includes(task.path));
    const other = await asset("material", material);
    await db.query("update learning_assets set status='pending' where id=$1", [
      other.id,
    ]);
    await assert.rejects(() => remove(1, other.id), /Unggahan belum selesai/);
    await db.query("update learning_assets set status='ready' where id=$1", [
      other.id,
    ]);
    const sem = (
      await db.query<{ id: string }>(
        "select semester_id id from classrooms where id=(select classroom_id from teaching_classes where id=$1)",
        [course],
      )
    ).rows[0].id;
    await db.query("update semesters set status='archived' where id=$1", [sem]);
    await assert.rejects(() => remove(1, other.id), /semester aktif/);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from learning_assets where id=$1",
          [other.id],
        )
      ).rows[0].status,
      "ready",
    );
  } finally {
    await db.close();
  }
});
