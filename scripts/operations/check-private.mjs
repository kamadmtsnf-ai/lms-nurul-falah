// Operator-only optional readiness probe. Never imported by a browser bundle.
import { createClient } from "@supabase/supabase-js";
if (!process.env.SUPABASE_SECRET_KEY) {
  console.error("BLOCKED: kredensial pemeriksaan privat belum diatur.");
  process.exitCode = 2;
} else {
  const client = createClient(
    "https://slppnagegknxsjhfqthm.supabase.co",
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    },
  );
  try {
    const { data, error } = await client.rpc("foundation_status");
    if (error || data !== "202610170001") throw new Error();
    for (const id of ["lms-private", "profile-photos"]) {
      const r = await client.storage.getBucket(id);
      if (r.error || !r.data || r.data.public) throw new Error();
    }
    console.log(
      JSON.stringify({
        database: "reachable",
        private_buckets: 2,
        smtp: "not_checked",
        at: new Date().toISOString(),
      }),
    );
  } catch {
    console.error(
      "FAIL: kesiapan database atau bucket privat belum lolos. Detail rahasia tidak dicetak.",
    );
    process.exitCode = 1;
  }
}
