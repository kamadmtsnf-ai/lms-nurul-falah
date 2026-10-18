import { ApiRequestError, postJson } from "@/lib/http/client";
export type AnswerValue = number | string | number[];
export type Question = {
  kind:
    | "choice"
    | "boolean"
    | "complex"
    | "agree"
    | "matching"
    | "short"
    | "essay";
  prompt: string;
  options: string[];
  matches?: string[];
  key?: number[] | string[];
  answer_key?: number[] | string[];
  correct?: number;
  explanation?: string;
  points: number;
  position?: number;
};
export type Quiz = {
  id: string;
  title: string;
  instructions: string;
  status: "draft" | "published" | "archived";
  opens_at: string;
  closes_at: string;
  duration_minutes: number;
  grades_visible: boolean;
  explanations_visible: boolean;
  updated_at: string;
  max_attempts?: number;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  monitor_tabs?: boolean;
};
export type Attempt = {
  id: string;
  quiz_id: string;
  student_id: string;
  title: string;
  instructions: string;
  status: "working" | "submitted" | "expired";
  started_at: string;
  deadline: string;
  finished_at: string | null;
  server_now: string;
  revision: number;
  max_score: number;
  score: number | null;
  questions: Question[];
  answers: { position: number; choice: AnswerValue }[];
  can_answer: boolean;
  review_visible: boolean;
  attempt_no?: number;
  grading_pending?: boolean;
  monitor_tabs?: boolean;
  tab_events?: number;
  essay_marks?: {
    position: number;
    score: number;
    feedback: string;
    revision: number;
  }[];
};
export type QuizList = {
  quizzes: Quiz[];
  offset: number;
  has_more: boolean;
  context: {
    manager: boolean;
    reviewer: boolean;
    writable: boolean;
    student_writable: boolean;
  };
};
export type ReportRow = {
  id: string;
  full_name: string;
  present: number;
  attendance_recorded: number;
  overdue_missing: number;
  submissions: number;
  assignment_average: number | null;
  quiz_average: number | null;
  weighted_final?: number | null;
};
export type QuizResult = {
  quiz_id: string;
  title: string;
  student_name: string;
  student_id: string;
  attempt_id: string;
  status: string;
  started_at: string;
  deadline: string;
  finished_at: string | null;
  score: number | null;
  max_score: number;
  grades_visible: boolean;
  can_open: boolean;
};
export type Report = {
  offset: number;
  has_more: boolean;
  generated_at: string;
  course: { classroom: string; subject: string; teacher: string };
  rows: ReportRow[];
  quizzes: QuizResult[];
  activity: Record<string, number> | null;
};
export { ApiRequestError as QuizRequestError };
export async function quizRequest<T>(
  action: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const d = await postJson<{ result: T }>(
    `/api/kuis/${action}`,
    body,
    signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  );
  return d.result;
}

export type AttemptSync =
  | Attempt
  | (Pick<
      Attempt,
      "id" | "status" | "revision" | "server_now" | "deadline" | "can_answer"
    > & { compact: true });
