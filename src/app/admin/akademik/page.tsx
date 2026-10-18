import { PageHeading } from "@/components/page-heading";
import { AppShell } from "@/components/app-shell";
import { selectedMembership } from "@/lib/development/school";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/page-context";
import { AcademicManager } from "@/components/academic-manager";
import { academicCommand } from "@/lib/academic/server";
import type { AcademicState } from "@/lib/academic/config";
export const dynamic = "force-dynamic";
export default async function AcademicAdmin() {
  const ctx = await requireAccount(true);
  const { data } = await ctx.client
    .from("school_memberships")
    .select("school_id,membership_roles(role_code)")
    .eq("user_id", ctx.actor)
    .eq("status", "active");
  const membership = await selectedMembership(data ?? [], (m) =>
    m.membership_roles.some(
      (r: { role_code: string }) => r.role_code === "admin",
    ),
  );
  if (!membership) redirect("/ruang-belajar");
  let state: AcademicState;
  try {
    state = await academicCommand<AcademicState>(ctx, "state", {
      school: membership.school_id,
    });
  } catch {
    return (
      <AppShell>
        <Link href="/ruang-belajar" className="text-emerald-800 underline">
          Kembali
        </Link>
        <h1 className="mt-8 text-2xl font-semibold">
          Data akademik belum dapat dimuat
        </h1>
        <p className="mt-3">Muat ulang halaman atau coba beberapa saat lagi.</p>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <PageHeading
        eyebrow="Administrasi sekolah"
        title="Pusat akademik"
        description="Siapkan periode, rombel, dan penugasan sebelum pembelajaran dimulai. Data setiap semester tetap tersimpan terpisah."
      />
      <AcademicManager initial={state} school={membership.school_id} />
    </AppShell>
  );
}
