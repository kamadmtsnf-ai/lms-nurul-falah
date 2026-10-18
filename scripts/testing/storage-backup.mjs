import {
  mkdir,
  writeFile,
  readFile,
  rm,
  rename,
  chmod,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { encryptBackup, decryptBackup, digest } from "./backup-crypto.mjs";
const MAX_BYTES = 5000000;
export function safeObjectPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2000 ||
    value.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("Path objek tidak aman.");
  return value;
}
export async function backupStorage(adapter, destination, key) {
  const root = path.resolve(destination);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  const temp = path.join(root, ".storage-pending-" + randomUUID());
  await mkdir(temp, { mode: 0o700 });
  const files = [],
    seen = new Set(),
    folders = [""];
  try {
    while (folders.length) {
      const prefix = folders.shift();
      for (let offset = 0; ; offset += 1000) {
        const rows = await adapter.list(prefix, offset, 1000);
        if (!Array.isArray(rows))
          throw new Error("Daftar Storage tidak valid.");
        for (const row of rows) {
          if (typeof row.name !== "string" || row.name.includes("/"))
            throw new Error("Nama objek tidak valid.");
          const object = safeObjectPath(
            prefix ? prefix + "/" + row.name : row.name,
          );
          if (seen.has(object))
            throw new Error(
              "Path Storage berulang; hentikan agar cadangan tidak ambigu.",
            );
          seen.add(object);
          if (seen.size > 100000)
            throw new Error("Inventaris Storage terlalu besar untuk alat ini.");
          if (!row.id) {
            folders.push(object);
            continue;
          }
          const blob = await adapter.download(object);
          if (blob.size < 1 || blob.size > MAX_BYTES)
            throw new Error("Ukuran objek di luar kebijakan aplikasi.");
          const bytes = Buffer.from(await blob.arrayBuffer());
          const archive = String(files.length).padStart(8, "0") + ".aesgcm",
            encrypted = encryptBackup(bytes, key);
          await writeFile(path.join(temp, archive), encrypted, {
            mode: 0o600,
            flag: "wx",
          });
          files.push({
            path: object,
            mime:
              blob.type || row.metadata?.mimetype || "application/octet-stream",
            bytes: bytes.length,
            sha256: digest(bytes),
            archive,
            encrypted_sha256: digest(encrypted),
          });
          bytes.fill(0);
        }
        if (rows.length < 1000) break;
      }
    }
    const created_at = new Date().toISOString(),
      manifest = encryptBackup(
        Buffer.from(
          JSON.stringify({
            version: 1,
            bucket: "lms-private",
            created_at,
            files,
          }),
        ),
        key,
      );
    await writeFile(path.join(temp, "manifest.aesgcm"), manifest, {
      mode: 0o600,
      flag: "wx",
    });
    const index = {
      format: "LMS-STORAGE-1",
      created_at,
      manifest: "manifest.aesgcm",
      manifest_sha256: digest(manifest),
      object_count: files.length,
    };
    await writeFile(
      path.join(temp, "index.json"),
      JSON.stringify(index, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    const finished = path.join(
      root,
      "lms-storage-" +
        created_at.replace(/[:.]/g, "-") +
        "-" +
        randomUUID().slice(0, 8),
    );
    await rename(temp, finished);
    return { directory: finished, objects: files.length };
  } catch (e) {
    await rm(temp, { recursive: true, force: true });
    throw e;
  }
}
export async function restoreStorageLocal(indexFile, destination, key) {
  const root = path.resolve(destination);
  if (!/^lms_storage_restore_[a-z0-9_-]+$/.test(path.basename(root)))
    throw new Error(
      "Gunakan direktori uji baru bernama lms_storage_restore_*.",
    );
  const index = JSON.parse(await readFile(indexFile, "utf8"));
  if (index.format !== "LMS-STORAGE-1" || index.manifest !== "manifest.aesgcm")
    throw new Error("Manifest Storage tidak valid.");
  const archiveRoot = path.dirname(path.resolve(indexFile)),
    sealed = await readFile(path.join(archiveRoot, index.manifest));
  if (digest(sealed) !== index.manifest_sha256)
    throw new Error("Checksum manifest tidak sesuai.");
  const manifest = JSON.parse(decryptBackup(sealed, key).toString("utf8"));
  if (
    manifest.version !== 1 ||
    manifest.bucket !== "lms-private" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== index.object_count
  )
    throw new Error("Inventaris Storage tidak sesuai.");
  const seen = new Set();
  for (const f of manifest.files) {
    safeObjectPath(f.path);
    if (
      seen.has(f.path) ||
      !/^\d{8}\.aesgcm$/.test(f.archive) ||
      !Number.isInteger(f.bytes) ||
      f.bytes < 1 ||
      f.bytes > MAX_BYTES
    )
      throw new Error("Entri cadangan tidak valid.");
    seen.add(f.path);
  }
  await mkdir(root, { mode: 0o700 });
  try {
    for (const f of manifest.files) {
      const sealed = await readFile(path.join(archiveRoot, f.archive));
      if (digest(sealed) !== f.encrypted_sha256)
        throw new Error("Checksum objek tidak sesuai.");
      const bytes = decryptBackup(sealed, key);
      if (bytes.length !== f.bytes || digest(bytes) !== f.sha256)
        throw new Error("Hash atau ukuran objek hasil pemulihan tidak sesuai.");
      const output = path.join(root, "objects", f.path);
      await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      await writeFile(output, bytes, { mode: 0o600, flag: "wx" });
      bytes.fill(0);
    }
    await writeFile(
      path.join(root, "restored-manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    return { objects: manifest.files.length };
  } catch (e) {
    await rm(root, { recursive: true, force: true });
    throw e;
  }
}
