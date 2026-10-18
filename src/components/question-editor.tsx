"use client";
import type { Question } from "@/lib/quiz/types";
import { fieldClass } from "./learning-shared";
export const kindLabels: Record<Question["kind"], string> = {
  choice: "Pilihan ganda",
  complex: "Pilihan ganda kompleks",
  boolean: "Benar / salah",
  agree: "Setuju / tidak setuju",
  matching: "Menjodohkan",
  short: "Isian singkat",
  essay: "Esai",
};
export const blankQuestion = (): Question => ({
  kind: "choice",
  prompt: "",
  options: ["", ""],
  correct: 0,
  points: 1,
  explanation: "",
});
export function QuestionEditor({
  q,
  index,
  onChange,
}: {
  q: Question;
  index: number;
  onChange: (q: Question) => void;
}) {
  const change = (p: Partial<Question>) => onChange({ ...q, ...p });
  const optionKind = [
    "choice",
    "complex",
    "boolean",
    "agree",
    "matching",
  ].includes(q.kind);
  return (
    <div className="space-y-4">
      <label className="block text-sm">
        Jenis soal
        <select
          value={q.kind}
          className={fieldClass}
          onChange={(e) => {
            const kind = e.target.value as Question["kind"];
            change({
              kind,
              options:
                kind === "boolean"
                  ? ["Benar", "Salah"]
                  : kind === "agree"
                    ? ["Setuju", "Tidak Setuju"]
                    : ["short", "essay"].includes(kind)
                      ? []
                      : ["", ""],
              correct: 0,
              key:
                kind === "complex"
                  ? [0]
                  : kind === "matching"
                    ? [0, 1]
                    : kind === "short"
                      ? [""]
                      : undefined,
              matches: kind === "matching" ? ["", ""] : undefined,
            });
          }}
        >
          {Object.entries(kindLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Pertanyaan
        <textarea
          required
          maxLength={4000}
          className={fieldClass}
          value={q.prompt}
          onChange={(e) => change({ prompt: e.target.value })}
        />
      </label>
      {optionKind && (
        <div className="space-y-3">
          {q.options.map((o, n) => (
            <div key={n} className="flex flex-wrap items-center gap-2">
              {q.kind !== "matching" && (
                <input
                  aria-label={`Kunci soal ${index + 1} opsi ${n + 1}`}
                  type={q.kind === "complex" ? "checkbox" : "radio"}
                  name={`correct-${index}`}
                  checked={
                    q.kind === "complex"
                      ? ((q.key as number[] | undefined)?.includes(n) ?? false)
                      : q.correct === n
                  }
                  onChange={() =>
                    change(
                      q.kind === "complex"
                        ? {
                            key: ((q.key ?? []) as number[]).includes(n)
                              ? (q.key as number[]).filter((x) => x !== n)
                              : [...((q.key as number[]) ?? []), n],
                          }
                        : { correct: n },
                    )
                  }
                />
              )}
              <label className="min-w-40 flex-1 text-sm">
                {q.kind === "matching"
                  ? `Pernyataan ${n + 1}`
                  : `Opsi ${n + 1}`}
                <input
                  required
                  readOnly={["boolean", "agree"].includes(q.kind)}
                  maxLength={1000}
                  className={fieldClass}
                  value={o}
                  onChange={(e) =>
                    change({
                      options: q.options.map((x, k) =>
                        k === n ? e.target.value : x,
                      ),
                    })
                  }
                />
              </label>
              {q.kind === "matching" && (
                <>
                  <label className="flex-1 text-sm">
                    Pilihan kanan {n + 1}
                    <input
                      required
                      className={fieldClass}
                      maxLength={1000}
                      value={q.matches?.[n] ?? ""}
                      onChange={(e) =>
                        change({
                          matches: (q.matches ?? []).map((x, k) =>
                            k === n ? e.target.value : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Pasangan pernyataan {n + 1}
                    <select
                      className={fieldClass}
                      value={q.key?.[n] ?? n}
                      onChange={(e) =>
                        change({
                          key: (q.key as number[]).map((x, k) =>
                            k === n ? Number(e.target.value) : x,
                          ),
                        })
                      }
                    >
                      {q.options.map((_, k) => (
                        <option key={k} value={k}>
                          Pilihan kanan {k + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          ))}
          {["choice", "complex", "matching"].includes(q.kind) && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={q.options.length >= 10}
                className="text-sm text-emerald-800 underline"
                onClick={() =>
                  change({
                    options: [...q.options, ""],
                    ...(q.kind === "matching"
                      ? {
                          matches: [...(q.matches ?? []), ""],
                          key: [...(q.key as number[]), q.options.length],
                        }
                      : {}),
                  })
                }
              >
                Tambah opsi
              </button>
              <button
                type="button"
                disabled={q.options.length <= 2}
                className="text-sm text-emerald-800 underline"
                onClick={() => {
                  const n = q.options.length - 1;
                  change({
                    options: q.options.slice(0, n),
                    correct: Math.min(q.correct ?? 0, n - 1),
                    ...(q.kind === "matching"
                      ? {
                          matches: q.matches?.slice(0, n),
                          key: Array.from({ length: n }, (_, i) => i),
                        }
                      : q.kind === "complex"
                        ? { key: (q.key as number[]).filter((x) => x < n) }
                        : {}),
                  });
                }}
              >
                Hapus opsi terakhir
              </button>
            </div>
          )}
        </div>
      )}
      {q.kind === "short" && (
        <label className="block text-sm">
          Jawaban yang diterima (satu per baris; huruf besar/kecil dan spasi
          tepi diabaikan)
          <textarea
            required
            className={fieldClass}
            value={((q.key as string[]) ?? []).join("\n")}
            onChange={(e) => change({ key: e.target.value.split("\n") })}
          />
        </label>
      )}
      {q.kind === "essay" && (
        <p className="text-sm text-stone-600">
          Esai dinilai guru. Nilai total menunggu seluruh esai dikoreksi.
        </p>
      )}
      <label className="block text-sm">
        Poin
        <input
          required
          type="number"
          min={0.01}
          max={100}
          step={0.01}
          className={fieldClass}
          value={q.points}
          onChange={(e) => change({ points: Number(e.target.value) })}
        />
      </label>
      <label className="block text-sm">
        Pembahasan
        <textarea
          maxLength={4000}
          className={fieldClass}
          value={q.explanation ?? ""}
          onChange={(e) => change({ explanation: e.target.value })}
        />
      </label>
    </div>
  );
}
