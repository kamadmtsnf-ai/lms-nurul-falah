import { test } from "node:test";
import assert from "node:assert/strict";
import { probe } from "../scripts/operations/check-production.mjs";
const mock =
  (status = 200, body = { status: "ok", service: "lms-nurul-falah" }) =>
  async (url: string) =>
    url.endsWith("/health")
      ? Response.json(body, { status })
      : Response.json(
          {},
          {
            status: url.endsWith("/answers") ? 403 : 401,
            headers: { "cache-control": "private, no-store" },
          },
        );
test("operational probe validates service, denial and cache without claiming private service readiness", async () => {
  const r = await probe(mock() as typeof fetch);
  assert.equal(r.liveness, "passed");
  assert.match(r.database_storage_smtp_readiness, /not_proven/);
  await assert.rejects(() => probe(mock(503) as typeof fetch), /Liveness/);
  await assert.rejects(
    () => probe(mock(200, { status: "ok", service: "other" }) as typeof fetch),
    /Identitas/,
  );
  await assert.rejects(
    () =>
      probe((async () =>
        Response.json({
          status: "ok",
          service: "lms-nurul-falah",
        })) as typeof fetch),
    /Proteksi/,
  );
});
