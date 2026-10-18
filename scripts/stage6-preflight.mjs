import { spawnSync } from "node:child_process";
const version = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
const fields = [
  "PGHOST",
  "PGDATABASE",
  "PGUSER",
  "LMS_BACKUP_DIR",
  "LMS_BACKUP_KEY_BASE64",
];
const available = Object.fromEntries(fields.map((k) => [k, !!process.env[k]]));
const storage = {
  source_url:
    process.env.SUPABASE_URL === "https://slppnagegknxsjhfqthm.supabase.co",
  server_credential: !!(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  ack:
    process.env.LMS_STORAGE_BACKUP_ACK === "authorized-private-storage-export",
};
console.log(
  JSON.stringify(
    {
      pg_dump_installed: version.status === 0,
      pg_dump_version: version.status === 0 ? version.stdout.trim() : null,
      database_environment_present: available,
      storage_environment_present: storage,
      note: "Only presence is reported. Configure secrets locally; do not paste them into chat or commit them.",
    },
    null,
    2,
  ),
);
