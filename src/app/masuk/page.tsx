import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function AccessPage() {
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16"><p className="text-sm font-semibold text-emerald-700">LMS Nurul Falah</p><h1 className="mt-4 text-3xl font-semibold">Akses akun belum dibuka</h1><p className="mt-5 leading-7 text-stone-600">Sistem akun sedang disiapkan. Setelah tersedia, admin akan memberikan username dan password awal. Anda akan diminta mengganti password, login ulang, lalu memverifikasi email.</p><p className="mt-4 text-sm leading-6 text-stone-600">Jangan memasukkan password atau data pribadi pada tahap ini.</p><Button asChild className="mt-8 self-start" variant="outline"><Link href="/">Kembali ke halaman awal</Link></Button></main>;
}
