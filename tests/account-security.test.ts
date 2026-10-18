import type { Transaction } from "@electric-sql/pglite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, school } from "../scripts/testing/fixture";
import {
  needsSecondFactor,
  verifiedTotp,
  maskNik,
} from "../src/lib/account-security/policy";
import { profileSchemas } from "../src/lib/profile/validation";

test("MFA policy accepts only verified TOTP and requires aal2; NIK validation has explicit preserve/clear semantics", () => {
  const unverified = { id: "a", factor_type: "totp", status: "unverified" },
    verified = { ...unverified, id: "b", status: "verified" };
  assert.equal(needsSecondFactor(undefined, undefined), false);
  assert.equal(needsSecondFactor([unverified], "aal1"), false);
  assert.equal(needsSecondFactor([verified], "aal1"), true);
  assert.equal(needsSecondFactor([verified], undefined), true);
  assert.equal(needsSecondFactor([verified], "aal2"), false);
  assert.equal(
    needsSecondFactor([{ ...verified, factor_type: "phone" }], "aal1"),
    false,
  );
  assert.deepEqual(verifiedTotp([verified, unverified]), [verified]);
  assert.equal(maskNik("0012345678901234"), "••••••••••••1234");
  assert.equal(maskNik(""), "");
  const v = { school, revision: 0, nik: "", password: "current-pass" };
  assert.equal(profileSchemas.identity.parse(v).clear_nik, false);
  assert.equal(
    profileSchemas.identity.safeParse({ ...v, password: "" }).success,
    false,
  );
  assert.equal(
    profileSchemas.identity.safeParse({
      ...v,
      nik: "0012345678901234",
      clear_nik: true,
    }).success,
    false,
  );
});

test("security database: MFA gates RLS/RPC/service paths, NIK minimization, own sessions and revocation", async (t) => {
  const f = await fixture(2),
    a = f.actors[0],
    teacher = f.actors[1];
  const rpc = async (cmd: string, p: Record<string, unknown> = {}) =>
    (
      await f.db.query<{ v: any }>(
        "select public.security_command($1,$2::jsonb) v",
        [cmd, JSON.stringify({ actor: a.id, session: a.session, ...p })],
      )
    ).rows[0].v;
  const profile = async (cmd = "read", data: Record<string, unknown> = {}) =>
    (
      await f.db.query<{ v: any }>(
        "select public.profile_command($1,$2::jsonb) v",
        [
          cmd,
          JSON.stringify({
            actor: a.id,
            session: a.session,
            school,
            data,
            revision:
              (
                await f.db.query<{ revision: number }>(
                  "select revision from private.profile_details where user_id=$1",
                  [a.id],
                )
              ).rows[0]?.revision || 0,
          }),
        ],
      )
    ).rows[0].v;
  async function claims<T>(aal: string, fn: (tx: Transaction) => Promise<T>) {
    return f.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: a.id,
          session_id: a.session,
          role: "authenticated",
          aal,
        }),
      ]);
      await tx.exec("set local role authenticated");
      return fn(tx);
    });
  }
  try {
    await t.test(
      "only the owner can see sessions and reveal NIK; normal profile never contains full NIK",
      async () => {
        await f.db.query(
          "insert into private.profile_details(user_id,nik) values($1,$2)",
          [a.id, "0012345678901234"],
        );
        await f.db.query(
          "insert into private.profile_details(user_id,nik) values($1,$2)",
          [teacher.id, "9999999999999999"],
        );
        const current = await profile();
        assert.equal(current.nik, "");
        assert.equal(current.has_nik, true);
        assert.equal(current.nik_masked, "••••••••••••1234");
        assert.ok(!JSON.stringify(current).includes("0012345678901234"));
        assert.equal(
          (await rpc("reveal-nik", { target: teacher.id })).nik,
          "0012345678901234",
        );
        const state = await rpc("state", { target: teacher.id });
        assert.deepEqual(
          state.sessions.map((s: any) => s.id),
          [a.session],
        );
        assert.ok(!JSON.stringify(state).includes("0012345678901234"));
        assert.equal(state.events[0].field, "security.nik_revealed");
        await assert.rejects(
          () => rpc("state", { session: teacher.session }),
          /Sesi tidak valid/,
        );
        await profile("identity", { nik: "", nip: "", npk: "" });
        assert.equal((await profile()).has_nik, true);
        await profile("identity", {
          nik: "",
          nip: "",
          npk: "",
          clear_nik: true,
        });
        assert.equal((await profile()).has_nik, false);
        await assert.rejects(
          () => profile("identity", { nik: "1111111111111111" }),
          /45 hari/,
        );
      },
    );
    await t.test(
      "service-only security functions reject authenticated/anonymous callers",
      async () => {
        for (const role of ["authenticated", "anon"])
          await assert.rejects(
            () =>
              f.db.transaction(async (tx) => {
                await tx.exec(`set local role ${role}`);
                return tx.query("select public.security_command('state','{}')");
              }),
            /permission denied/,
          );
        await assert.rejects(
          () =>
            f.as(0, (tx) =>
              tx.query(
                "select public.security_invalidate_user($1,'logout_all')",
                [teacher.id],
              ),
            ),
          /permission denied/,
        );
      },
    );
    await f.db.query(
      "insert into auth.mfa_factors values($1,$2,'verified','totp')",
      [randomUUID(), a.id],
    );
    await t.test(
      "MFA aal1 can read only own basic profile, cannot see memberships/student data or call business RPCs",
      async () => {
        assert.equal(
          (
            await claims("aal1", (tx) =>
              tx.query("select id from public.profiles"),
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await claims("aal1", (tx) =>
              tx.query("select id from public.school_memberships"),
            )
          ).rows.length,
          0,
        );
        for (const name of [
          "academic",
          "learning",
          "quiz",
          "advanced",
          "development",
        ])
          await assert.rejects(
            () =>
              claims("aal1", (tx) =>
                tx.query(`select public.${name}_command('state',$1::jsonb)`, [
                  JSON.stringify({ school, course: f.course }),
                ]),
              ),
            /Verifikasi dua langkah/,
          );
        await assert.rejects(() => profile(), /Verifikasi dua langkah/);
        await assert.rejects(() => rpc("state"), /Verifikasi dua langkah/);
        await assert.rejects(
          () =>
            f.db.query(
              "select public.identity_command('admin_list',$1::jsonb)",
              [JSON.stringify({ actor: a.id, session: a.session, school })],
            ),
          /Verifikasi dua langkah/,
        );
        // Supplying aal2 in a JWT alone cannot upgrade the real session.
        assert.equal(
          (
            await claims("aal2", (tx) =>
              tx.query<{ v: boolean }>("select private.account_ready() v"),
            )
          ).rows[0].v,
          false,
        );
      },
    );
    await f.db.query("update auth.sessions set aal='aal2' where id=$1", [
      a.session,
    ]);
    await t.test(
      "both JWT and server session must be aal2; other accounts stay usable",
      async () => {
        assert.equal(
          (
            await claims("aal1", (tx) =>
              tx.query<{ v: boolean }>("select private.account_ready() v"),
            )
          ).rows[0].v,
          false,
        );
        assert.equal(
          (
            await claims("aal2", (tx) =>
              tx.query<{ v: boolean }>("select private.account_ready() v"),
            )
          ).rows[0].v,
          true,
        );
        assert.equal(
          (
            await claims("aal2", (tx) =>
              tx.query("select id from public.school_memberships"),
            )
          ).rows.length,
          f.actors.length,
        );
        await claims("aal2", (tx) =>
          tx.query("select public.academic_command('state',$1::jsonb)", [
            JSON.stringify({ school }),
          ]),
        );
        await profile();
        await rpc("state");
        assert.equal(
          (
            await f.as(1, (tx) =>
              tx.query<{ v: boolean }>("select private.account_ready() v"),
            )
          ).rows[0].v,
          true,
        );
      },
    );
    await t.test(
      "revoking other sessions preserves this device and other users; revoked JWT immediately loses RLS access",
      async () => {
        const other = randomUUID();
        await f.db.query(
          "insert into auth.sessions(id,user_id,created_at,aal) values($1,$2,clock_timestamp(),'aal2')",
          [other, a.id],
        );
        assert.equal((await rpc("state")).sessions.length, 2);
        assert.equal((await rpc("revoke-others")).revoked, 1);
        assert.deepEqual(
          (await rpc("state")).sessions.map((s: any) => s.id),
          [a.session],
        );
        assert.equal(
          (
            await f.db.query("select id from auth.sessions where user_id=$1", [
              teacher.id,
            ])
          ).rows.length,
          1,
        );
        await assert.rejects(
          () => rpc("state", { session: other }),
          /Sesi tidak valid/,
        );
        await f.db.query(
          "select public.security_invalidate_user($1,'logout_all')",
          [a.id],
        );
        assert.equal(
          (
            await claims("aal2", (tx) =>
              tx.query<{ v: boolean }>("select private.live_session() v"),
            )
          ).rows[0].v,
          false,
        );
        await assert.rejects(() => profile(), /Sesi|Verifikasi dua langkah/);
      },
    );
    await t.test(
      "trusted operator recovery retains identity data and MFA factors until native removal, forces password change and consumes recovery tokens",
      async () => {
        await f.db.query("insert into private.email_tokens(user_id,email_target,purpose,token_hash,expires_at) values($1,'test@example.test','reset_password',$2,clock_timestamp()+interval '1 hour')", [teacher.id,'a'.repeat(64)]);
        await f.db.query("insert into private.password_locks values($1,$2,clock_timestamp()+interval '5 minutes')",[teacher.id,randomUUID()]);
        await f.db.query(
          "select public.security_invalidate_user($1,'operator_mfa_recovery')",
          [teacher.id],
        );
        const p = (
          await f.db.query<{
            must_change_password: boolean;
            contact_email: string;
          }>(
            "select must_change_password,contact_email from profiles where id=$1",
            [teacher.id],
          )
        ).rows[0];
        assert.equal(p.must_change_password, true);
        assert.equal((await f.db.query("select id from private.email_tokens where user_id=$1 and consumed_at is null",[teacher.id])).rows.length,0);
        assert.equal((await f.db.query("select user_id from private.password_locks where user_id=$1",[teacher.id])).rows.length,0);
        assert.equal(p.contact_email, "test@example.test");
        assert.equal(
          (
            await f.db.query("select id from auth.sessions where user_id=$1", [
              teacher.id,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await f.db.query(
              "select id from auth.mfa_factors where user_id=$1",
              [a.id],
            )
          ).rows.length,
          1,
        );
        await assert.rejects(
          () =>
            f.db.query("select public.security_invalidate_user($1,'invalid')", [
              a.id,
            ]),
          /Alasan tidak valid/,
        );
      },
    );
  } finally {
    await f.db.close();
  }
});
