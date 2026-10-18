import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IdentityError } from "@/lib/auth/identity";
import { processRetention } from "./worker";
export function retentionAdapter() {
  const client = createSupabaseAdminClient(10000);
  return {
    command: async (cmd: string, p: Record<string, unknown>) => {
      const { data, error } = await client.rpc("attachment_retention_worker", {
        cmd,
        p,
      });
      if (error)
        throw new IdentityError("Pekerjaan retensi belum dapat diproses.", 503);
      return data;
    },
    remove: async (path: string) => {
      const { error } = await client.storage.from("lms-private").remove([path]);
      if (error) throw new Error("Storage removal failed");
    },
  };
}
export const runRetention = (school: string) =>
  processRetention(retentionAdapter(), school);
