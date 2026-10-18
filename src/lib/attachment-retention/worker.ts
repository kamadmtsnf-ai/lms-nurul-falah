export type Claim = { id?: string; path?: string; token?: string };
export type RetentionWorkerAdapter = {
  command: (cmd: string, p: Record<string, unknown>) => Promise<unknown>;
  remove: (path: string) => Promise<void>;
};
/** Storage failure never marks a record deleted; a lost acknowledgement leaves a recoverable lease. */
export async function processRetention(
  adapter: RetentionWorkerAdapter,
  school: string,
  options: { limit?: number; budgetMs?: number } = {},
) {
  const start = Date.now(),
    limit = Math.min(10, Math.max(1, options.limit ?? 10)),
    budget = options.budgetMs ?? 60000;
  let deleted = 0,
    failed = 0;
  await adapter.command("scan", { school });
  for (let n = 0; n < limit && Date.now() - start < budget; n++) {
    const claim = (await adapter.command("claim", { school })) as Claim;
    if (!claim.id) break;
    if (
      !claim.path ||
      !claim.token ||
      !claim.path.startsWith(school + "/") ||
      claim.path.split("/").length !== 3 ||
      claim.path.split("/")[2] !== claim.id ||
      claim.path.includes("..")
    )
      throw new Error("Referensi objek retensi tidak valid.");
    try {
      await adapter.remove(claim.path);
    } catch {
      await adapter.command("fail", { target: claim.id, token: claim.token });
      failed++;
      continue;
    }
    // Do not convert an uncertain database acknowledgement into permission to restore/reuse this object.
    await adapter.command("ack", { target: claim.id, token: claim.token });
    deleted++;
  }
  return { deleted, failed };
}
