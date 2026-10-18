"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { roleLabels, schoolRoles } from "@/lib/auth/validation";
import {
  filterUsers,
  userActivation,
  type ManagedUser,
  type UserListOptions,
} from "@/lib/auth/user-list";
import { postJson } from "@/lib/http/client";
const inputClass =
  "form-control w-full rounded-xl border border-stone-300 bg-white px-4 py-3";
export function UserManager({ school }: { school: string }) {
  const readId = useRef(0),
    toggleRef = useRef<HTMLButtonElement>(null),
    returnFocus = useRef(false);
  const [showCreate, setShowCreate] = useState(false),
    [error, setError] = useState(false);
  const [options, setOptions] = useState<UserListOptions>({
    account: "all",
    activation: "all",
    sort: "asc",
    search: "",
  });
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const request = useCallback(
    async (action: string, body: Record<string, unknown>) => {
      return postJson<{ users: ManagedUser[]; message: string }>(
        `/api/identitas/${action}`,
        { school, ...body },
      );
    },
    [school],
  );
  const reload = useCallback(async () => {
    const id = ++readId.current;
    setLoading(true);
    try {
      const data = await request("admin-list", { all: true });
      if (id === readId.current) {
        setUsers(data.users);
        setError(false);
      }
    } catch (e) {
      if (id === readId.current) {
        setError(true);
        setMessage(e instanceof Error ? e.message : "Gagal memuat pengguna.");
      }
    } finally {
      if (id === readId.current) setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    setUsers([]);
    setOffset(0);
    setShowCreate(false);
    void reload();
    return () => {
      readId.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (returnFocus.current && !busy && !loading) {
      returnFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [busy, loading]);
  async function save(form: HTMLFormElement, action: string, target?: string) {
    setBusy(true);
    setMessage("");
    setError(false);
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
      if (!target) {
        form.reset();
        setShowCreate(false);
        returnFocus.current = true;
      }
      await reload();
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Permintaan belum berhasil.");
    } finally {
      setBusy(false);
    }
  }
  const filtered = useMemo(() => filterUsers(users, options), [users, options]);
  const pageOffset = Math.min(
    offset,
    Math.max(0, Math.ceil(filtered.length / 50) - 1) * 50,
  );
  const visible = filtered.slice(pageOffset, pageOffset + 50);
  function change(next: Partial<UserListOptions>) {
    setOptions((v) => ({ ...v, ...next }));
    setOffset(0);
  }
  return (
    <div className="space-y-8">
      <section className="surface-card rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Tambah pengguna</h2>
          <Button
            ref={toggleRef}
            type="button"
            variant={showCreate ? "outline" : "default"}
            disabled={busy || loading}
            aria-expanded={showCreate}
            aria-controls="create-user-form"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Tutup form" : "Tambah pengguna"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Akun baru memakai password awal yang disepakati madrasah dan wajib
          menjalani aktivasi. Email dapat dipakai bersama oleh beberapa anak.
        </p>
        <div id="create-user-form" hidden={!showCreate}>
          <form
            method="post"
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
        </div>
      </section>
      <p
        role={error ? "alert" : "status"}
        className={`text-sm ${error ? "text-red-800" : "text-emerald-900"}`}
      >
        {message}
      </p>
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Daftar pengguna</h2>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              setMessage("");
              void reload();
            }}
          >
            Muat ulang pengguna
          </Button>
        </div>
        <div className="mb-5 grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">
            Cari username atau nama
            <input
              aria-label="Cari username atau nama"
              type="search"
              maxLength={100}
              value={options.search}
              onChange={(e) => change({ search: e.target.value })}
              placeholder="Ketik username atau nama…"
              className={inputClass + " mt-2"}
            />
          </label>
          <label className="text-sm font-medium">
            Status akun
            <select
              aria-label="Filter status akun"
              value={options.account}
              onChange={(e) =>
                change({
                  account: e.target.value as UserListOptions["account"],
                })
              }
              className={inputClass + " mt-2"}
            >
              <option value="all">Semua status akun</option>
              <option value="active">Aktif</option>
              <option value="disabled">Nonaktif</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Status pengguna
            <select
              aria-label="Filter status pengguna"
              value={options.activation}
              onChange={(e) =>
                change({
                  activation: e.target.value as UserListOptions["activation"],
                })
              }
              className={inputClass + " mt-2"}
            >
              <option value="all">Semua status pengguna</option>
              <option value="password">Wajib ganti password</option>
              <option value="email">Menunggu verifikasi email</option>
              <option value="verified">Akun terverifikasi</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Urutkan username
            <select
              aria-label="Urutkan username"
              value={options.sort}
              onChange={(e) =>
                change({ sort: e.target.value as UserListOptions["sort"] })
              }
              className={inputClass + " mt-2"}
            >
              <option value="asc">A–Z / 0–9</option>
              <option value="desc">Z–A / 9–0</option>
            </select>
          </label>
          <p className="text-xs leading-5 text-stone-500 sm:col-span-2 xl:col-span-3">
            Huruf didahulukan pada kedua arah. Angka diurutkan secara natural,
            misalnya guru2 sebelum guru10 pada urutan naik. Simpan perubahan hak
            akses per pengguna sebelum berpindah filter.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setOptions({
                account: "all",
                activation: "all",
                sort: "asc",
                search: "",
              });
              setOffset(0);
            }}
          >
            Reset filter
          </Button>
        </div>
        {!loading && (
          <p role="status" className="mb-4 text-sm text-stone-500">
            {filtered.length ? pageOffset + 1 : 0}–{pageOffset + visible.length}{" "}
            dari {filtered.length} pengguna cocok · {users.length} pengguna
            sekolah
          </p>
        )}
        <div aria-busy={loading} className="space-y-4">
          {loading && (
            <p role="status" className="text-sm text-stone-500">
              Memuat pengguna…
            </p>
          )}
          {!loading &&
            visible.map((u) => (
              <form
                method="post"
                key={`${u.id}:${u.status}:${(u.roles ?? []).join(",")}`}
                className="surface-card rounded-2xl border border-stone-200 bg-white p-6"
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
                      {
                        {
                          password: "Wajib ganti password",
                          email: "Menunggu verifikasi email",
                          verified: "Akun terverifikasi",
                        }[userActivation(u)]
                      }
                    </p>
                  </div>
                  <label className="text-sm">
                    Status{" "}
                    <select
                      aria-label={`Status ${u.full_name}`}
                      disabled={busy || loading}
                      name="status"
                      defaultValue={u.status}
                      className="rounded-lg border p-2"
                    >
                      <option value="active">Aktif</option>
                      <option value="disabled">Nonaktif</option>
                    </select>
                  </label>
                </div>
                <fieldset className="mt-5" disabled={busy || loading}>
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
        {!loading && !filtered.length && (
          <p className="text-sm text-stone-500">
            Tidak ada pengguna yang cocok. Ubah pencarian atau reset filter.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            disabled={pageOffset === 0 || busy || loading}
            onClick={() => setOffset(Math.max(0, pageOffset - 50))}
          >
            Sebelumnya
          </Button>
          <span className="text-sm">Halaman {pageOffset / 50 + 1}</span>
          <Button
            variant="outline"
            disabled={pageOffset + 50 >= filtered.length || busy || loading}
            onClick={() => setOffset(pageOffset + 50)}
          >
            Berikutnya
          </Button>
        </div>
      </section>
    </div>
  );
}
