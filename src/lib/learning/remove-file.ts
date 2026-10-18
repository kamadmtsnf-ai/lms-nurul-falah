export type TeachingFile = {
  id: string;
  school_id: string;
  teaching_class_id: string;
  target_id: string;
  target_type: string;
  object_path: string;
  status: string;
};
export class FileRemovalError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export type FileRemovalPorts = {
  context: () => Promise<{
    manager: boolean;
    writable: boolean;
    school: string;
  }>;
  find: () => Promise<TeachingFile | null>;
  targetExists: (file: TeachingFile) => Promise<boolean>;
  auditRequest: (file: TeachingFile) => Promise<void>;
  markRemoved: (file: TeachingFile) => Promise<void>;
  removeObject: (path: string) => Promise<void>;
};
/** Server orchestration: authorize through the existing checked course RPC,
 * close download access, then remove the blob. Keep metadata for safe retries. */
export async function removeTeachingFile(
  course: string,
  id: string,
  ports: FileRemovalPorts,
) {
  const context = await ports.context();
  if (!context.manager || !context.writable)
    throw new FileRemovalError(
      "Hanya pengampu atau admin pada semester aktif dapat menghapus lampiran.",
      403,
    );
  const file = await ports.find();
  if (
    !file ||
    file.id !== id ||
    file.teaching_class_id !== course ||
    file.school_id !== context.school ||
    !["material", "assignment"].includes(file.target_type) ||
    file.object_path !== `${context.school}/${course}/${id}` ||
    !(await ports.targetExists(file))
  )
    throw new FileRemovalError(
      "Lampiran materi atau tugas tidak ditemukan.",
      403,
    );
  if (!["ready", "removed"].includes(file.status))
    throw new FileRemovalError(
      "Unggahan belum selesai. Muat ulang sebelum menghapus lampiran.",
      409,
    );
  if (file.status !== "removed") {
    await ports.auditRequest(file);
    await ports.markRemoved(file);
  }
  await ports.removeObject(file.object_path);
}
