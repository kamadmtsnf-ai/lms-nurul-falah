import { AppShell } from "@/components/app-shell";
import { ProfileWorkspace } from "@/components/profile-workspace";
import { requireAccount } from "@/lib/auth/page-context";
import { selectedMembership } from "@/lib/development/school";
import { readProfile } from "@/lib/profile/server";
export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const ctx = await requireAccount(true);
  const { data } = await ctx.client
    .from("school_memberships")
    .select("school_id,membership_roles(role_code)")
    .eq("user_id", ctx.actor)
    .eq("status", "active");
  const membership = await selectedMembership(data ?? []);
  const profile = await readProfile(ctx, membership?.school_id);
  return (
    <AppShell>
      <ProfileWorkspace initial={profile} />
    </AppShell>
  );
}
