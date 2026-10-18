import { PageHeading } from "@/components/page-heading";
import { AppShell } from "@/components/app-shell";
import { requireAccount } from "@/lib/auth/page-context";
import { developmentCommand } from "@/lib/development/server";
import { selectedMembership } from "@/lib/development/school";
import {
  DevelopmentSettings,
  SchoolSwitcher,
} from "@/components/development-panel";
import type { SchoolList } from "@/lib/development/client";
export const dynamic = "force-dynamic";
export default async function Page() {
  const ctx = await requireAccount(true);
  let state: SchoolList;
  try {
    state = await developmentCommand<SchoolList>(ctx, "schools");
  } catch {
    return (
      <AppShell>
        Pengaturan belum dapat dimuat. Muat ulang beberapa saat lagi.
      </AppShell>
    );
  }
  const current = await selectedMembership(
    state.schools.map((s) => ({ school_id: s.id })),
  );
  return (
    <AppShell>
      <PageHeading
        eyebrow="Pengaturan aplikasi"
        title="Pengembangan & sekolah"
        description="Kelola fitur tambahan dan pengaturan sekolah sesuai kewenangan akun Anda."
      />
      <SchoolSwitcher selected={current?.school_id} />
      <DevelopmentSettings
        school={current?.school_id}
        central={state.central}
      />
    </AppShell>
  );
}
