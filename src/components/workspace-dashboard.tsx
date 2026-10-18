import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Users,
  Settings2,
  ChartNoAxesCombined,
  ShieldCheck,
  Archive,
  GraduationCap,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { PageHeading } from "./page-heading";
import { SchoolSwitcher } from "./development-panel";
import { roleLabels } from "@/lib/auth/validation";
import { Button } from "./ui/button";
export function WorkspaceDashboard({
  name,
  roles,
  school,
}: {
  name: string;
  roles: string[];
  school?: string;
}) {
  const admin = roles.includes("admin"),
    staff = roles.some((r) =>
      [
        "admin",
        "principal",
        "teacher",
        "homeroom_teacher",
        "duty_teacher",
      ].includes(r),
    );
  const learning = [
    {
      href: "/akademik",
      title: "Kelas & semester",
      description: "Buka materi, pertemuan, tugas, dan kuis di kelas Anda.",
      icon: BookOpen,
    },
    ...(staff
      ? [
          {
            href: "/absensi-harian",
            title: "Absensi harian sekolah",
            description:
              "Catat kehadiran sesuai jadwal piket atau lihat rekap kelas.",
            icon: CalendarCheck,
          },
        ]
      : []),
    {
      href: "/pemantauan",
      title: "Pemantauan & notifikasi",
      description: "Ikuti progres pembelajaran, nilai, dan anak yang tertaut.",
      icon: ChartNoAxesCombined,
    },
  ];
  const administration = [
    {
      href: "/admin/pengguna",
      title: "Manajemen pengguna",
      description: "Kelola akun, aktivasi, dan hak akses warga madrasah.",
      icon: Users,
    },
    {
      href: "/admin/akademik",
      title: "Pusat akademik",
      description: "Atur periode, rombel, mata pelajaran, dan penugasan.",
      icon: Settings2,
    },
    {
      href: "/admin/retensi",
      title: "Retensi alumni",
      description: "Kelola masa simpan dan peninjauan data alumni.",
      icon: Archive,
    },
  ];
  return (
    <AppShell>
      <PageHeading
        eyebrow="Ruang akun Anda"
        title={`Assalamu’alaikum, ${name}`}
        description="Selamat datang di ruang belajar madrasah. Pilih kegiatan yang ingin Anda lanjutkan."
      />
      <div className="mb-7 flex flex-wrap gap-2">
        {roles.map((role) => (
          <span key={role} className="role-badge">
            <ShieldCheck size={13} aria-hidden />
            {roleLabels[role] ?? role}
          </span>
        ))}
      </div>
      <section className="welcome-panel">
        <div className="welcome-icon">
          <GraduationCap size={30} aria-hidden />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-200">
            Belajar dengan lebih terarah
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Setiap langkah belajar, dalam satu ruang.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100">
            Materi, tugas, kuis, dan rekap pertemuan tersusun sesuai kelas dan
            semester Anda.
          </p>
        </div>
        <Button
          asChild
          className="bg-white text-emerald-950 hover:bg-emerald-50"
        >
          <Link href="/akademik">
            Buka kelas Anda
            <ArrowRight size={16} aria-hidden />
          </Link>
        </Button>
      </section>
      <DashboardGroup
        title="Pembelajaran"
        description="Kegiatan dan perkembangan belajar Anda."
        items={learning}
      />
      {admin && (
        <>
          <DashboardGroup
            title="Administrasi sekolah"
            description="Pengaturan data dan layanan madrasah."
            items={administration}
          />
          <SchoolSwitcher selected={school} />
        </>
      )}
      <section className="account-security">
        <span className="icon-tile">
          <ShieldCheck size={20} aria-hidden />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold">Keamanan akun</h2>
          <p className="mt-1 text-sm leading-6 text-stone-500">
            Gunakan password unik, aktifkan autentikator, dan periksa sesi
            perangkat Anda.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link
            className="text-sm font-semibold text-emerald-800 underline"
            href="/keamanan"
          >
            Autentikator & sesi
          </Link>
          <Link
            className="text-sm font-semibold text-emerald-800 underline"
            href="/profil"
          >
            Kelola profil
          </Link>
          <Link
            className="text-sm font-semibold text-emerald-800 underline"
            href="/ganti-password?from=ruang-belajar"
          >
            Ubah password
            <ArrowRight className="ml-2 inline" size={14} aria-hidden />
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
function DashboardGroup({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: {
    href: string;
    title: string;
    description: string;
    icon: typeof BookOpen;
  }[];
}) {
  return (
    <section className="mt-9">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(({ href, title, description, icon: Icon }) => (
          <Link href={href} key={href} className="module-card group">
            <div className="flex items-center justify-between gap-3">
              <span className="icon-tile">
                <Icon size={21} aria-hidden />
              </span>
              <ArrowRight
                size={17}
                aria-hidden
                className="text-stone-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-700"
              />
            </div>
            <h3 className="mt-5 text-base font-semibold tracking-tight">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              {description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
