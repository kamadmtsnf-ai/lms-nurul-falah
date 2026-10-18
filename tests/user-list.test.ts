import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareUsernames,
  filterUsers,
  userActivation,
  loadAllSchoolUsers,
  type ManagedUser,
  type UserListOptions,
} from "../src/lib/auth/user-list";
const row = (
  username: string,
  extra: Partial<ManagedUser> = {},
): ManagedUser => ({
  id: username,
  username_normalized: username,
  full_name: "Nama " + username,
  contact_email: null,
  email_verified_at: "2026-10-18",
  must_change_password: false,
  status: "active",
  roles: ["student"],
  ...extra,
});
const defaults: UserListOptions = {
  account: "all",
  activation: "all",
  sort: "asc",
  search: "",
};
test("username ordering: letters first in both directions, natural numeric runs, punctuation, leading zeros and large values", () => {
  const names = ["100", "9", "guru10", "guru2", "beta", "alpha", "0002", "2"];
  const asc = [...names].sort((a, b) => compareUsernames(a, b));
  assert.deepEqual(asc, [
    "alpha",
    "beta",
    "guru2",
    "guru10",
    "0002",
    "2",
    "9",
    "100",
  ]);
  const desc = [...names].sort((a, b) => compareUsernames(a, b, "desc"));
  assert.deepEqual(desc, [
    "guru10",
    "guru2",
    "beta",
    "alpha",
    "100",
    "9",
    "2",
    "0002",
  ]);
  assert.ok(compareUsernames("aa", "a2") < 0);
  assert.ok(compareUsernames("aa", "a2", "desc") < 0);
  assert.ok(
    compareUsernames(
      "999999999999999999999999999999",
      "1000000000000000000000000000000",
    ) < 0,
  );
  assert.equal(compareUsernames("GURU2", "guru2"), 0);
  const sample = [...names, "a", "a02a", "a2b", "a-b", "a_b", "a.b"];
  for (const direction of ["asc", "desc"] as const) {
    const sorted = sample.sort((a, b) => compareUsernames(a, b, direction));
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++)
        assert.ok(compareUsernames(sorted[i], sorted[j], direction) <= 0);
  }
});
test("account and activation filters combine with case-insensitive literal username/name search", () => {
  const users = [
    row("guru2", { full_name: "Ahmad Fadli" }),
    row("siswa9", {
      must_change_password: true,
      email_verified_at: "2026-10-18",
    }),
    row("siswa10", { email_verified_at: null, status: "disabled" }),
    row("wali1", { status: "disabled", full_name: "Nama + literal" }),
  ];
  assert.equal(userActivation(users[1]), "password");
  assert.deepEqual(
    filterUsers(users, {
      ...defaults,
      account: "disabled",
      activation: "email",
    }).map((x) => x.id),
    ["siswa10"],
  );
  assert.deepEqual(
    filterUsers(users, { ...defaults, search: "  FADLI " }).map((x) => x.id),
    ["guru2"],
  );
  assert.deepEqual(
    filterUsers(users, {
      ...defaults,
      search: "SISWA",
      activation: "password",
    }).map((x) => x.id),
    ["siswa9"],
  );
  assert.deepEqual(
    filterUsers(users, { ...defaults, search: "+" }).map((x) => x.id),
    ["wali1"],
  );
  assert.equal(
    filterUsers(users, { ...defaults, account: "active", activation: "email" })
      .length,
    0,
  );
  assert.equal(users[0].id, "guru2");
});
test("complete authorized listing includes later RPC pages; rejects truncation and propagates access errors", async () => {
  const rows = Array.from({ length: 101 }, (_, i) => row("user" + i));
  const offsets: number[] = [];
  const loaded = await loadAllSchoolUsers(async (offset) => {
    offsets.push(offset);
    return rows.slice(offset, offset + 50);
  });
  assert.deepEqual(offsets, [0, 50, 100]);
  assert.equal(loaded.length, 101);
  assert.equal(
    filterUsers(loaded, { ...defaults, search: "user100" })[0].id,
    "user100",
  );
  await assert.rejects(
    () =>
      loadAllSchoolUsers(async (offset) => rows.slice(offset, offset + 50), 50),
    /melebihi/,
  );
  await assert.rejects(
    () =>
      loadAllSchoolUsers(async () => {
        throw new Error("Forbidden");
      }),
    /Forbidden/,
  );
  assert.equal((await loadAllSchoolUsers(async () => [])).length, 0);
});

test("full listing reuses database school-admin, activation and session guards beyond the first 50 users", async () => {
  const { fixture, school } = await import("../scripts/testing/fixture");
  const { randomUUID } = await import("node:crypto");
  const f = await fixture(51);
  const list = (actor: number, targetSchool = school) =>
    loadAllSchoolUsers(
      async (offset) =>
        (
          await f.db.query<{ v: ManagedUser[] }>(
            "select public.identity_command($1,$2::jsonb) v",
            [
              "admin_list",
              JSON.stringify({
                actor: f.actors[actor].id,
                session: f.actors[actor].session,
                school: targetSchool,
                offset,
              }),
            ],
          )
        ).rows[0].v,
    );
  try {
    const users = await list(0);
    assert.equal(users.length, 53);
    assert.equal(new Set(users.map((u) => u.id)).size, 53);
    await assert.rejects(() => list(1), /Forbidden/);
    await assert.rejects(() => list(0, randomUUID()), /Forbidden/);
    await f.db.query(
      "update profiles set must_change_password=true where id=$1",
      [f.actors[0].id],
    );
    await assert.rejects(() => list(0), /Activation required/);
    await f.db.query("delete from auth.sessions where id=$1", [
      f.actors[0].session,
    ]);
    await assert.rejects(() => list(0), /Invalid session/);
  } finally {
    await f.db.close();
  }
});
