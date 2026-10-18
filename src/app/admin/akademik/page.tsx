import { selectedMembership } from "@/lib/development/school";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/page-context";
import { AcademicManager } from "@/components/academic-manager";
import { academicCommand } from "@/lib/academic/server";
import type { AcademicState } from "@/lib/academic/config";
import { LogoutButton } from "@/components/auth-form";
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
      <main className="mx-auto max-w-3xl p-8">
        <Link href="/ruang-belajar" className="text-emerald-800 underline">
          Kembali
        </Link>
        <h1 className="mt-8 text-2xl font-semibold">
          Data akademik belum dapat dimuat
        </h1>
        <p className="mt-3">Muat ulang halaman atau coba beberapa saat lagi.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/ruang-belajar"
          className="text-sm text-emerald-800 underline"
        >
          ← Ruang akun
        </Link>
        <LogoutButton />
      </header>
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
        Administrasi sekolah
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Pusat akademik</h1>
      <p className="mb-8 mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        Siapkan periode, rombel dan penugasan sebelum kegiatan pembelajaran
        dimulai. Data setiap semester tersimpan terpisah.
      </p>
      <AcademicManager initial={state} school={membership.school_id} />
    </main>
  );
}
