import { selectedMembership } from "@/lib/development/school";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";
import { requireAccount } from "@/lib/auth/page-context";
export const dynamic = "force-dynamic";
export default async function Workspace() {
  const { client, profile } = await requireAccount(true);
  const { data: memberships } = await client
    .from("school_memberships")
    .select("school_id,membership_roles(role_code)")
    .eq("user_id", profile.id)
    .eq("status", "active");
  const current = await selectedMembership(memberships ?? []);
  const roles = [
    ...new Set(
      (current?.membership_roles ?? []).map(
        (r: { role_code: string }) => r.role_code,
      ),
    ),
  ];
  return (
    <WorkspaceDashboard
      name={profile.full_name}
      roles={roles}
      school={current?.school_id}
    />
  );
}
