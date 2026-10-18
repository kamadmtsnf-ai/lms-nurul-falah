import Link from "next/link";
import { GraduationCap, ShieldCheck } from "lucide-react";
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
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between bg-emerald-950 p-14 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3 font-semibold">
          <GraduationCap className="text-amber-200" />
          LMS Nurul Falah
        </Link>
        <div>
          <p className="text-sm uppercase tracking-widest text-amber-200">
            Ruang pembelajaran madrasah
          </p>
          <h2 className="mt-5 max-w-md text-4xl font-semibold leading-tight">
            Langkah kecil hari ini.
            <br />
            Bekal besar untuk esok.
          </h2>
          <p className="mt-6 max-w-sm leading-7 text-emerald-100">
            Belajar bersama, tumbuh dengan ilmu, dan membangun akhlak dalam
            setiap pertemuan.
          </p>
        </div>
        <p className="flex items-center gap-2 text-sm text-emerald-200">
          <ShieldCheck size={18} />
          Akses sesuai peran dan kelas Anda.
        </p>
      </aside>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="text-sm font-semibold text-emerald-800 lg:hidden"
          >
            LMS Nurul Falah
          </Link>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
          {children}
          <p className="mt-8 text-center text-xs text-stone-500">
            Hubungi admin madrasah jika memerlukan bantuan akun.
          </p>
        </div>
      </section>
    </main>
  );
}
