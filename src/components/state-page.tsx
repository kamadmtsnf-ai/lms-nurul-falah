import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
export function StatePage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen px-5 py-7">
      <div className="mx-auto max-w-6xl">
        <Brand />
      </div>
      <section className="surface-card empty-page rounded-3xl border bg-white">
        <span className="icon-tile mx-auto mb-6">
          <BookOpen size={22} aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-stone-500">{description}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {children}
          <Button asChild variant="outline">
            <Link href="/">Kembali ke beranda</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
