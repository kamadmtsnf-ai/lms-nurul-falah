"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  House,
  UserRound,
  ChartNoAxesCombined,
  ChevronRight,
} from "lucide-react";
import { Brand } from "./brand";
import { LogoutButton } from "./auth-form";
const navigation = [
  { href: "/ruang-belajar", label: "Ruang akun", icon: House },
  { href: "/profil", label: "Profil", icon: UserRound },
  { href: "/akademik", label: "Kelas & semester", icon: BookOpen },
  { href: "/pemantauan", label: "Pemantauan", icon: ChartNoAxesCombined },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const academic =
    pathname.startsWith("/pembelajaran") || pathname.startsWith("/laporan");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#konten-utama">
        Lewati ke konten utama
      </a>
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <Brand />
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-stone-500 sm:block">
              Belajar bersama, tumbuh dengan ilmu
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="app-navigation">
        <nav className="app-navigation-inner" aria-label="Navigasi utama">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || (href === "/akademik" && academic);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`app-nav-link ${active ? "is-active" : ""}`}
              >
                <Icon size={17} aria-hidden />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <main id="konten-utama" tabIndex={-1} className="app-main">
        {pathname.startsWith("/admin/") && (
          <p className="page-breadcrumb">
            <Link href="/ruang-belajar">Ruang akun</Link>
            <ChevronRight size={13} aria-hidden />
            <span>Administrasi sekolah</span>
          </p>
        )}
        {children}
      </main>
      <footer className="app-footer">
        <span>LMS Nurul Falah</span>
        <span>Ilmu, akhlak, dan langkah menuju masa depan.</span>
      </footer>
    </div>
  );
}
