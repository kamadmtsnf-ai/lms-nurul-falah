import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../scripts/testing/fixture";
test("132 synthetic participants: compact autosave, lost response retry, revision conflict, privacy and finalization", async () => {
  const f = await fixture(132);
  try {
    const q = await f.command(1, "save", {
      data: {
        title: "Reliability synthetic",
        instructions: "Synthetic",
        status: "published",
        opens_at: new Date(Date.now() - 60000).toISOString(),
        closes_at: new Date(Date.now() + 3600000).toISOString(),
        duration_minutes: 30,
        questions: Array.from({ length: 30 }, (_, i) => ({
          kind: "choice",
          prompt: "Question " + i + " " + ".".repeat(300),
          options: ["A", "B"],
          correct: 0,
          explanation: "Key",
          points: 1,
        })),
      },
    });
    let bytesFull = 0,
      bytesCompact = 0;
    const attempts = await Promise.all(
      Array.from({ length: 132 }, (_, i) =>
        f.command(i + 2, "start", { target: q.id }),
      ),
    );
    for (const count of [60, 100, 132]) {
      await Promise.all(
        attempts.slice(0, count).map(async (a, i) => {
          const packet = {
            target: a.id,
            revision: a.revision,
            request_id: randomUUID(),
            compact: true,
            answers: Array.from({ length: 6 }, (_, n) => ({
              position: n + 1,
              choice: 0,
            })),
          };
          const ack = await f.command(i + 2, "answers", packet);
          const retry = await f.command(i + 2, "answers", packet);
          assert.deepEqual(
            { ...retry, server_now: null },
            { ...ack, server_now: null },
          );
          assert.equal(ack.revision, a.revision + 1);
          assert.equal(ack.compact, true);
          assert.equal(ack.questions, undefined);
          assert.equal(ack.answers, undefined);
          assert.equal(ack.score, undefined);
          await assert.rejects(
            () =>
              f.command(i + 2, "answers", {
                ...packet,
                request_id: randomUUID(),
              }),
            /berubah/,
          );
          const full = await f.command(i + 2, "attempt", { target: a.id });
          assert.equal(full.answers.length, 6);
          assert.equal(full.questions[0].correct, undefined);
          bytesFull += Buffer.byteLength(JSON.stringify(full));
          bytesCompact += Buffer.byteLength(JSON.stringify(ack));
          a.revision = ack.revision;
        }),
      );
    }
    assert.ok(
      bytesCompact < bytesFull * 0.1,
      "compact response should be under 10% of full attempt",
    );
    console.info(
      JSON.stringify({
        scope: "synthetic_local_serialized_database_not_hosted_capacity",
        participants: 132,
        waves: [60, 100, 132],
        bytesFull,
        bytesCompact,
        reductionPercent: Number(
          (100 * (1 - bytesCompact / bytesFull)).toFixed(2),
        ),
      }),
    );
    await assert.rejects(
      () => f.command(3, "attempt", { target: attempts[0].id, compact: true }),
      /diakses/,
    );
    const done = await f.command(2, "finish", {
      target: attempts[0].id,
      revision: attempts[0].revision,
      compact: true,
    });
    assert.equal(done.status, "submitted");
    assert.equal(done.answers.length, 6);
    assert.equal(done.questions.length, 30);
    assert.equal(done.score, null);
    const retryDone = await f.command(2, "finish", {
      target: done.id,
      revision: done.revision,
    });
    assert.equal(retryDone.finished_at, done.finished_at);
    const locks = await f.db.query<{ definition: string }>(
      "select pg_get_functiondef('private.quiz_attempt(text,jsonb)'::regprocedure) as definition",
    );
    assert.match(locks.rows[0].definition, /for share of q/);
    assert.match(locks.rows[0].definition, /where id=v_target for update/);
  } finally {
    await f.db.close();
  }
});
