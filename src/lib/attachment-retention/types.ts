export type RetentionPolicy = {
  enabled: boolean;
  pending_days: number;
  material_days: number;
  submission_days: number;
  grace_days: number;
  backup_required: boolean;
  revision: number;
};
export type RetentionAsset = {
  id: string;
  name: string;
  bytes: number;
  target_type: string;
  status: string;
  retention_hold: boolean;
  retention_deleted_at: string | null;
  eligible_category: string | null;
  category: string | null;
  state: "queued" | "cancelled" | "processing" | "failed" | "deleted" | null;
  queued_at: string | null;
  delete_after: string | null;
  backup_reference: string;
  backup_verified_at: string | null;
  attempts: number | null;
  error_code: string | null;
};
export type RetentionState = {
  policy: RetentionPolicy;
  rows: RetentionAsset[];
  offset: number;
  has_more: boolean;
  summary: {
    queued: number;
    processing: number;
    failed: number;
    deleted: number;
    estimated_queued_bytes: number;
  };
  scheduler_configured: boolean;
};
