import { AppShell } from "@/components/app-shell";
import { selectedMembership } from "@/lib/development/school";
import { requireAccount } from "@/lib/auth/page-context";
import { learningCommand } from "@/lib/learning/server";
import { DailyAttendance, type DailyMeta } from "@/components/daily-attendance";
export const dynamic = "force-dynamic";
export default async function DailyPage() {
  const ctx = await requireAccount(true);
  const { data } = await ctx.client
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", ctx.actor)
    .eq("status", "active");
  const school = (await selectedMembership(data ?? []))?.school_id;
  let meta: DailyMeta | null = null;
  if (school)
    try {
      meta = await learningCommand<DailyMeta>(ctx, "daily-meta", { school });
    } catch {}
  return (
    <AppShell>
      {school && meta ? (
        <DailyAttendance school={school} meta={meta} />
      ) : (
        <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
          Data absensi belum dapat dimuat. Periksa keanggotaan dan penugasan
          Anda.
        </p>
      )}
    </AppShell>
  );
}
