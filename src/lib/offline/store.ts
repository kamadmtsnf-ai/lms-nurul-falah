"use client";
import {
  newOfflineKey,
  seal,
  open,
  type OfflineRecord,
  type SealedRecord,
} from "./crypto";
const DB = "lms-offline-v1",
  OWNER = "lms-offline-owner",
  KEY = "lms-offline-key",
  VAULT = "lms-offline-vault";
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = pending.then(fn);
  pending = result.catch(() => {});
  return result;
}
function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    let blocked = false;
    r.onupgradeneeded = () =>
      r.result.createObjectStore("records", { keyPath: "id" });
    r.onsuccess = () => {
      if (blocked) r.result.close();
      else resolve(r.result);
    };
    r.onerror = () => reject(new Error("Penyimpanan lokal tidak tersedia."));
    r.onblocked = () => {
      blocked = true;
      reject(
        new Error("Tutup tab LMS lain lalu coba penyimpanan offline kembali."),
      );
    };
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction("records", mode);
      let value: T;
      const request = fn(tx.objectStore("records"));
      request.onsuccess = () => {
        value = request.result;
      };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(new Error("Penyimpanan lokal gagal."));
      tx.onabort = () => reject(new Error("Penyimpanan lokal dibatalkan."));
    });
  } finally {
    d.close();
  }
}
async function clearInternal(broadcast = true) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(OWNER);
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(VAULT);
  } catch {}
  try {
    await transact("readwrite", (s) => s.clear());
  } catch {}
  window.dispatchEvent(new Event("lms-offline-cleared"));
  if (broadcast)
    try {
      localStorage.setItem("lms-offline-clear", crypto.randomUUID());
    } catch {}
}
export function watchOfflineClear() {
  const handler = (e: StorageEvent) => {
    if (e.key === "lms-offline-clear") void clearOffline(false);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
async function saveInternal(record: OfflineRecord) {
  if (
    !Number.isFinite(Date.parse(record.expires_at)) ||
    Date.parse(record.expires_at) <= Date.now() ||
    Date.parse(record.expires_at) > Date.now() + 31 * 60000
  )
    throw new Error("Izin offline tidak valid.");
  const current = sessionStorage.getItem(OWNER);
  if (current && current !== record.owner) await clearInternal();
  if (!sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, await newOfflineKey());
    sessionStorage.setItem(VAULT, crypto.randomUUID());
  }
  const vault = sessionStorage.getItem(VAULT)!;
  record = {
    ...record,
    id: record.id.startsWith(vault + ":") ? record.id : vault + ":" + record.id,
  };
  sessionStorage.setItem(OWNER, record.owner);
  const records = await transact<SealedRecord[]>("readonly", (s) => s.getAll());
  for (const old of records)
    if (Date.parse(old.expires_at) <= Date.now())
      await transact("readwrite", (s) => s.delete(old.id));
  const live = records.filter(
    (x) =>
      x.id.startsWith(vault + ":") && Date.parse(x.expires_at) > Date.now(),
  );
  if (live.length >= 20 && !live.some((x) => x.id === record.id))
    throw new Error(
      "Maksimal 20 materi/draf lokal. Hapus yang tidak diperlukan.",
    );
  const encrypted = await seal(record, sessionStorage.getItem(KEY)!);
  await transact("readwrite", (s) => s.put(encrypted));
}
export async function putOffline(record: OfflineRecord) {
  await saveOffline(record);
}
async function listInternal() {
  const owner = sessionStorage.getItem(OWNER),
    key = sessionStorage.getItem(KEY);
  const vault = sessionStorage.getItem(VAULT);
  if (!owner || !key || !vault) return [];
  const rows = await transact<SealedRecord[]>("readonly", (s) => s.getAll()),
    result: OfflineRecord[] = [];
  for (const row of rows.filter((row) => row.id.startsWith(vault + ":")))
    try {
      result.push(await open(row, key, owner));
    } catch {
      await transact("readwrite", (s) => s.delete(row.id));
    }
  return result;
}
async function deleteInternal(id: string) {
  const vault = sessionStorage.getItem(VAULT);
  if (!vault) return;
  id = id.startsWith(vault + ":") ? id : vault + ":" + id;
  await transact("readwrite", (s) => s.delete(id));
}

export function clearOffline(broadcast = true) {
  return serial(() => clearInternal(broadcast));
}
export function saveOffline(record: OfflineRecord) {
  return serial(() => saveInternal(record));
}
export function listOffline() {
  return serial(listInternal);
}
export function deleteOffline(id: string) {
  return serial(() => deleteInternal(id));
}
