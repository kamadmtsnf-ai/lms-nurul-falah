import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, school } from "../scripts/testing/fixture";
import {
  newOfflineKey,
  seal,
  open,
  type OfflineRecord,
} from "../src/lib/offline/crypto";
import {
  sendChannel,
  channelConfig,
  channelReadiness,
  validateChannelText,
  channelMessage,
} from "../src/lib/development/channels";
test("pengembangan: default mati, tim dibatasi sekolah, multi sekolah dan kanal", async (t) => {
  const f = await fixture(3),
    { db, actors, course, as, academic, command } = f;
  const dev = (a: number, cmd: string, p: Record<string, unknown> = {}) =>
    as(
      a,
      async (tx) =>
        (
          await tx.query<{ v: any }>(
            "select public.development_command($1,$2::jsonb) v",
            [cmd, JSON.stringify({ school, ...p })],
          )
        ).rows[0].v,
    );
  let material = "",
    task = "",
    message = "",
    school2 = "";
  try {
    await t.test(
      "semua fitur mati dan admin sekolah tidak mempunyai hak pusat",
      async () => {
        const state = await dev(0, "settings");
        assert.equal(state.features.offline_enabled, false);
        assert.equal(state.features.team_enabled, false);
        assert.equal(state.features.channels_enabled, false);
        await assert.rejects(() => dev(0, "platform-state"), /pusat/);
        await assert.rejects(
          () =>
            dev(2, "feature-save", {
              data: {
                offline_enabled: true,
                team_enabled: false,
                channels_enabled: false,
                revision: 0,
                acceptance_reference: "Uji berhasil",
              },
            }),
          /admin/,
        );
        await assert.rejects(
          () =>
            dev(0, "feature-save", {
              data: {
                offline_enabled: true,
                team_enabled: true,
                channels_enabled: true,
                revision: 0,
                acceptance_reference: "",
              },
            }),
          /validasi/,
        );
      },
    );
    await t.test(
      "tim baru tidak mendapat akses sebelum flag; akses pengampu sesudah aktif",
      async () => {
        await db.query(
          "update membership_roles set role_code='teacher' where membership_id=(select id from school_memberships where user_id=$1)",
          [actors[4].id],
        );
        await db.query("delete from student_enrollments where student_id=$1", [
          actors[4].id,
        ]);
        await dev(0, "team-save", {
          data: { course_id: course, user_id: actors[4].id, active: true },
        });
        await assert.rejects(() => command(4, "list"), /diakses/);
        await dev(0, "feature-save", {
          data: {
            offline_enabled: true,
            team_enabled: true,
            channels_enabled: true,
            revision: 0,
            acceptance_reference: "Pengujian fixture terisolasi",
          },
        });
        assert.equal((await command(4, "list")).context.manager, true);
        await as(4, async (tx) => {
          assert.equal(
            (await tx.query("select id from classrooms")).rows.length,
            1,
          );
          assert.equal(
            (await tx.query("select id from teaching_classes")).rows.length,
            1,
          );
        });
      },
    );
    const learning = (
      a: number,
      cmd: string,
      p: Record<string, unknown> = {},
    ) =>
      as(
        a,
        async (tx) =>
          (
            await tx.query<{ v: any }>(
              "select public.learning_command($1,$2::jsonb) v",
              [cmd, JSON.stringify({ course, ...p })],
            )
          ).rows[0].v,
      );
    await t.test(
      "materi offline diterbitkan saja, draf individu dan pengampu tambahan dapat membuat materi",
      async () => {
        const past = new Date(Date.now() - 60000).toISOString(),
          future = new Date(Date.now() + 3600000).toISOString();
        const mid = (
          await learning(4, "meeting-save", {
            data: { title: "Tim pengajar", starts_at: past },
          })
        ).id;
        material = (
          await learning(4, "material-save", {
            data: {
              title: "Materi offline",
              meeting_id: mid,
              body: "Isi materi",
              links: [],
              status: "draft",
              publish_at: null,
            },
          })
        ).id;
        await assert.rejects(
          () => dev(2, "offline-material", { course, target: material }),
          /terkunci/,
        );
        const mat = (await learning(4, "course")).materials[0];
        await learning(4, "material-save", {
          target: material,
          data: {
            ...mat,
            status: "published",
            expected_updated_at: mat.updated_at,
          },
        });
        const ticket = await dev(2, "offline-material", {
          course,
          target: material,
        });
        assert.equal(ticket.owner, actors[2].id);
        assert.equal(ticket.content.body, "Isi materi");
        assert.ok(Date.parse(ticket.expires_at) - Date.now() <= 1801000);
        assert.equal(JSON.stringify(ticket).includes("session_id"), false);
        task = (
          await learning(4, "assignment-save", {
            data: {
              title: "Draf individu",
              instructions: "Uji",
              formats: ["text"],
              due_at: future,
              accept_late: false,
              max_score: 100,
              status: "published",
              publish_at: null,
            },
          })
        ).id;
        assert.equal(
          (await dev(2, "offline-draft-context", { course, target: task }))
            .content.revision,
          0,
        );
        await dev(0, "team-save", {
          data: { course_id: course, user_id: actors[4].id, active: false },
        });
        await assert.rejects(() => learning(4, "course"), /diakses/);
      },
    );
    await t.test(
      "pusat membuat sekolah setelah kebijakan; sekolah lain terisolasi",
      async () => {
        await as(0, (tx) =>
          assert.rejects(
            () =>
              tx.query("select public.platform_admin_provision($1,$2)", [
                "admin",
                "grant-platform-administration",
              ]),
            /permission denied/,
          ),
        );
        await db.query("select public.platform_admin_provision($1,$2)", [
          "admin",
          "grant-platform-administration",
        ]);
        await assert.rejects(
          () =>
            dev(0, "platform-create", {
              data: {
                name: "Madrasah Kedua",
                admin_username: "admin",
                education_level: "MTs/SMP",
              },
            }),
          /diaktifkan/,
        );
        await dev(0, "platform-enable", {
          data: {
            enabled: true,
            acceptance_reference: "Validasi isolasi fixture",
          },
        });
        school2 = (
          await dev(0, "platform-create", {
            data: {
              name: "Madrasah Kedua",
              admin_username: "admin",
              education_level: "MTs/SMP",
            },
          })
        ).school;
        assert.ok(school2);
        await assert.rejects(
          () => dev(1, "settings", { school: school2 }),
          /diakses/,
        );
        await assert.rejects(
          () =>
            dev(0, "team-save", {
              school: school2,
              data: { course_id: course, user_id: actors[1].id, active: true },
            }),
          /sekolah/,
        );
        await dev(0, "platform-link", {
          school: school2,
          data: { username: actors[2].name, role: "student" },
        });
        assert.equal((await dev(2, "schools")).schools.length, 2);
        assert.equal((await dev(0, "platform-state")).schools.length, 2);
      },
    );
    await t.test(
      "kontak disetujui, antrean idempotent, klaim privat dan pengaturan sekolah lain tidak diwariskan",
      async () => {
        assert.equal(
          (await dev(0, "settings", { school: school2 })).features
            .channels_enabled,
          false,
        );
        await assert.rejects(
          () =>
            dev(2, "contact-save", {
              data: {
                user_id: actors[2].id,
                channel: "telegram",
                destination: "12345",
                consent_reference: "persetujuan",
                verified: true,
                active: true,
              },
            }),
          /admin/,
        );
        await dev(0, "contact-save", {
          data: {
            user_id: actors[2].id,
            channel: "telegram",
            destination: "12345",
            consent_reference: "Persetujuan fixture",
            verified: true,
            active: true,
          },
        });
        message = await as(
          1,
          async (tx) =>
            (
              await tx.query<{ v: any }>(
                "select public.advanced_command($1,$2::jsonb) v",
                [
                  "message-create",
                  JSON.stringify({
                    course,
                    data: {
                      subject: "Kegiatan uji",
                      body: "Uji tanpa kirim",
                      email: false,
                    },
                  }),
                ],
              )
            ).rows[0].v.id,
        );
        await dev(1, "channel-queue", {
          course,
          target: message,
          data: { channel: "telegram" },
        });
        await dev(1, "channel-queue", {
          course,
          target: message,
          data: { channel: "telegram" },
        });
        assert.equal((await dev(1, "channel-state", { course }))[0].total, 1);
        await as(1, (tx) =>
          assert.rejects(
            () =>
              tx.query("select public.channel_claim($1,$2,$3,$4)", [
                message,
                course,
                actors[1].id,
                "telegram",
              ]),
            /permission denied/,
          ),
        );
        const jobs = (
          await db.query<any>("select public.channel_claim($1,$2,$3,$4) v", [
            message,
            course,
            actors[1].id,
            "telegram",
          ])
        ).rows[0].v;
        assert.equal(jobs.length, 1);
        assert.equal(
          (
            await db.query<any>("select public.channel_claim($1,$2,$3,$4) v", [
              message,
              course,
              actors[1].id,
              "telegram",
            ])
          ).rows[0].v.length,
          0,
        );
        await db.query("select public.channel_ack($1,$2,$3,$4)", [
          message,
          actors[2].id,
          "telegram",
          "accepted",
        ]);
        assert.equal(
          (await dev(1, "channel-state", { course }))[0].accepted,
          1,
        );
      },
    );
    await t.test(
      "mematikan fitur menghentikan tiket offline dan tim, sesi belum aktivasi ditolak",
      async () => {
        await dev(0, "feature-save", {
          data: {
            offline_enabled: false,
            team_enabled: false,
            channels_enabled: false,
            revision: 1,
            acceptance_reference: "",
          },
        });
        await assert.rejects(
          () => dev(2, "offline-material", { course, target: material }),
          /belum diaktifkan/,
        );
        await assert.rejects(
          () => dev(1, "channel-check", { course, target: message }),
          /belum diaktifkan/,
        );
        await db.query(
          "update profiles set must_change_password=true where id=$1",
          [actors[2].id],
        );
        await assert.rejects(() => dev(2, "schools"), /aktivasi/);
      },
    );
  } finally {
    await db.close();
  }
});
test("offline: enkripsi, isolasi akun, kedaluwarsa dan manipulasi metadata ditolak", async () => {
  const key = await newOfflineKey(),
    other = await newOfflineKey();
  const row: OfflineRecord = {
    id: "m",
    owner: "a",
    school: "school-a",
    course: "course",
    kind: "material",
    expires_at: new Date(Date.now() + 60000).toISOString(),
    content: { body: "Materi privat 🕌" },
  };
  const encrypted = await seal(row, key);
  assert.equal(JSON.stringify(encrypted).includes("Materi privat"), false);
  assert.equal(
    (await open(encrypted, key, "a")).content.body,
    row.content.body,
  );
  await assert.rejects(() => open(encrypted, key, "b"), /akun berbeda/);
  await assert.rejects(
    () => open(encrypted, key, "a", Date.now() + 120000),
    /berakhir/,
  );
  await assert.rejects(() => open({ ...encrypted, school: "other" }, key, "a"));
  await assert.rejects(() => open(encrypted, other, "a"));
});
test("kanal: payload resmi, token tetap server, error ambigu tidak dianggap terkirim", async () => {
  const id = randomUUID();
  const source = {
    LMS_CHANNEL_CONFIG_JSON: JSON.stringify({
      [id]: {
        telegram: { token: "123:fake_token" },
        whatsapp: {
          token: "fake_access_token",
          phone_id: "1234",
          version: "v25.0",
          template: "kegiatan_lms",
          language: "id",
        },
      },
    }),
  };
  const calls: { url: string; options: RequestInit }[] = [];
  const mock: typeof fetch = async (input, options) => {
    calls.push({ url: String(input), options: options! });
    return Response.json(
      String(input).includes("telegram")
        ? { ok: true, result: { message_id: 1 } }
        : { messages: [{ id: "wamid.test" }] },
    );
  };
  await sendChannel(id, "telegram", "12345", "Kegiatan", mock, source);
  await sendChannel(id, "whatsapp", "628123456789", "Kegiatan", mock, source);
  assert.equal(JSON.parse(String(calls[0].options.body)).chat_id, "12345");
  assert.equal(
    JSON.parse(String(calls[1].options.body)).template.components[0]
      .parameters[0].text,
    "Kegiatan",
  );
  assert.throws(
    () => channelConfig(randomUUID(), "telegram", source),
    /belum dikonfigurasi/,
  );
  await assert.rejects(
    () =>
      sendChannel(
        id,
        "telegram",
        "12345",
        "Uji",
        async () => {
          throw new Error("URL contains secret");
        },
        source,
      ),
    (e) =>
      e instanceof Error &&
      !e.message.includes("secret") &&
      e.message.includes("tidak pasti"),
  );
  await assert.rejects(
    () =>
      sendChannel(
        id,
        "whatsapp",
        "628123456789",
        "x".repeat(1025),
        mock,
        source,
      ),
    /maksimal/,
  );
});

test("channel readiness hides credentials; oversized payloads never reach provider", async () => {
  const id = randomUUID(),
    source = {
      SUPABASE_SECRET_KEY: "server-secret",
      LMS_CHANNEL_CONFIG_JSON: JSON.stringify({
        [id]: { telegram: { token: "123:fake_token" } },
      }),
    };
  assert.equal(channelReadiness(id, source).telegram.ready, true);
  assert.equal(
    channelReadiness(id, {
      ...source,
      LMS_CHANNEL_CONFIG_JSON: JSON.stringify({
        [id]: {
          telegram: { token: "123:fake_token" },
          whatsapp: { invalid: true },
        },
      }),
    }).telegram.ready,
    true,
  );
  assert.equal(channelReadiness(id, source).whatsapp.ready, false);
  assert.equal(
    JSON.stringify(channelReadiness(id, source)).includes("fake_token"),
    false,
  );
  assert.equal(
    channelReadiness(id, { ...source, SUPABASE_SECRET_KEY: "" }).telegram.ready,
    false,
  );
  let called = false;
  await assert.rejects(
    () =>
      sendChannel(
        id,
        "telegram",
        "12345",
        "x".repeat(4097),
        async () => {
          called = true;
          return Response.json({ ok: true });
        },
        source,
      ),
    /maksimal/,
  );
  assert.equal(called, false);
  assert.throws(
    () => validateChannelText("whatsapp", "x".repeat(1025)),
    /1024/,
  );
  await assert.rejects(
    () =>
      sendChannel(
        id,
        "telegram",
        "12345",
        "Valid",
        async () => Response.json({ ok: true }),
        source,
      ),
    /tidak pasti/,
  );
});

test("channel notifications fit provider limits without splitting Unicode and link to full LMS message", () => {
  const course = randomUUID();
  for (const kind of ["whatsapp", "telegram"] as const) {
    const text = channelMessage(kind, "Pengumuman", "🕌".repeat(3000), course);
    validateChannelText(kind, text);
    assert.ok(text.endsWith("/pembelajaran/" + course));
    assert.equal(text.isWellFormed(), true);
    assert.ok(text.includes("…"));
  }
  assert.throws(
    () => channelMessage("telegram", "Judul", "Isi", "https://evil.test"),
    /Kelas/,
  );
});
