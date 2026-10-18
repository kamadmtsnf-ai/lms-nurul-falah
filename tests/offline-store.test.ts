import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  saveOffline,
  listOffline,
  clearOffline,
  deleteOffline,
  watchOfflineClear,
} from "../src/lib/offline/store";
import type { OfflineRecord } from "../src/lib/offline/crypto";
class MemoryStorage {
  values = new Map<string, string>();
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, v);
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
}
test("IndexedDB lokal: ciphertext, kuota, pergantian akun, logout dan broadcast tab", async () => {
  const store = new MemoryStorage(),
    local = new MemoryStorage(),
    win = new EventTarget(),
    factory = new IDBFactory();
  const originals = Object.fromEntries(
    ["indexedDB", "window", "sessionStorage", "localStorage"].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  for (const [k, value] of Object.entries({
    indexedDB: factory,
    window: win,
    sessionStorage: store,
    localStorage: local,
  }))
    Object.defineProperty(globalThis, k, { value, configurable: true });
  let db: IDBDatabase | undefined;
  try {
    const row: OfflineRecord = {
      id: "a:course:draft:1",
      owner: "a",
      school: "a-school",
      course: "a-course",
      kind: "draft",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      content: {
        id: "task",
        body: "Jawaban draf privat",
        links: [],
        request_id: "once",
        revision: 0,
      },
    };
    await saveOffline(row);
    assert.equal((await listOffline())[0].content.body, "Jawaban draf privat");
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("lms-offline-v1");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const raw = await new Promise<unknown[]>((resolve, reject) => {
      const r = db!.transaction("records").objectStore("records").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    assert.equal(JSON.stringify(raw).includes("Jawaban draf privat"), false);
    for (let i = 2; i <= 20; i++)
      await saveOffline({ ...row, id: "draft" + i });
    await assert.rejects(
      () => saveOffline({ ...row, id: "overflow" }),
      /20 materi/,
    );
    await deleteOffline("draft20");
    assert.equal((await listOffline()).length, 19);
    const secondTab = new MemoryStorage();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: secondTab,
      configurable: true,
    });
    await saveOffline({ ...row, id: "second-tab" });
    assert.equal((await listOffline()).length, 1);
    Object.defineProperty(globalThis, "sessionStorage", {
      value: store,
      configurable: true,
    });
    assert.equal((await listOffline()).length, 19);
    await saveOffline({
      ...row,
      id: "b-draft",
      owner: "b",
      school: "b-school",
    });
    const switched = await listOffline();
    assert.equal(switched.length, 1);
    assert.equal(switched[0].owner, "b");
    assert.equal(store.getItem("lms-offline-owner"), "b");
    const unwatch = watchOfflineClear();
    const event = new Event("storage");
    Object.defineProperty(event, "key", { value: "lms-offline-clear" });
    win.dispatchEvent(event);
    for (let i = 0; i < 20 && (await listOffline()).length; i++)
      await new Promise((r) => setTimeout(r, 5));
    assert.equal((await listOffline()).length, 0);
    assert.equal(store.getItem("lms-offline-key"), null);
    unwatch();
    await saveOffline(row);
    await clearOffline();
    assert.equal((await listOffline()).length, 0);
    assert.ok(local.getItem("lms-offline-clear"));
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        saveOffline({ ...row, id: "parallel" + i }),
      ),
    );
    assert.equal((await listOffline()).length, 20);
    await assert.rejects(
      () => saveOffline({ ...row, id: "parallel-overflow" }),
      /20 materi/,
    );
    await clearOffline();
    await Promise.all([saveOffline(row), clearOffline()]);
    assert.equal((await listOffline()).length, 0);
  } finally {
    db?.close();
    for (const k of Object.keys(originals)) {
      const d = originals[k];
      if (d) Object.defineProperty(globalThis, k, d);
      else Reflect.deleteProperty(globalThis, k);
    }
  }
});
