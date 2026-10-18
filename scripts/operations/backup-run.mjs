// Reads secrets only from the runner environment; emits no credentials or object paths.
import { digest } from "../testing/backup-crypto.mjs";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const required = [
  "PGHOST",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "LMS_BACKUP_KEY_BASE64",
  "SUPABASE_SECRET_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "LMS_BACKUP_BUCKET",
  "LMS_BACKUP_ENDPOINT",
];
if (
  required.some((k) => !process.env[k]) ||
  process.env.LMS_BACKUP_DESTINATION_ACK !== "private-bucket-verified"
)
  throw new Error(
    "BLOCKED: lengkapi secrets backup dan verifikasi bucket privat; lihat docs/26-Operasional-Produksi.md.",
  );
const endpoint = new URL(process.env.LMS_BACKUP_ENDPOINT);
if (
  endpoint.protocol !== "https:" ||
  endpoint.username ||
  endpoint.password ||
  endpoint.pathname !== "/" ||
  endpoint.search ||
  endpoint.hash
)
  throw new Error("Endpoint backup harus origin HTTPS tanpa kredensial.");
if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(process.env.LMS_BACKUP_BUCKET))
  throw new Error("Nama bucket tidak valid.");
const root = await mkdtemp(path.join(tmpdir(), "lms-scheduled-backup-"));
const env = {
  ...process.env,
  PGPORT: process.env.PGPORT || "5432",
  PGSSLMODE: "verify-full",
  PGSSLROOTCERT: process.env.PGSSLROOTCERT || "system",
  SUPABASE_URL: "https://slppnagegknxsjhfqthm.supabase.co",
  LMS_BACKUP_DIR: root,
  LMS_STORAGE_BACKUP_ACK: "authorized-private-storage-export",
  AWS_EC2_METADATA_DISABLED: "true",
  AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION || "auto",
};
function run(bin, args, extra = {}) {
  const r = spawnSync(bin, args, {
    env: { ...env, ...extra },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 900000,
  });
  if (r.status !== 0)
    throw new Error(
      "Backup gagal pada " +
        bin +
        "; tidak ada klaim cadangan berhasil. Detail upstream tidak dicetak agar rahasia tidak bocor.",
    );
  return r.stdout.toString();
}
try {
  run("aws", [
    "s3api",
    "head-bucket",
    "--bucket",
    env.LMS_BACKUP_BUCKET,
    "--endpoint-url",
    endpoint.origin,
  ]);
  run(process.execPath, ["scripts/backup-db.mjs"]);
  for (const bucket of ["lms-private", "profile-photos"])
    run(process.execPath, ["scripts/backup-storage.mjs"], {
      LMS_STORAGE_BUCKET: bucket,
    });
  const files = await readdir(root);
  if (
    !files.some((f) => f.endsWith(".aesgcm")) ||
    files.filter((f) => f.startsWith("lms-storage-")).length !== 2
  )
    throw new Error("Paket backup tidak lengkap.");
  // Upload only the directory assembled by successful encrypted exporters; never the repository or runner env.
  const prefix =
    "lms-nurul-falah/" + new Date().toISOString().replace(/[:.]/g, "-");
  run("aws", [
    "s3",
    "cp",
    root,
    "s3://" + env.LMS_BACKUP_BUCKET + "/" + prefix + "/",
    "--recursive",
    "--only-show-errors",
    "--endpoint-url",
    endpoint.origin,
  ]);
  const verify = await mkdtemp(path.join(tmpdir(), "lms-backup-verify-"));
  try {
    run("aws", [
      "s3",
      "cp",
      "s3://" + env.LMS_BACKUP_BUCKET + "/" + prefix + "/",
      verify,
      "--recursive",
      "--only-show-errors",
      "--endpoint-url",
      endpoint.origin,
    ]);
    async function inventory(dir, relative = "") {
      let result = [];
      for (const name of await readdir(path.join(dir, relative))) {
        const file = path.join(relative, name);
        if ((await stat(path.join(dir, file))).isDirectory())
          result.push(...(await inventory(dir, file)));
        else result.push(file);
      }
      return result.sort();
    }
    const originals = await inventory(root),
      remote = await inventory(verify);
    if (JSON.stringify(originals) !== JSON.stringify(remote))
      throw new Error("Inventaris backup remote tidak cocok.");
    for (const file of originals)
      if (
        digest(await readFile(path.join(root, file))) !==
        digest(await readFile(path.join(verify, file)))
      )
        throw new Error("Checksum backup remote tidak cocok.");
  } finally {
    await rm(verify, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify({
      backup: "uploaded_encrypted",
      database: true,
      storage_buckets: 2,
      remote_checksum_verified: true,
      created_at: new Date().toISOString(),
      restore_verified: false,
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
