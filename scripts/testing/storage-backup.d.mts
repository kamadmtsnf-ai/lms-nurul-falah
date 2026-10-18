export type StorageAdapter = {
  list: (
    prefix: string,
    offset: number,
    limit: number,
  ) => Promise<
    { id: string | null; name: string; metadata?: { mimetype?: string } }[]
  >;
  download: (path: string) => Promise<Blob>;
};
export function safeObjectPath(path: string): string;
export function backupStorage(
  adapter: StorageAdapter,
  destination: string,
  key: Buffer,
  bucket?: "lms-private" | "profile-photos",
): Promise<{ directory: string; objects: number }>;
export function restoreStorageLocal(
  indexFile: string,
  destination: string,
  key: Buffer,
): Promise<{ objects: number }>;
