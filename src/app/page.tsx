import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
const modules = [
  {
    icon: BookOpen,
    title: "Ruang pembelajaran",
    text: "Materi dan kegiatan belajar tersusun untuk setiap kelas.",
  },
  {
    icon: CalendarCheck,
    title: "Kehadiran siswa",
    text: "Absensi harian dan pertemuan dicatat secara terpisah.",
  },
  {
    icon: ClipboardList,
    title: "Tugas dan kuis",
    text: "Pengumpulan, umpan balik, dan perkembangan belajar dalam satu tempat.",
  },
];
export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="landing-header">
        <Brand />
        <Button asChild variant="outline">
          <Link href="/masuk">
            Masuk
            <ArrowRight size={15} aria-hidden />
          </Link>
        </Button>
      </header>
      <section className="landing-hero">
        <div>
          <p className="page-eyebrow mb-6">Belajar, bertumbuh, berakhlak</p>
          <h1 className="landing-title">
            Satu ruang untuk setiap langkah belajar.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-stone-500">
            Pembelajaran yang terarah, pendampingan yang dekat, dan perkembangan
            siswa yang mudah dipahami.
          </p>
          <div className="mt-8">
            <Button asChild className="px-6">
              <Link href="/masuk">
                Masuk ke LMS
                <ArrowRight size={17} aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-stone-500">
            <ShieldCheck
              size={15}
              className="shrink-0 text-emerald-600"
              aria-hidden
            />
            Gunakan akun yang diberikan admin madrasah.
          </p>
        </div>
        <aside className="landing-flow">
          <p className="text-xs font-semibold uppercase tracking-[.17em] text-emerald-200">
            Ruang belajar madrasah
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Belajar lebih teratur.
            <br />
            Bertumbuh bersama.
          </h2>
          {[
            {
              title: "Temukan kelas Anda",
              text: "Materi dan pertemuan sesuai kelas serta semester.",
            },
            {
              title: "Ikuti setiap kegiatan",
              text: "Kerjakan tugas dan kuis, lalu terima umpan balik.",
            },
            {
              title: "Lihat perkembangan",
              text: "Pantau kehadiran, progres belajar, dan nilai yang dibuka guru.",
            },
          ].map((step, i) => (
            <div className="landing-step" key={step.title}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-6 text-emerald-100">
                  {step.text}
                </p>
              </div>
            </div>
          ))}
          <p className="mt-7 border-t border-white/15 pt-5 text-xs leading-6 text-emerald-200">
            Satu tempat untuk siswa, guru, dan orang tua mendampingi proses
            belajar.
          </p>
        </aside>
      </section>
      <section
        aria-label="Layanan pembelajaran"
        className="mx-auto max-w-[1216px] px-5 pb-14"
      >
        <div className="section-heading">
          <div>
            <h2>Pembelajaran yang saling terhubung</h2>
            <p>Dari pertemuan pertama hingga perkembangan setiap siswa.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {modules.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="surface-card rounded-2xl border bg-white p-6"
            >
              <span className="icon-tile">
                <Icon size={22} aria-hidden />
              </span>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-stone-500">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <footer className="app-footer">
        <span>LMS Nurul Falah</span>
        <span>Ilmu, akhlak, dan langkah menuju masa depan.</span>
      </footer>
    </main>
  );
}
