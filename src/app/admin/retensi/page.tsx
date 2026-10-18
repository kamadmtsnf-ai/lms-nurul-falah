import { PageHeading } from "@/components/page-heading";
import { AppShell } from "@/components/app-shell";
import { selectedMembership } from "@/lib/development/school";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/page-context";
import { RetentionWorkspace } from "@/components/attachment-retention";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { client, profile } = await requireAccount(true);
  const { data } = await client
    .from("school_memberships")
    .select("school_id,membership_roles(role_code)")
    .eq("user_id", profile.id)
    .eq("status", "active");
  const membership = await selectedMembership(data ?? [], (m) =>
    m.membership_roles.some(
      (r: { role_code: string }) => r.role_code === "admin",
    ),
  );
  if (!membership) redirect("/ruang-belajar");
  return (
    <AppShell>
      <PageHeading
        eyebrow="Administrasi sekolah"
        title="Retensi data dan lampiran"
        description="Kelola masa simpan lampiran, antrean penghapusan, dan retensi data alumni sesuai kebijakan sekolah."
      />
      <RetentionWorkspace school={membership.school_id} />
    </AppShell>
  );
}
