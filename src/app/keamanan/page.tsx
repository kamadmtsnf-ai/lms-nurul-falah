import { AppShell } from "@/components/app-shell";
import { SecurityWorkspace } from "@/components/security-workspace";
import { requireAccount } from "@/lib/auth/page-context";
export const dynamic = "force-dynamic";
export default async function SecurityPage() {
  const ctx = await requireAccount(true);
  const { data } = await ctx.client
    .from("school_memberships")
    .select("membership_roles(role_code)")
    .eq("user_id", ctx.actor)
    .eq("status", "active");
  const admin = !!data?.some((m) =>
    m.membership_roles.some((r) => r.role_code === "admin"),
  );
  return (
    <AppShell>
      <SecurityWorkspace admin={admin} />
    </AppShell>
  );
}
