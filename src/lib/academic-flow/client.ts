import { postJson } from "@/lib/http/client";
export async function flowRequest<T = unknown>(
  action: string,
  body: Record<string, unknown>,
) {
  return (await postJson<{ result: T }>(`/api/alur-akademik/${action}`, body))
    .result;
}
export const policyLabels: Record<string, string> = {
  preserve: "Pertahankan nilai awal",
  highest: "Ambil nilai tertinggi",
  latest: "Gunakan hasil terbaru (dapat turun)",
  capped: "Naik maksimal batas; tidak menurunkan nilai awal",
};
export type Goal = {
  id: string;
  code: string;
  title: string;
  threshold: number;
  active: boolean;
  revision: number;
};
export type FlowRow = {
  id: string;
  full_name: string;
  assignment_average: number | null;
  quiz_average: number | null;
  weighted_final: number | null;
  goals: {
    goal_id: string;
    score: number | null;
    assessed: number;
    required: number;
    mastered: boolean | null;
    materials_completed: number;
  }[];
};
export type Followup = {
  id: string;
  student_id: string;
  full_name: string;
  kind: string;
  activity_kind: string;
  activity_id: string;
  plan: string;
  due_on: string;
  policy: string;
  cap: number;
  status: string;
  result_score: number | null;
  note: string;
  revision: number;
  baseline_changed: boolean;
};
export type FlowState = {
  can_unlock: boolean;
  context: {
    manager: boolean;
    reviewer: boolean;
    admin: boolean;
    writable: boolean;
  };
  locked: boolean;
  revision: number;
  goals: Goal[];
  links: { goal_id: string; kind: string; activity_id: string }[];
  activities: { id: string; title: string; kind: string }[];
  rows: FlowRow[];
  has_more: boolean;
  followups: Followup[];
  finalizations: { id: string; reason: string; created_at: string }[];
};
