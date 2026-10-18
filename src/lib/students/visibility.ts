/** Generic ids (courses, questions, files, teachers) are never student ids. */
const collections = new Set([
  "roster",
  "rows",
  "students",
  "children",
  "members",
]);
type Row = Record<string, unknown>;
function record(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function reference(value: unknown, collection: string): string | undefined {
  if (typeof value === "string" && collection === "children") return value;
  if (!record(value)) return;
  if (typeof value.student_id === "string") return value.student_id;
  if (
    typeof value.id === "string" &&
    (collections.has(collection) ||
      (collection === "users" &&
        Array.isArray(value.roles) &&
        value.roles.includes("student")))
  )
    return value.id;
}
export function studentIdsInLists(payload: unknown): string[] {
  const ids = new Set<string>();
  function walk(value: unknown, key = "") {
    if (Array.isArray(value)) {
      for (const row of value) {
        const id = reference(row, key);
        if (id) ids.add(id);
        walk(row, key);
      }
    } else if (record(value)) {
      for (const [name, child] of Object.entries(value)) walk(child, name);
    }
  }
  walk(payload);
  return [...ids];
}
/** Copy the response, retaining pagination and business data; never delete history. */
export function visibleStudentLists<T>(
  payload: T,
  active: ReadonlySet<string>,
): T {
  function walk(value: unknown, key = ""): unknown {
    if (Array.isArray(value))
      return value
        .filter((row) => {
          const id = reference(row, key);
          return !id || active.has(id);
        })
        .map((row) => walk(row, key));
    if (record(value))
      return Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, walk(child, name)]),
      );
    return value;
  }
  return walk(payload) as T;
}
export async function filterStudentLists<T>(
  payload: T,
  loadActive: (ids: string[]) => Promise<string[]>,
): Promise<T> {
  const ids = studentIdsInLists(payload);
  if (!ids.length) return payload;
  const active = new Set<string>();
  // Bound URL sizes and avoid the Data API row limit silently omitting students.
  for (let offset = 0; offset < ids.length; offset += 150)
    for (const id of await loadActive(ids.slice(offset, offset + 150)))
      active.add(id);
  return visibleStudentLists(payload, active);
}
