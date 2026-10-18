export type ManagedUser = {
  id: string;
  username_normalized: string;
  full_name: string;
  contact_email: string | null;
  email_verified_at: string | null;
  must_change_password: boolean;
  status: string;
  roles: string[] | null;
};
export type UserListOptions = {
  account: "all" | "active" | "disabled";
  activation: "all" | "password" | "email" | "verified";
  sort: "asc" | "desc";
  search: string;
};
export function userActivation(
  user: Pick<ManagedUser, "must_change_password" | "email_verified_at">,
) {
  return user.must_change_password
    ? "password"
    : user.email_verified_at
      ? "verified"
      : "email";
}
const rank = (c: string) => (/[a-z]/.test(c) ? 0 : /[0-9]/.test(c) ? 1 : 2);
/** Letter priority is invariant in both directions. Numeric runs never use Number,
 * so long numeric usernames cannot lose precision. */
export function compareUsernames(
  left: string,
  right: string,
  direction: "asc" | "desc" = "asc",
) {
  const a = left.toLowerCase(),
    b = right.toLowerCase(),
    sign = direction === "asc" ? 1 : -1;
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i],
      y = b[j],
      group = rank(x) - rank(y);
    if (group) return group;
    if (rank(x) === 1) {
      let endA = i,
        endB = j;
      while (endA < a.length && /\d/.test(a[endA])) endA++;
      while (endB < b.length && /\d/.test(b[endB])) endB++;
      const n = a.slice(i, endA).replace(/^0+/, "") || "0",
        m = b.slice(j, endB).replace(/^0+/, "") || "0";
      const diff = n.length - m.length || (n < m ? -1 : n > m ? 1 : 0);
      if (diff) return diff * sign;
      i = endA;
      j = endB;
    } else {
      if (x !== y) return (x < y ? -1 : 1) * sign;
      i++;
      j++;
    }
  }
  const remaining = a.length - i - (b.length - j);
  if (remaining) return remaining * sign;
  return (a < b ? -1 : a > b ? 1 : 0) * sign;
}
export function filterUsers(users: ManagedUser[], options: UserListOptions) {
  const query = options.search.normalize("NFKC").trim().toLowerCase();
  return users
    .filter(
      (u) =>
        (options.account === "all" || u.status === options.account) &&
        (options.activation === "all" ||
          userActivation(u) === options.activation) &&
        (!query ||
          u.username_normalized
            .normalize("NFKC")
            .toLowerCase()
            .includes(query) ||
          u.full_name.normalize("NFKC").toLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        compareUsernames(
          a.username_normalized,
          b.username_normalized,
          options.sort,
        ) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}
export class UserListLimitError extends Error {}
/** Reuse the existing school-admin/session checks on every authorized RPC page. */
export async function loadAllSchoolUsers(
  loadPage: (offset: number) => Promise<ManagedUser[]>,
  maximum = 2000,
) {
  const users = new Map<string, ManagedUser>();
  for (let offset = 0; offset <= maximum; offset += 50) {
    const page = await loadPage(offset);
    for (const user of page) users.set(user.id, user);
    if (users.size > maximum)
      throw new UserListLimitError(
        `Daftar melebihi ${maximum} pengguna. Hubungi operator untuk penyesuaian kapasitas daftar.`,
      );
    if (page.length < 50) return [...users.values()];
  }
  throw new UserListLimitError(
    "Daftar belum dapat dimuat lengkap. Muat ulang atau hubungi operator.",
  );
}
