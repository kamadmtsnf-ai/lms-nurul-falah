import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/page-context";
import { learningCommand } from "@/lib/learning/server";
import { CourseWorkspace } from "@/components/course-workspace";
import type { CourseState } from "@/lib/learning/types";
export const dynamic = "force-dynamic";
export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAccount(true);
  let state: CourseState;
  try {
    state = await learningCommand<CourseState>(ctx, "course", { course: id });
  } catch {
    return (
      <AppShell>
        <Link className="text-emerald-800 underline" href="/akademik">
          Kembali ke daftar kelas
        </Link>
        <h1 className="mt-8 text-2xl font-semibold">
          Pembelajaran belum dapat dibuka
        </h1>
        <p className="mt-3 text-sm text-stone-600">
          Periksa penugasan atau keanggotaan kelas Anda, lalu coba kembali.
        </p>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <CourseWorkspace key={id} initial={state} />
    </AppShell>
  );
}
