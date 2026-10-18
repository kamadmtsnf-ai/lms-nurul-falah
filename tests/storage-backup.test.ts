import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  mkdtemp,
  readFile,
  writeFile,
  stat,
  rm,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  backupStorage,
  restoreStorageLocal,
  safeObjectPath,
} from "../scripts/testing/storage-backup.mjs";
test("Storage: encrypted inventory and objects restore with matching hashes, private permissions, no overwrite", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lms-storage-test-")),
    key = randomBytes(32);
  try {
    const result = await backupStorage(
      {
        list: async (prefix) =>
          prefix === ""
            ? [{ id: null, name: "school" }]
            : [{ id: "1", name: "file.pdf" }],
        download: async () =>
          new Blob(["%PDF synthetic private bytes"], {
            type: "application/pdf",
          }),
      },
      root,
      key,
    );
    const index = path.join(result.directory, "index.json");
    const entries = await readdir(result.directory);
    for (const file of entries) {
      assert.equal(
        (await stat(path.join(result.directory, file))).mode & 0o777,
        0o600,
      );
      assert.equal(
        (await readFile(path.join(result.directory, file))).includes(
          Buffer.from("synthetic private bytes"),
        ),
        false,
      );
    }
    const target = path.join(root, "lms_storage_restore_fixture");
    assert.deepEqual(await restoreStorageLocal(index, target, key), {
      objects: 1,
    });
    assert.equal(
      await readFile(path.join(target, "objects/school/file.pdf"), "utf8"),
      "%PDF synthetic private bytes",
    );
    await assert.rejects(
      () => restoreStorageLocal(index, target, key),
      /EEXIST/,
    );
    const encrypted = path.join(result.directory, "00000000.aesgcm"),
      bytes = await readFile(encrypted);
    bytes[20] ^= 1;
    await writeFile(encrypted, bytes);
    const denied = path.join(root, "lms_storage_restore_corrupt");
    await assert.rejects(
      () => restoreStorageLocal(index, denied, key),
      /Checksum/,
    );
    await assert.rejects(() => stat(denied));
    await assert.rejects(
      () => restoreStorageLocal(index, path.join(root, "production"), key),
      /direktori uji/,
    );
  } finally {
    key.fill(0);
    await rm(root, { recursive: true, force: true });
  }
});
test("Storage: unsafe paths, duplicate listings and partial downloads fail closed", async () => {
  for (const p of [
    "../file",
    "/etc/file",
    "a//b",
    "a/../b",
    "a\\b",
    "a\u0000b",
  ])
    assert.throws(() => safeObjectPath(p));
  const root = await mkdtemp(path.join(tmpdir(), "lms-storage-fail-")),
    key = randomBytes(32);
  try {
    await assert.rejects(
      () =>
        backupStorage(
          {
            list: async () => [{ id: "1", name: "../bad" }],
            download: async () => new Blob(["x"]),
          },
          root,
          key,
        ),
      /Nama objek/,
    );
    assert.deepEqual(await readdir(root), []);
    await assert.rejects(
      () =>
        backupStorage(
          {
            list: async () => [
              { id: "1", name: "same" },
              { id: "2", name: "same" },
            ],
            download: async () => new Blob(["x"]),
          },
          root,
          key,
        ),
      /berulang/,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
