import { PageHeading } from "@/components/page-heading";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/page-context";
import { ReportPanel } from "@/components/report-panel";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccount(true);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <AppShell>
      <Link
        className="mb-6 inline-block text-sm text-emerald-800 underline"
        href={`/pembelajaran/${id}`}
      >
        ← Pembelajaran
      </Link>
      <PageHeading
        eyebrow="Perkembangan belajar"
        title="Laporan pembelajaran"
        description="Tinjau kehadiran, tugas, dan hasil kuis. Ekspor laporan sesuai hak akses Anda."
      />
      <ReportPanel course={id} />
    </AppShell>
  );
}
