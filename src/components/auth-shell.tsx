import {
  BookOpen,
  CalendarCheck,
  ShieldCheck,
  ClipboardCheck,
} from "lucide-react";
import { Brand } from "./brand";
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <Brand inverse />
        <div>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[.2em] text-emerald-200">
            Belajar, bertumbuh, berakhlak
          </p>
          <h2>
            Langkah kecil hari ini.
            <br />
            Bekal besar untuk esok.
          </h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-emerald-100">
            Ruang untuk belajar bersama, mendampingi setiap proses, dan melihat
            perkembangan dengan lebih dekat.
          </p>
          <div className="mt-9 border-t border-white/15 pt-4">
            {[
              { icon: BookOpen, text: "Materi dan kelas yang terstruktur" },
              { icon: ClipboardCheck, text: "Tugas, kuis, dan umpan balik" },
              {
                icon: CalendarCheck,
                text: "Kehadiran dan perkembangan belajar",
              },
            ].map(({ icon: Icon, text }) => (
              <p className="auth-feature" key={text}>
                <Icon size={17} aria-hidden />
                {text}
              </p>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-emerald-200">
          <ShieldCheck size={15} aria-hidden />
          Akses sesuai peran dan kelas Anda.
        </p>
      </aside>
      <section className="auth-content">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-card">
          <p className="page-eyebrow mb-5">Akun madrasah</p>
          <h1>{title}</h1>
          <p className="mt-3 text-sm leading-7 text-stone-500">{description}</p>
          {children}
        </div>
        <p className="auth-support">
          Butuh bantuan akun? Hubungi admin madrasah.
          <br />
          LMS Nurul Falah · Ruang pembelajaran digital
        </p>
      </section>
    </main>
  );
}
