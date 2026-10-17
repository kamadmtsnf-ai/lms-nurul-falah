import Link from "next/link";
import { ArrowRight, BookOpen, CalendarCheck, ClipboardList, GraduationCap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
const modules = [
 {icon:BookOpen, title:"Ruang pembelajaran",text:"Materi dan kegiatan belajar tersusun untuk setiap kelas."},
 {icon:CalendarCheck,title:"Kehadiran siswa",text:"Absensi harian dan pertemuan dicatat secara terpisah."},
 {icon:ClipboardList,title:"Tugas dan kuis",text:"Pengumpulan, umpan balik, dan perkembangan belajar dalam satu tempat."},
];
export default function Home() {
 return <main className="min-h-screen">
 <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-7"><Link href="/" className="flex items-center gap-3 font-bold"><span className="rounded-xl bg-emerald-900 p-3 text-amber-200"><GraduationCap aria-hidden size={25}/></span><span>LMS Nurul Falah<span className="block text-xs font-normal text-stone-500">Madrasah • Ruang belajar digital</span></span></Link><span className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-800">Akun & akses</span></header>
 <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-12 md:grid-cols-[1.3fr_1fr] md:pt-20">
 <div><p className="mb-5 text-xs font-bold uppercase tracking-[.22em] text-emerald-700">Belajar, bertumbuh, berakhlak</p><h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">Satu ruang untuk setiap langkah belajar.</h1><p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">Pembelajaran yang terarah, pendampingan yang dekat, dan perkembangan siswa yang mudah dipahami.</p><div className="mt-8"><Button asChild><Link href="/masuk">Masuk ke LMS <ArrowRight aria-hidden size={17}/></Link></Button></div></div>
 <aside className="self-center rounded-3xl bg-emerald-950 p-8 text-white md:p-10"><ShieldCheck className="mb-8 text-amber-200" size={35} aria-hidden/><h2 className="text-2xl font-semibold">Ruang belajar madrasah</h2><p className="mt-4 leading-7 text-emerald-100">Masuk dengan akun madrasah Anda. Selesaikan aktivasi untuk mengakses layanan yang tersedia sesuai peran.</p><div className="mt-8 border-t border-emerald-800 pt-5 text-sm text-emerald-200">Akun akan diberikan oleh admin madrasah.</div></aside>
 </section><section aria-label="Layanan pembelajaran" className="mx-auto grid max-w-6xl gap-5 px-6 pb-14 md:grid-cols-3">{modules.map(({icon:Icon,title,text})=><article key={title} className="rounded-2xl border border-stone-200 bg-white p-7"><Icon aria-hidden className="mb-6 text-emerald-700" size={24}/><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-stone-600">{text}</p><p className="mt-5 text-xs text-stone-500">Tersedia sesuai hak akses setelah masuk</p></article>)}</section><footer className="mx-auto max-w-6xl border-t border-stone-200 px-6 py-6 text-xs text-stone-500">LMS Nurul Falah · Ruang pembelajaran madrasah</footer></main>;
}
