/** Used only after the retention RPC has authorized and purged a specific student. */
export async function purgeProfilePhotos(
  user: string,
  adapter: {
    list: (prefix: string) => Promise<{ name: string; id: string | null }[]>;
    remove: (paths: string[]) => Promise<void>;
  },
) {
  if (!/^[a-f0-9-]{36}$/.test(user)) throw Error("Pemilik foto tidak valid.");
  let count = 0;
  for (let page = 0; page < 10; page++) {
    const files = await adapter.list(user);
    if (!files.length) return count;
    if (files.some((f) => !f.id || !/^[a-f0-9-]{36}\.webp$/.test(f.name)))
      throw Error("Inventaris foto profil tidak valid.");
    await adapter.remove(files.map((f) => `${user}/${f.name}`));
    count += files.length;
  }
  throw Error("Inventaris foto melebihi batas pembersihan.");
}
