import { PageHeading } from "@/components/page-heading";
import { AppShell } from "@/components/app-shell";
import { selectedMembership } from "@/lib/development/school";
import Link from "next/link";
import { requireAccount } from "@/lib/auth/page-context";
export const dynamic = "force-dynamic";
export default async function MyAcademic() {
  const { client, actor } = await requireAccount(true);
  const { data: memberships } = await client
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", actor)
    .eq("status", "active");
  const current = await selectedMembership(memberships ?? []);
  const [classes, semesters, years, teaching, subjects] = await Promise.all([
    client
      .from("classrooms")
      .select("id,name,semester_id,school_id")
      .order("name"),
    client.from("semesters").select("id,number,status,academic_year_id"),
    client.from("academic_years").select("id,name"),
    client.from("teaching_classes").select("id,classroom_id,subject_id"),
    client.from("subjects").select("id,name"),
  ]);
  const error = [classes, semesters, years, teaching, subjects].some(
    (r) => r.error,
  );
  return (
    <AppShell>
      <PageHeading
        eyebrow="Akademik"
        title="Kelas yang dapat Anda akses"
        description="Pilih kelas dan mata pelajaran untuk membuka kegiatan belajar. Daftar mengikuti penugasan, keanggotaan, serta arsip semester Anda."
      />
      {error ? (
        <p role="alert" className="mt-8 rounded-xl bg-amber-50 p-5">
          Data akademik belum dapat dimuat. Silakan muat ulang.
        </p>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {classes.data
            ?.filter((c) => c.school_id === current?.school_id)
            .map((c) => {
              const s = semesters.data?.find((s) => s.id === c.semester_id),
                y = years.data?.find((y) => y.id === s?.academic_year_id);
              const ts =
                teaching.data?.filter((t) => t.classroom_id === c.id) ?? [];
              return (
                <section
                  key={c.id}
                  className="surface-card rounded-2xl border border-stone-200 bg-white p-6"
                >
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${s?.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}
                  >
                    {s?.status === "active"
                      ? "Semester aktif"
                      : s?.status === "archived"
                        ? "Arsip"
                        : "Draf"}
                  </span>
                  <h2 className="mt-4 text-2xl font-semibold">{c.name}</h2>
                  <p className="mt-2 text-sm text-stone-500">
                    {y?.name} · {s?.number === 1 ? "Ganjil" : "Genap"}
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-stone-600">
                    {ts.map((t) => (
                      <li key={t.id}>
                        <Link
                          className="class-subject-link"
                          href={`/pembelajaran/${t.id}`}
                        >
                          {subjects.data?.find((s) => s.id === t.subject_id)
                            ?.name ?? "Mata pelajaran"}{" "}
                          →
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!ts.length && (
                    <p className="mt-5 text-sm text-stone-500">
                      Belum ada mata pelajaran yang ditugaskan untuk akses Anda.
                    </p>
                  )}
                </section>
              );
            })}
          {!classes.data?.some((c) => c.school_id === current?.school_id) && (
            <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-sm text-stone-500 md:col-span-2">
              Belum ada kelas yang ditautkan ke akun Anda. Hubungi admin untuk
              memeriksa penugasan atau keanggotaan kelas.
            </p>
          )}
        </div>
      )}
      <p className="mt-8 text-xs text-stone-500">
        Pilih mata pelajaran untuk membuka materi, absensi pertemuan, tugas, dan
        nilai yang sudah dibuka.
      </p>
    </AppShell>
  );
}
