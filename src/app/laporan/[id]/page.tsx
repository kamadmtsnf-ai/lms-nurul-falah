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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        className="mb-6 inline-block text-sm text-emerald-800 underline"
        href={`/pembelajaran/${id}`}
      >
        ← Pembelajaran
      </Link>
      <ReportPanel course={id} />
    </main>
  );
}
