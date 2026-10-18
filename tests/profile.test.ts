import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { fixture, school } from "../scripts/testing/fixture";
import { profileSchemas, canEdit } from "../src/lib/profile/validation";
import { prepareProfilePhoto } from "../src/lib/profile/photo";
import sharp from "sharp";

test("profile validation preserves identifiers, normalizes phone, rejects forged readonly fields and bad photo bytes", async () => {
  const base = { revision: 0, school };
  assert.equal(
    profileSchemas.phone.parse({ ...base, phone: "+62 (812) 3456-7890" }).phone,
    "+6281234567890",
  );
  assert.equal(
    profileSchemas.identity.parse({
      ...base,
      nik: "0012345678901234",
      nip: "",
      npk: "",
    }).nik,
    "0012345678901234",
  );
  for (const input of [
    { ...base, nik: "123" },
    { ...base, nik: "", npk: "111" },
    { ...base, nik: "", role: "admin" },
  ])
    assert.equal(profileSchemas.identity.safeParse(input).success, false);
  assert.equal(
    profileSchemas.name.safeParse({
      ...base,
      name: "Siswa",
      status: "disabled",
    }).success,
    false,
  );
  assert.equal(
    profileSchemas.username.parse({
      ...base,
      username: "Guru.Baru",
      password: "valid-pass",
    }).username,
    "guru.baru",
  );
  assert.equal(
    canEdit("2026-10-18T00:00:00Z", Date.parse("2026-10-18T00:00:00Z")),
    true,
  );
  await assert.rejects(
    () => prepareProfilePhoto(new Uint8Array([1, 2, 3]), "image/png"),
    /tidak dapat dibaca/,
  );
  await assert.rejects(
    () => prepareProfilePhoto(new Uint8Array([1]), "image/svg+xml"),
    /JPG/,
  );
  await assert.rejects(
    () => prepareProfilePhoto(new Uint8Array(3 * 1024 * 1024 + 1), "image/png"),
    /3 MB/,
  );
  const original = await sharp({
    create: { width: 900, height: 700, channels: 3, background: "#00634d" },
  })
    .png()
    .toBuffer();
  const photo = await prepareProfilePhoto(original, "image/png"),
    meta = await sharp(photo).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 640);
  assert.ok(!meta.exif);
});

test("profile database: scoped readonly relations, cooldowns, revisions, photo lifecycle, username uniqueness, email verification and permissions", async (t) => {
  const f = await fixture(3);
  const raw = async (
    actor: number,
    cmd: string,
    extra: Record<string, unknown> = {},
  ) =>
    (
      await f.db.query<{ v: any }>(
        "select public.profile_command($1,$2::jsonb) v",
        [
          cmd,
          JSON.stringify({
            actor: f.actors[actor].id,
            session: f.actors[actor].session,
            school,
            ...extra,
          }),
        ],
      )
    ).rows[0].v;
  const read = (actor: number) => raw(actor, "read");
  const save = async (
    actor: number,
    cmd: string,
    data: Record<string, unknown>,
    revision?: number,
  ) =>
    raw(actor, cmd, {
      revision: revision ?? (await read(actor)).revision,
      data,
    });
  const identity = async (cmd: string, p: Record<string, unknown>) =>
    (
      await f.db.query<{ v: any }>(
        "select public.identity_command($1,$2::jsonb) v",
        [cmd, JSON.stringify(p)],
      )
    ).rows[0].v;
  const email = (email: string, extra: Record<string, unknown> = {}) =>
    identity("email_issue", {
      actor: f.actors[1].id,
      session: f.actors[1].session,
      email,
      hash: createHash("sha256").update(randomUUID()).digest("hex"),
      ...extra,
    });
  try {
    const room = (await read(2)).classrooms[0].id;
    await f.db.query(
      "insert into student_details(school_id,student_id,student_number) values($1,$2,$3)",
      [school, f.actors[2].id, "000123"],
    );
    const member = (
      await f.db.query<{ id: string }>(
        "select id from school_memberships where user_id=$1",
        [f.actors[1].id],
      )
    ).rows[0].id;
    for (const role of [
      "principal",
      "homeroom_teacher",
      "duty_teacher",
      "guardian",
    ])
      await f.db.query("insert into membership_roles values($1,$2,$3)", [
        school,
        member,
        role,
      ]);
    await f.db.query(
      "insert into guardian_students(school_id,guardian_id,student_id,relationship,linked_by) values($1,$2,$3,$4,$5),($1,$2,$6,$4,$5)",
      [
        school,
        f.actors[1].id,
        f.actors[2].id,
        "Wali",
        f.actors[0].id,
        f.actors[3].id,
      ],
    );
    await f.db.query(
      "insert into homeroom_assignments(school_id,classroom_id,teacher_id) values($1,$2,$3)",
      [school, room, f.actors[1].id],
    );
    const semester = (
      await f.db.query<{ semester_id: string }>(
        "select semester_id from classrooms where id=$1",
        [room],
      )
    ).rows[0].semester_id;
    await f.academic("duty_assignments", {
      semester_id: semester,
      teacher_id: f.actors[1].id,
      weekdays: [1, 4],
      active: true,
    });
    await t.test(
      "readonly school/class/student number, parent phone, multiple children and actual teaching duties",
      async () => {
        await save(1, "phone", { phone: "+6281234567890" });
        const student = await read(2);
        assert.equal(student.student_number, "000123");
        assert.equal(student.classrooms[0].id, room);
        assert.equal(student.guardians[0].phone, "+6281234567890");
        const teacher = await read(1);
        assert.equal(teacher.children.length, 2);
        assert.ok(
          teacher.duties.some((d: any) => d.kind === "Kepala Madrasah"),
        );
        assert.ok(
          teacher.duties.some(
            (d: any) =>
              d.kind === "Guru Piket" && d.weekdays.join(",") === "1,4",
          ),
        );
        assert.ok(teacher.duties.some((d: any) => d.kind === "Mengajar"));
        await f.db.query("update profiles set status='disabled' where id=$1", [
          f.actors[3].id,
        ]);
        assert.equal((await read(1)).children.length, 1);
        await f.db.query("update profiles set status='active' where id=$1", [
          f.actors[3].id,
        ]);
      },
    );
    await t.test(
      "name cooldown, no-op edits, stale revision and exact elapsed boundary",
      async () => {
        await save(1, "name", { name: "Guru Baru" });
        const snapshot = await read(1);
        assert.ok(snapshot.next.name);
        await save(1, "name", { name: "Guru Baru" });
        assert.equal((await read(1)).revision, snapshot.revision);
        await assert.rejects(
          () => save(1, "name", { name: "Guru Lagi" }),
          /45 hari/,
        );
        await assert.rejects(
          () =>
            save(1, "phone", { phone: "081234567890" }, snapshot.revision - 1),
          /Muat ulang/,
        );
        await f.db.query(
          "update private.profile_details set name_changed_at=clock_timestamp()-interval '45 days' where user_id=$1",
          [f.actors[1].id],
        );
        await save(1, "name", { name: "Guru Sesudah Batas" });
      },
    );
    await t.test(
      "students cannot change username; other users need 40 days and globally unique username",
      async () => {
        await assert.rejects(
          () => save(2, "username", { username: "siswa-baru" }),
          /Username siswa/,
        );
        await assert.rejects(
          () => save(1, "username", { username: "admin" }),
          /unique|duplicate/i,
        );
        await save(1, "username", { username: "guru-baru" });
        assert.equal(
          (await identity("lookup", { username: "guru-baru" })).id,
          f.actors[1].id,
        );
        await assert.rejects(
          () => save(1, "username", { username: "guru-lagi" }),
          /40 hari/,
        );
        await f.db.query(
          "update private.profile_details set username_changed_at=clock_timestamp()-interval '40 days' where user_id=$1",
          [f.actors[1].id],
        );
        await save(1, "username", { username: "guru-lagi" });
      },
    );
    await t.test(
      "teacher identifier group has a shared 45-day limit; student id and other-role NIP cannot be edited",
      async () => {
        await save(1, "identity", {
          nik: "0012345678901234",
          nip: "001234567890123456",
          npk: "0012345678901",
        });
        await assert.rejects(
          () =>
            save(1, "identity", {
              nik: "1012345678901234",
              nip: "001234567890123456",
              npk: "0012345678901",
            }),
          /45 hari/,
        );
        await assert.rejects(
          () => save(2, "identity", { nik: "0012345678901234" }),
          /Nomor induk/,
        );
        await assert.rejects(
          () =>
            save(0, "identity", {
              nik: "0012345678901234",
              nip: "001234567890123456",
            }),
          /tenaga pendidik/,
        );
        await save(0, "identity", { nik: "0012345678901234" });
      },
    );
    await t.test(
      "photo ownership, 90-day upload/delete limit and revision protection",
      async () => {
        const path = `${f.actors[1].id}/${randomUUID()}.webp`;
        await save(1, "photo", { path });
        assert.equal((await raw(1, "photo-read")).path, path);
        await assert.rejects(() => save(1, "photo", { path: null }), /90 hari/);
        await assert.rejects(
          () =>
            save(1, "photo", {
              path: `${f.actors[0].id}/${randomUUID()}.webp`,
            }),
          /Lokasi foto/,
        );
        await f.db.query(
          "update private.profile_details set photo_changed_at=clock_timestamp()-interval '90 days' where user_id=$1",
          [f.actors[1].id],
        );
        const removed = await save(1, "photo", { path: null });
        assert.equal(removed.old_path, path);
        assert.equal((await read(1)).has_photo, false);
        await assert.rejects(
          () =>
            save(1, "photo", {
              path: `${f.actors[1].id}/${randomUUID()}.webp`,
            }),
          /90 hari/,
        );
      },
    );
    await t.test(
      "email change invalidates verification; same-target resend works; all other paths honor 60 days",
      async () => {
        await assert.rejects(
          () => email("baru@example.test"),
          /Halaman Profil/,
        );
        let revision = (await read(1)).revision;
        await email("baru@example.test", { profile_change: true, revision });
        await assert.rejects(() => read(1), /aktivasi/);
        await assert.rejects(
          () => email("lain@example.test", { profile_change: true, revision }),
          /60 hari/,
        );
        const hash = createHash("sha256").update(randomUUID()).digest("hex");
        const ticket = await email("baru@example.test", { hash });
        await identity("mail_sent", { token_id: ticket.id });
        await identity("email_confirm", {
          actor: f.actors[1].id,
          session: f.actors[1].session,
          hash,
        });
        const profile = await read(1);
        assert.equal(profile.email, "baru@example.test");
        assert.ok(profile.email_verified_at);
        assert.ok(profile.next.email);
        await assert.rejects(
          () =>
            email("lain@example.test", {
              profile_change: true,
              revision: profile.revision,
            }),
          /60 hari/,
        );
        await f.db.query(
          "update private.profile_details set email_changed_at=clock_timestamp()-interval '60 days' where user_id=$1",
          [f.actors[1].id],
        );
        await email("lain@example.test", {
          profile_change: true,
          revision: profile.revision,
        });
      },
    );
    await t.test(
      "service-role only, session ownership, school isolation, activation and disabled account enforcement",
      async () => {
        await assert.rejects(
          () => raw(0, "read", { session: f.actors[2].session }),
          /Sesi/,
        );
        await assert.rejects(
          () => raw(0, "read", { school: randomUUID() }),
          /Sekolah/,
        );
        await f.db.query(
          "update profiles set must_change_password=true where id=$1",
          [f.actors[2].id],
        );
        await assert.rejects(() => read(2), /aktivasi/);
        await f.db.query(
          "update profiles set must_change_password=false,status='disabled' where id=$1",
          [f.actors[2].id],
        );
        await assert.rejects(() => read(2), /Sesi/);
        await assert.rejects(
          () =>
            f.as(0, (tx) =>
              tx.query("select public.profile_command($1,$2::jsonb)", [
                "read",
                "{}",
              ]),
            ),
          /permission denied/,
        );
        const policies = (
          await f.db.query<{ n: number }>(
            "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('profile_details','profile_audit') and c.relrowsecurity",
          )
        ).rows[0].n;
        assert.equal(policies, 2);
      },
    );
  } finally {
    await f.db.close();
  }
});
