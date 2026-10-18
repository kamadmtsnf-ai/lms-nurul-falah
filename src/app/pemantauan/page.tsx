import { PageHeading } from "@/components/page-heading";
import { AppShell } from "@/components/app-shell";
import { selectedMembership } from "@/lib/development/school";
import { requireAccount } from "@/lib/auth/page-context";
import { MonitoringDashboard } from "@/components/monitoring-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { client, actor } = await requireAccount(true);
  const { data } = await client
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", actor)
    .eq("status", "active");
  const current = await selectedMembership(data ?? []);
  return (
    <AppShell>
      <PageHeading
        eyebrow="Perkembangan belajar"
        title="Pemantauan pembelajaran"
        description="Pantau progres kelas, anak yang tertaut, dan notifikasi sesuai hak akses Anda."
      />
      <MonitoringDashboard school={current?.school_id} />
    </AppShell>
  );
}
