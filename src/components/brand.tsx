import Link from "next/link";
import { GraduationCap } from "lucide-react";
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="LMS Nurul Falah — beranda"
      className={`brand ${inverse ? "brand-inverse" : ""}`}
    >
      <span className="brand-mark">
        <GraduationCap size={23} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold tracking-tight sm:text-base">
          LMS Nurul Falah
        </span>
        <span className="block text-[11px] font-medium tracking-wide opacity-65">
          Ruang pembelajaran madrasah
        </span>
      </span>
    </Link>
  );
}
