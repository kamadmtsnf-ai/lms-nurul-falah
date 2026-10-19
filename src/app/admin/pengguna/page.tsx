import { PageHeading } from "@/components/page-heading";
import { AppShell } from "@/components/app-shell";
import { selectedMembership } from "@/lib/development/school";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/page-context";
import { UserManager } from "@/components/user-manager";
export const dynamic = "force-dynamic";
export default async function ManageUsers() {
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
        title="Manajemen pengguna"
        description="Kelola akun, aktivasi, dan hak akses warga madrasah."
      />
      <p className="mb-6">
        <Link
          href="/admin/akademik"
          className="text-sm font-semibold text-emerald-800 underline"
        >
          Buka pusat akademik untuk template dan impor Excel →
        </Link>
      </p>
      <UserManager key={membership.school_id} school={membership.school_id} actorId={profile.id} />
    </AppShell>
  );
}
