"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { panelClass, fieldClass, Notice } from "./learning-shared";
import {
  quizRequest,
  QuizRequestError,
  type Attempt,
  type AnswerValue,
} from "@/lib/quiz/types";
import { AnswerQueue, mayApplyPoll, savedAnswers } from "@/lib/quiz/sync";
export function QuizAttempt({
  initial,
  course,
}: {
  initial: Attempt;
  course: string;
}) {
  const [attempt, setAttempt] = useState(initial),
    [answers, setAnswers] = useState<Record<number, AnswerValue>>(() =>
      savedAnswers(initial),
    ),
    [notice, setNotice] = useState(""),
    [sync, setSync] = useState(
      initial.status === "expired"
        ? "Waktu habis. Hanya jawaban yang diterima server yang dinilai."
        : initial.status === "submitted"
          ? "Kuis sudah selesai."
          : "Semua jawaban tersimpan.",
    ),
    [busy, setBusy] = useState(false),
    [remaining, setRemaining] = useState(() =>
      Math.max(
        0,
        Math.ceil(
          (Date.parse(initial.deadline) - Date.parse(initial.server_now)) /
            1000,
        ),
      ),
    ),
    [conflict, setConflict] = useState(false);
  const current = useRef(initial),
    queue = useRef(new AnswerQueue()),
    saving = useRef(false),
    locked = useRef(false),
    blocked = useRef(false),
    retryAt = useRef(0),
    failures = useRef(0),
    nextPoll = useRef(Date.now() + 20000),
    originTime = useRef({
      server: Date.parse(initial.server_now),
      local: performance.now(),
    }),
    mounted = useRef(true);
  function accept(a: Attempt) {
    current.current = a;
    originTime.current = {
      server: Date.parse(a.server_now),
      local: performance.now(),
    };
    if (mounted.current) setAttempt(a);
    if (a.status !== "working") {
      queue.current.acknowledge(true);
      if (mounted.current) setAnswers(savedAnswers(a));
      if (mounted.current)
        setSync(
          a.status === "expired"
            ? "Waktu habis. Hanya jawaban yang telah diterima server yang dinilai."
            : "Kuis sudah selesai.",
        );
    }
  }
  async function flush() {
    if (
      saving.current ||
      blocked.current ||
      !current.current.can_answer ||
      current.current.status !== "working"
    )
      return false;
    const packet = queue.current.batch(current.current.revision);
    if (!packet) return true;
    saving.current = true;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const a = await quizRequest<Attempt>(
        "answers",
        { course, target: current.current.id, ...packet },
        controller.signal,
      );
      accept(a);
      queue.current.acknowledge(a.status !== "working");
      failures.current = 0;
      retryAt.current = 0;
      if (mounted.current && a.status === "working")
        setSync(
          queue.current.pending.size
            ? "Ada jawaban menunggu disimpan."
            : "Semua jawaban tersimpan.",
        );
      return true;
    } catch (e) {
      if (
        e instanceof QuizRequestError &&
        [400, 401, 403, 409].includes(e.status)
      ) {
        blocked.current = true;
        if (mounted.current) {
          setConflict(true);
          setNotice(e.message);
          setSync(
            "Penyimpanan dihentikan. Periksa akun atau muat ulang jawaban server.",
          );
        }
      } else {
        failures.current++;
        retryAt.current =
          Date.now() +
          Math.min(20000, 1500 * 2 ** Math.min(failures.current, 4)) +
          Math.random() * 1500;
        if (mounted.current)
          setSync("Belum tersimpan. Memeriksa koneksi dan mencoba kembali…");
      }
      return false;
    } finally {
      clearTimeout(timeout);
      saving.current = false;
    }
  }
  async function finish(expired = false) {
    if (!current.current.can_answer) return;
    if (saving.current) {
      setNotice("Tunggu penyimpanan jawaban selesai, lalu coba kembali.");
      return;
    }
    if (locked.current || blocked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (!expired) {
        for (let n = 0; n < 3 && queue.current.hasWork; n++)
          if (!(await flush())) return;
        if (queue.current.hasWork) {
          setNotice("Tunggu seluruh jawaban tersimpan.");
          return;
        }
      }
      const a = await quizRequest<Attempt>("finish", {
        course,
        target: current.current.id,
        revision: current.current.revision,
      });
      accept(a);
      if (a.status === "working")
        setNotice("Percobaan belum selesai. Coba kembali.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Belum dapat menyelesaikan kuis.",
      );
      retryAt.current = Date.now() + 10000;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const timer = setInterval(
      () => {
        if (disposed) return;
        const a = current.current;
        const left = Math.max(
          0,
          Math.ceil(
            (Date.parse(a.deadline) -
              originTime.current.server -
              (performance.now() - originTime.current.local)) /
              1000,
          ),
        );
        setRemaining(left);
        if (
          a.status !== "working" ||
          !a.can_answer ||
          blocked.current ||
          locked.current
        )
          return;
        if (left === 0) {
          if (Date.now() >= retryAt.current) void finish(true);
          return;
        }
        if (
          !saving.current &&
          Date.now() >= retryAt.current &&
          queue.current.hasWork
        )
          void flush();
        else if (
          !saving.current &&
          !queue.current.hasWork &&
          Date.now() >= nextPoll.current
        ) {
          nextPoll.current = Date.now() + 20000;
          const polledRevision = a.revision;
          void quizRequest<Attempt>("attempt", { course, target: a.id })
            .then((remote) => {
              if (
                disposed ||
                !mayApplyPoll(
                  polledRevision,
                  current.current.revision,
                  queue.current.hasWork || saving.current || locked.current,
                )
              )
                return;
              if (remote.status !== "working") accept(remote);
              else if (remote.revision !== current.current.revision) {
                blocked.current = true;
                setConflict(true);
                setNotice(
                  "Jawaban berubah di perangkat lain. Muat ulang sebelum melanjutkan.",
                );
              } else
                originTime.current = {
                  server: Date.parse(remote.server_now),
                  local: performance.now(),
                };
            })
            .catch(() => {});
        }
      },
      4000 + Math.random() * 1500,
    );
    const leaving = (e: BeforeUnloadEvent) => {
      if (queue.current.hasWork) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      disposed = true;
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("beforeunload", leaving);
    };
    // Refs keep the worker stable while individual answers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);
  useEffect(() => {
    if (
      !initial.monitor_tabs ||
      !initial.can_answer ||
      initial.status !== "working"
    )
      return;
    let last = 0;
    const record = () => {
      if (Date.now() - last < 2000 || current.current.status !== "working")
        return;
      last = Date.now();
      void quizRequest("tab-event", {
        course,
        target: initial.id,
        data: {
          event_id: crypto.randomUUID(),
          kind: document.hidden ? "hidden" : "visible",
        },
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [
    course,
    initial.id,
    initial.monitor_tabs,
    initial.can_answer,
    initial.status,
  ]);
  const done = attempt.status !== "working";
  return (
    <div className="space-y-5">
      <header className="workspace-hero sticky top-0 z-10 rounded-2xl p-5 text-white shadow">
        <p className="text-xs uppercase tracking-wider">
          LMS Nurul Falah · Percobaan {attempt.attempt_no ?? 1}
        </p>
        <h1
          title={attempt.title}
          className="mt-2 line-clamp-2 text-2xl font-semibold"
        >
          {attempt.title}
        </h1>
        <p role="timer" className="quiz-timer mt-3 font-semibold">
          {done
            ? "Kuis selesai"
            : !attempt.can_answer
              ? "Percobaan baca-saja"
              : `Sisa waktu: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
        </p>
        <p role="status" className="mt-2 text-sm text-emerald-100">
          {sync}
        </p>
        {attempt.monitor_tabs && (
          <p className="mt-2 text-xs">
            Perpindahan tab dicatat sebagai informasi pendamping, bukan bukti
            otomatis kecurangan.
          </p>
        )}
      </header>
      <Notice message={notice} error />
      {conflict && (
        <Button
          variant="outline"
          onClick={() => {
            if (
              window.confirm(
                "Muat ulang akan mengganti jawaban pada halaman ini dengan yang tersimpan di server. Lanjutkan?",
              )
            )
              window.location.reload();
          }}
        >
          Muat ulang jawaban server
        </Button>
      )}
      <p className="whitespace-pre-wrap text-sm text-stone-600">
        {attempt.instructions}
      </p>
      {done &&
        attempt.tab_events !== null &&
        attempt.tab_events !== undefined && (
          <p className="text-sm">
            Catatan tab tersembunyi: {attempt.tab_events}
          </p>
        )}
      {done && (
        <section className={panelClass}>
          <h2 className="text-lg font-semibold">Hasil kuis</h2>
          <p className="mt-2">
            {attempt.grading_pending
              ? "Menunggu koreksi esai oleh guru."
              : attempt.score === null
                ? "Nilai belum dibuka oleh guru."
                : `Skor ${attempt.score} / ${attempt.max_score} · Nilai ${((attempt.score / attempt.max_score) * 100).toFixed(2)}`}
          </p>
          {!attempt.review_visible && (
            <p className="mt-2 text-sm text-stone-500">
              Pembahasan tersedia setelah waktu tutup dan guru membuka akses.
            </p>
          )}
        </section>
      )}
      {attempt.questions.map((q, i) => (
        <fieldset
          key={i}
          disabled={done || busy || conflict || !attempt.can_answer}
          className={panelClass}
        >
          <legend className="px-2 font-semibold">
            Soal {i + 1} · {q.points} poin
          </legend>
          <p className="mb-5 whitespace-pre-wrap text-sm leading-7">
            {q.prompt}
          </p>
          <AnswerInput
            question={q}
            value={answers[i + 1]}
            index={i}
            onChange={(v) => {
              queue.current.change(i + 1, v);
              setAnswers((a) => ({ ...a, [i + 1]: v }));
              setSync("Ada jawaban menunggu disimpan.");
            }}
          />
          {done && attempt.review_visible && (
            <div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm">
              <p className="font-semibold">
                {q.kind === "essay"
                  ? "Dikoreksi guru"
                  : `Kunci: ${q.kind === "short" ? ((q.answer_key as string[]) ?? q.key ?? []).join(" / ") : q.kind === "complex" ? ((q.answer_key as number[]) ?? q.key ?? []).map((n) => q.options[Number(n)]).join(", ") : q.kind === "matching" ? ((q.answer_key as number[]) ?? q.key ?? []).map((n, k) => `${q.options[k]} → ${q.matches?.[Number(n)]}`).join("; ") : q.options[q.correct ?? -1]}`}
              </p>
              <p className="mt-2 whitespace-pre-wrap">
                {q.explanation || "Tidak ada pembahasan tambahan."}
              </p>
            </div>
          )}
        </fieldset>
      ))}
      {done &&
        !attempt.can_answer &&
        attempt.tab_events !== null &&
        attempt.tab_events !== undefined && (
          <EssayGrader attempt={attempt} course={course} onSaved={accept} />
        )}{" "}
      {done &&
        attempt.essay_marks?.map((m) => (
          <p className="rounded-xl bg-stone-50 p-4 text-sm" key={m.position}>
            Esai {m.position}: {m.score} poin · {m.feedback}
          </p>
        ))}
      {!done && attempt.can_answer && (
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy || conflict} onClick={() => void flush()}>
            Simpan sekarang
          </Button>
          <Button
            disabled={busy || conflict}
            variant="outline"
            onClick={() => {
              if (
                window.confirm(
                  "Selesaikan kuis? Jawaban tidak dapat diubah setelah selesai.",
                )
              )
                void finish();
            }}
          >
            Selesaikan kuis
          </Button>
        </div>
      )}
      <p className="text-xs text-stone-500">
        Biarkan halaman tetap terbuka saat koneksi terputus. Jawaban yang belum
        sampai ke server sebelum batas waktu tidak dinilai. Membuka kuis di
        beberapa perangkat dapat menyebabkan konflik.
      </p>
      <Link
        href={`/pembelajaran/${course}`}
        onClick={(e) => {
          if (
            queue.current.hasWork &&
            !window.confirm(
              "Ada jawaban yang belum tersimpan. Tetap tinggalkan kuis?",
            )
          )
            e.preventDefault();
        }}
        className="inline-block text-sm text-emerald-800 underline"
      >
        Kembali ke pembelajaran
      </Link>
    </div>
  );
}

function AnswerInput({
  question: q,
  value,
  index,
  onChange,
}: {
  question: import("@/lib/quiz/types").Question;
  value: AnswerValue | undefined;
  index: number;
  onChange: (v: AnswerValue) => void;
}) {
  if (q.kind === "short" || q.kind === "essay")
    return (
      <label className="block text-sm">
        Jawaban Anda
        <textarea
          className={fieldClass}
          rows={q.kind === "essay" ? 6 : 2}
          maxLength={q.kind === "essay" ? 10000 : 1000}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  if (q.kind === "matching")
    return (
      <div className="space-y-3">
        {q.options.map((o, i) => (
          <label key={i} className="block text-sm">
            {o}
            <select
              className={fieldClass}
              value={Array.isArray(value) ? value[i] : -1}
              onChange={(e) => {
                const next = Array.isArray(value)
                  ? [...value]
                  : q.options.map(() => -1);
                next[i] = Number(e.target.value);
                onChange(next);
              }}
            >
              <option value={-1}>Pilih pasangan</option>
              {q.matches?.map((m, n) => (
                <option key={n} value={n}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  return (
    <div className="space-y-3">
      {q.options.map((option, n) => (
        <label
          key={n}
          className="answer-option flex items-start gap-3 rounded-xl border border-stone-200 p-4 text-sm"
        >
          <input
            type={q.kind === "complex" ? "checkbox" : "radio"}
            name={`answer-${index}`}
            checked={
              q.kind === "complex"
                ? Array.isArray(value) && value.includes(n)
                : value === n
            }
            onChange={() =>
              onChange(
                q.kind === "complex"
                  ? Array.isArray(value) && value.includes(n)
                    ? value.filter((x) => x !== n)
                    : [...(Array.isArray(value) ? value : []), n]
                  : n,
              )
            }
          />
          <span className="whitespace-pre-wrap">{option}</span>
        </label>
      ))}
    </div>
  );
}

function EssayGrader({
  attempt,
  course,
  onSaved,
}: {
  attempt: Attempt;
  course: string;
  onSaved: (a: Attempt) => void;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className={panelClass}>
      <h2 className="text-lg font-semibold">Koreksi esai</h2>
      <Notice message={message} error />
      {attempt.questions.map(
        (q, i) =>
          q.kind === "essay" && (
            <form
              key={i}
              className="mt-4 space-y-3 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                void quizRequest<Attempt>("essay-grade", {
                  course,
                  target: attempt.id,
                  data: {
                    position: i + 1,
                    score: Number(f.get("score")),
                    feedback: String(f.get("feedback")),
                    expected_revision:
                      attempt.essay_marks?.find((m) => m.position === i + 1)
                        ?.revision ?? 0,
                    reason: String(f.get("reason")),
                  },
                })
                  .then((a) => {
                    onSaved(a);
                    setMessage("Nilai esai disimpan.");
                  })
                  .catch((e) => setMessage(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <p>
                Soal {i + 1} · {q.prompt}
              </p>
              <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-4">
                {String(
                  attempt.answers.find((a) => a.position === i + 1)?.choice ??
                    "Belum dijawab",
                )}
              </p>
              <label className="block text-sm">
                Skor (maksimum {q.points})
                <input
                  required
                  name="score"
                  type="number"
                  min={0}
                  max={q.points}
                  step={0.01}
                  className={fieldClass}
                  defaultValue={
                    attempt.essay_marks?.find((m) => m.position === i + 1)
                      ?.score
                  }
                />
              </label>
              <label className="block text-sm">
                Umpan balik
                <textarea
                  name="feedback"
                  className={fieldClass}
                  maxLength={4000}
                  defaultValue={
                    attempt.essay_marks?.find((m) => m.position === i + 1)
                      ?.feedback
                  }
                />
              </label>
              <label className="block text-sm">
                Alasan perubahan (wajib untuk admin)
                <input name="reason" maxLength={1000} className={fieldClass} />
              </label>
              <Button disabled={busy} type="submit">
                Simpan koreksi soal {i + 1}
              </Button>
            </form>
          ),
      )}
    </section>
  );
}
