// Synthetic native PostgreSQL drill; never accepts a remote destination.
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
if (
  process.env.PGHOST !== "127.0.0.1" ||
  process.env.LMS_NATIVE_DRILL_ACK !== "disposable-local-postgres" ||
  process.env.PGSERVICE ||
  process.env.PGHOSTADDR
)
  throw new Error("Drill membutuhkan PostgreSQL lokal disposable.");
const root = await mkdtemp(path.join(tmpdir(), "lms-native-drill-"));
const env = {
  ...process.env,
  PGDATABASE: "lms_restore_source",
  LMS_BACKUP_DIR: root,
  LMS_BACKUP_KEY_BASE64: randomBytes(32).toString("base64"),
};
function run(bin, args, config = env, input) {
  const r = spawnSync(bin, args, { env: config, input, encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(
      "Drill gagal pada " + bin + "; detail koneksi tidak dicetak.",
    );
  return r.stdout.trim();
}
try {
  run(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", "postgres"],
    env,
    "create role lms_drill_reader; create database lms_restore_source; create database lms_restore_target;",
  );
  run(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1"],
    env,
    `create schema private;create table public.students(id int primary key,name text);insert into public.students values(1,'Synthetic student');create table private.answers(student int references public.students(id),answer text);insert into private.answers values(1,'Synthetic answer');alter table private.answers enable row level security;grant usage on schema public to lms_drill_reader;grant select on public.students to lms_drill_reader;revoke all on private.answers from public;`,
  );
  run(process.execPath, ["scripts/backup-db.mjs"]);
  const manifest = path.join(
    root,
    (await readdir(root)).find((f) => f.endsWith(".json")),
  );
  run(process.execPath, ["scripts/restore-db-test.mjs", manifest], {
    ...env,
    PGDATABASE: "lms_restore_target",
    LMS_RESTORE_ACK: "isolated-test-database",
  });
  const result = run(
    "psql",
    ["-X", "-At", "-v", "ON_ERROR_STOP=1"],
    { ...env, PGDATABASE: "lms_restore_target" },
    `select exists(select 1 from pg_constraint where conrelid='private.answers'::regclass and contype='f') and (select count(*) from public.students)=1 and (select answer from private.answers)='Synthetic answer' and (select relrowsecurity from pg_class where oid='private.answers'::regclass) and has_table_privilege('lms_drill_reader','public.students','select') and not has_table_privilege('lms_drill_reader','private.answers','select');`,
  );
  if (result !== "t")
    throw new Error("Data, relasi, RLS, atau ACL hasil pemulihan tidak cocok.");
  console.log(
    JSON.stringify({
      native_dump_restore: "passed",
      synthetic_only: true,
      data_rls_acl: "passed",
      production_restore: "not_run",
      encrypted_manifest: !!JSON.parse(await readFile(manifest, "utf8")).sha256,
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
