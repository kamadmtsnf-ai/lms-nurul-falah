export function probe(
  fetcher?: typeof fetch,
): Promise<{
  checked_at: string;
  liveness: string;
  anonymous_access: string;
  csrf: string;
  elapsed_ms: number;
  database_storage_smtp_readiness: string;
}>;
