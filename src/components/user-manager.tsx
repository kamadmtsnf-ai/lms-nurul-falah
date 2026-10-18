"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { roleLabels, schoolRoles } from "@/lib/auth/validation";
type User = {
  id: string;
  username_normalized: string;
  full_name: string;
  contact_email: string | null;
  email_verified_at: string | null;
  must_change_password: boolean;
  status: string;
  roles: string[];
};
const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-3";
export function UserManager({ school }: { school: string }) {
  const readId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const request = useCallback(
    async (action: string, body: Record<string, unknown>) => {
      const response = await fetch(`/api/identitas/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      return data;
    },
    [school],
  );
  const reload = useCallback(async () => {
    const id = ++readId.current;
    setLoading(true);
    try {
      const data = await request("admin-list", { offset });
      if (id === readId.current) setUsers(data.users);
    } catch (e) {
      if (id === readId.current)
        setMessage(e instanceof Error ? e.message : "Gagal memuat pengguna.");
    } finally {
      if (id === readId.current) setLoading(false);
    }
  }, [request, offset]);
  useEffect(() => {
    void reload();
    return () => {
      readId.current++;
    };
  }, [reload]);
  async function save(form: HTMLFormElement, action: string, target?: string) {
    setBusy(true);
    setMessage("");
    const data = new FormData(form);
    try {
      const body: Record<string, unknown> = {
        roles: data.getAll("roles").map(String),
      };
      if (target) {
        body.target = target;
        body.status = String(data.get("status"));
      } else {
        body.name = String(data.get("name"));
        body.username = String(data.get("username"));
        body.email = String(data.get("email"));
      }
      const result = await request(action, body);
      setMessage(result.message);
      if (!target) form.reset();
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Permintaan belum berhasil.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Tambah pengguna</h2>
        <p className="mt-2 text-sm text-stone-600">
          Akun baru memakai password awal yang disepakati madrasah dan wajib
          menjalani aktivasi. Email dapat dipakai bersama oleh beberapa anak.
        </p>
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget, "admin-create");
          }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm">
              Nama lengkap
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              Username
              <input
                name="username"
                required
                minLength={3}
                maxLength={50}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block text-sm">
            Email (opsional)
            <input
              name="email"
              type="email"
              maxLength={254}
              className={inputClass}
            />
          </label>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">
              Peran pengguna
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {schoolRoles.map((role) => (
                <label className="flex gap-2 text-sm" key={role}>
                  <input type="checkbox" name="roles" value={role} />
                  {roleLabels[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <Button disabled={busy || loading} type="submit">
            {busy ? "Memproses…" : "Buat akun"}
          </Button>
        </form>
      </section>
      <p role="status" className="text-sm text-emerald-900">
        {message}
      </p>
      <section>
        <h2 className="mb-5 text-xl font-semibold">Daftar pengguna</h2>
        <div aria-busy={loading} className="space-y-4">
          {loading && (
            <p role="status" className="text-sm text-stone-500">
              Memuat pengguna…
            </p>
          )}
          {users.map((u) => (
            <form
              key={`${u.id}:${u.status}:${(u.roles ?? []).join(",")}`}
              className="rounded-2xl border border-stone-200 bg-white p-6"
              onSubmit={(e) => {
                e.preventDefault();
                void save(e.currentTarget, "admin-update", u.id);
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{u.full_name}</h3>
                  <p className="mt-1 text-sm text-stone-500">
                    {u.username_normalized} ·{" "}
                    {u.must_change_password
                      ? "Wajib ganti password"
                      : u.email_verified_at
                        ? "Aktif terverifikasi"
                        : "Menunggu verifikasi email"}
                  </p>
                </div>
                <label className="text-sm">
                  Status{" "}
                  <select
                    aria-label={`Status ${u.full_name}`}
                    name="status"
                    defaultValue={u.status}
                    className="rounded-lg border p-2"
                  >
                    <option value="active">Aktif</option>
                    <option value="disabled">Nonaktif</option>
                  </select>
                </label>
              </div>
              <fieldset className="mt-5">
                <legend className="sr-only">Peran {u.full_name}</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {schoolRoles.map((role) => (
                    <label
                      key={`${u.id}:${role}`}
                      className="flex gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="roles"
                        value={role}
                        defaultChecked={u.roles?.includes(role)}
                      />
                      {roleLabels[role]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button
                disabled={busy || loading}
                type="submit"
                variant="outline"
                className="mt-5"
              >
                Simpan hak akses
              </Button>
            </form>
          ))}
        </div>
        {!loading && !users.length && (
          <p className="text-sm text-stone-500">
            Belum ada data pada halaman ini.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            disabled={offset === 0 || busy || loading}
            onClick={() => setOffset((v) => Math.max(0, v - 50))}
          >
            Sebelumnya
          </Button>
          <span className="text-sm">Halaman {offset / 50 + 1}</span>
          <Button
            variant="outline"
            disabled={users.length < 50 || busy || loading}
            onClick={() => setOffset((v) => v + 50)}
          >
            Berikutnya
          </Button>
        </div>
      </section>
    </div>
  );
}
