import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiRequestError,
  postJson,
  readJsonResponse,
} from "../src/lib/http/client";
import { SubmissionPacket } from "../src/lib/learning/submission-packet";
import { clearOffline, saveOffline } from "../src/lib/offline/store";
test("API retains server conflict status and safe JSON message", async () => {
  await assert.rejects(
    () =>
      readJsonResponse(
        Response.json({ message: "Revisi berubah." }, { status: 409 }),
      ),
    (e: unknown) =>
      e instanceof ApiRequestError &&
      e.status === 409 &&
      e.message === "Revisi berubah.",
  );
  await assert.rejects(
    () =>
      readJsonResponse(
        new Response("<html>proxy internals</html>", { status: 502 }),
      ),
    (e: unknown) =>
      e instanceof ApiRequestError &&
      e.status === 502 &&
      !e.message.includes("proxy internals"),
  );
});
test("JSON transport preserves envelope, no-store, abort signal and does not retry mutations", async () => {
  const original = globalThis.fetch,
    controller = new AbortController();
  let count = 0;
  globalThis.fetch = async (url, init) => {
    count++;
    assert.equal(url, "/api/test");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.signal, controller.signal);
    assert.equal(init?.body, JSON.stringify({ revision: 2 }));
    return Response.json({ result: { id: "saved" } });
  };
  try {
    assert.deepEqual(
      await postJson("/api/test", { revision: 2 }, controller.signal),
      { result: { id: "saved" } },
    );
    assert.equal(count, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("group submission retries same content with same request ID, new edits/revision get new ID", () => {
  let n = 0;
  const packet = new SubmissionPacket(() => String(++n));
  const data = { revision: 0, body: "Jawaban", links: [], asset_ids: [] };
  assert.equal(
    packet.for(data).request_id,
    packet.for(structuredClone(data)).request_id,
  );
  assert.notEqual(
    packet.for(data).request_id,
    packet.for({ ...data, body: "Revisi" }).request_id,
  );
  assert.notEqual(
    packet.for(data).request_id,
    packet.for({ ...data, revision: 1 }).request_id,
  );
});
test("blocked Web Storage cannot stop logout cleanup, invalid offline expiry is rejected", async () => {
  const names = ["window", "sessionStorage", "localStorage", "indexedDB"],
    old = Object.fromEntries(
      names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
    );
  const win = new EventTarget();
  let cleared = false;
  win.addEventListener("lms-offline-cleared", () => {
    cleared = true;
  });
  try {
    Object.defineProperty(globalThis, "window", {
      value: win,
      configurable: true,
    });
    for (const k of ["sessionStorage", "localStorage", "indexedDB"])
      Object.defineProperty(globalThis, k, {
        get() {
          throw new Error("Storage blocked");
        },
        configurable: true,
      });
    await clearOffline();
    assert.equal(cleared, true);
    await assert.rejects(
      () =>
        saveOffline({
          id: "x",
          owner: "a",
          school: "s",
          course: "c",
          kind: "draft",
          expires_at: "invalid",
          content: {},
        }),
      /Izin offline/,
    );
  } finally {
    for (const k of names) {
      const d = old[k];
      if (d) Object.defineProperty(globalThis, k, d);
      else Reflect.deleteProperty(globalThis, k);
    }
  }
});
