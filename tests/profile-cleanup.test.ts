import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { purgeProfilePhotos } from "../src/lib/profile/cleanup";
test("retention deletes profile photos only under the authorized student prefix; retries drain current page without skipping", async () => {
  const owner = randomUUID();
  const pending = Array.from({ length: 101 }, () => ({
    id: randomUUID(),
    name: randomUUID() + ".webp",
  }));
  const deleted: string[] = [];
  const count = await purgeProfilePhotos(owner, {
    list: async (prefix) => {
      assert.equal(prefix, owner);
      return pending.slice(0, 100);
    },
    remove: async (paths) => {
      for (const path of paths) assert.ok(path.startsWith(owner + "/"));
      deleted.push(...paths);
      pending.splice(0, paths.length);
    },
  });
  assert.equal(count, 101);
  assert.equal(deleted.length, 101);
  assert.equal(new Set(deleted).size, 101);
  assert.equal(
    await purgeProfilePhotos(owner, {
      list: async () => [],
      remove: async () => {
        throw Error("unexpected");
      },
    }),
    0,
  );
});
test("retention photo cleanup fails closed for invalid paths, inventory and deletion failures", async () => {
  const owner = randomUUID();
  let removed = false;
  for (const name of ["../other.webp", "nested/photo.webp", "other.png"])
    await assert.rejects(
      () =>
        purgeProfilePhotos(owner, {
          list: async () => [{ id: randomUUID(), name }],
          remove: async () => {
            removed = true;
          },
        }),
      /Inventaris/,
    );
  assert.equal(removed, false);
  await assert.rejects(
    () =>
      purgeProfilePhotos("../other", {
        list: async () => [],
        remove: async () => {},
      }),
    /Pemilik/,
  );
  await assert.rejects(
    () =>
      purgeProfilePhotos(owner, {
        list: async () => {
          throw Error("list failed");
        },
        remove: async () => {},
      }),
    /list failed/,
  );
  await assert.rejects(
    () =>
      purgeProfilePhotos(owner, {
        list: async () => [{ id: randomUUID(), name: randomUUID() + ".webp" }],
        remove: async () => {
          throw Error("delete failed");
        },
      }),
    /delete failed/,
  );
});
