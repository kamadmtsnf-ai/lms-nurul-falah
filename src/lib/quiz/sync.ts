import type { Attempt, AttemptSync, AnswerValue } from "./types";
export type Answer = { position: number; choice: AnswerValue };
export type AnswerBatch = {
  request_id: string;
  revision: number;
  answers: Answer[];
};
/** Keeps an uncertain request intact until the server acknowledges it. */
export class AnswerQueue {
  readonly pending = new Map<number, AnswerValue>();
  private packet: AnswerBatch | null = null;
  constructor(
    private readonly requestId: () => string = () => crypto.randomUUID(),
  ) {}
  change(position: number, choice: AnswerValue) {
    this.pending.set(position, choice);
  }
  get hasWork() {
    return this.packet !== null || this.pending.size > 0;
  }
  batch(revision: number): AnswerBatch | null {
    if (this.packet) return this.packet;
    if (!this.pending.size) return null;
    this.packet = {
      request_id: this.requestId(),
      revision,
      answers: [...this.pending].map(([position, choice]) => ({
        position,
        choice,
      })),
    };
    this.pending.clear();
    return this.packet;
  }
  acknowledge(terminal = false) {
    this.packet = null;
    if (terminal) this.pending.clear();
  }
}
export function mayApplyPoll(
  capturedRevision: number,
  currentRevision: number,
  localWork: boolean,
) {
  return capturedRevision === currentRevision && !localWork;
}
export function savedAnswers(
  a: Pick<Attempt, "answers">,
): Record<number, AnswerValue> {
  return Object.fromEntries(a.answers.map((x) => [x.position, x.choice]));
}

/** Compact acknowledgements contain no question text, keys or other students' data. */
export function mergeAttemptSync(
  current: Attempt,
  response: AttemptSync,
  acknowledged: Answer[] = [],
): Attempt {
  if (response.id !== current.id)
    throw new Error("Respons percobaan tidak sesuai.");
  if (!("compact" in response)) return response;
  if (response.status !== "working")
    throw new Error("Respons akhir kuis tidak lengkap.");
  const answers = new Map(current.answers.map((a) => [a.position, a.choice]));
  for (const a of acknowledged) answers.set(a.position, a.choice);
  return {
    ...current,
    ...response,
    answers: [...answers].map(([position, choice]) => ({ position, choice })),
  };
}
export function syncDelay(
  kind: "save" | "poll",
  random: () => number = Math.random,
) {
  return kind === "save" ? 3500 + random() * 2000 : 45000 + random() * 15000;
}
