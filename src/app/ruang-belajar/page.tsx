import { requireActiveAccount } from "@/lib/auth/guard";
export const dynamic = "force-dynamic";
export default async function LearningSpace() {
 const {profile} = await requireActiveAccount();
 return <main className="mx-auto max-w-3xl px-6 py-20"><h1 className="text-3xl font-semibold">Selamat datang, {profile.full_name}</h1><p className="mt-4">Akun aktif. Modul pembelajaran belum tersedia pada tahap fondasi.</p></main>;
}
