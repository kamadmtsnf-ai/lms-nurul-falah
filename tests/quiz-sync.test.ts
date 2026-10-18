import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerQueue, mayApplyPoll, savedAnswers } from "../src/lib/quiz/sync";
test("respons hilang: kirim ulang ID, revisi dan isi sama sebelum perubahan berikutnya", () => {
  let id = 0;
  const q = new AnswerQueue(() => String(++id));
  q.change(1, 0);
  const first = q.batch(0)!;
  q.change(1, 1);
  assert.deepEqual(q.batch(0), first);
  assert.deepEqual(q.batch(1), first);
  q.acknowledge();
  assert.equal(q.hasWork, true);
  const next = q.batch(1)!;
  assert.equal(next.revision, 1);
  assert.notEqual(next.request_id, first.request_id);
  assert.deepEqual(next.answers, [{ position: 1, choice: 1 }]);
  q.acknowledge();
  assert.equal(q.hasWork, false);
});
test("offline: banyak perubahan digabung tanpa mengubah paket yang sedang diulang", () => {
  const q = new AnswerQueue();
  q.change(1, 0);
  q.change(1, 1);
  q.change(2, 0);
  const sent = q.batch(0)!;
  assert.equal(sent.answers.length, 2);
  q.change(3, 1);
  assert.deepEqual(q.batch(0), sent);
  q.acknowledge();
  assert.deepEqual(q.batch(1)!.answers, [{ position: 3, choice: 1 }]);
});
test("poll terlambat tidak menimpa autosave berjalan atau menimbulkan konflik semu", () => {
  assert.equal(mayApplyPoll(0, 0, true), false);
  assert.equal(mayApplyPoll(0, 1, false), false);
  assert.equal(mayApplyPoll(1, 1, false), true);
});
test("deadline/finalisasi membuang antrean terlambat dan menampilkan jawaban yang dinilai server", () => {
  const q = new AnswerQueue();
  q.change(1, 1);
  q.batch(0);
  q.change(2, 1);
  q.acknowledge(true);
  assert.equal(q.hasWork, false);
  assert.deepEqual(savedAnswers({ answers: [{ position: 1, choice: 0 }] }), {
    1: 0,
  });
});

import { mergeAttemptSync, syncDelay } from "../src/lib/quiz/sync";
import type { Attempt, AttemptSync } from "../src/lib/quiz/types";
test("compact acknowledgement preserves static questions and acknowledged answers without overwriting later queued edits", () => {
  const current = {
    id: "one",
    status: "working",
    revision: 0,
    questions: [{ prompt: "Static" }],
    answers: [{ position: 2, choice: "essay" }],
  } as Attempt;
  const response = {
    id: "one",
    status: "working",
    revision: 1,
    server_now: "now",
    deadline: "later",
    can_answer: true,
    compact: true,
  } as AttemptSync;
  const merged = mergeAttemptSync(current, response, [
    { position: 1, choice: [1, 2] },
  ]);
  assert.equal(merged.questions, current.questions);
  assert.equal(merged.revision, 1);
  assert.deepEqual(merged.answers, [
    { position: 2, choice: "essay" },
    { position: 1, choice: [1, 2] },
  ]);
  assert.equal(current.revision, 0);
  assert.throws(
    () => mergeAttemptSync(current, { ...response, id: "other" }),
    /sesuai/,
  );
  assert.throws(
    () =>
      mergeAttemptSync(current, {
        ...response,
        status: "expired",
      } as AttemptSync),
    /lengkap/,
  );
  const terminal = { ...current, status: "expired", answers: [] } as Attempt;
  assert.equal(mergeAttemptSync(current, terminal), terminal);
});
test("save and idle polling schedules spread requests without postponing answers indefinitely", () => {
  assert.equal(
    syncDelay("save", () => 0),
    3500,
  );
  assert.equal(
    syncDelay("save", () => 1),
    5500,
  );
  assert.equal(
    syncDelay("poll", () => 0),
    45000,
  );
  assert.equal(
    syncDelay("poll", () => 1),
    60000,
  );
});
