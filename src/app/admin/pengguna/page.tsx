import {selectedMembership} from '@/lib/development/school';
import Link from "next/link";
import {redirect} from "next/navigation";
import {requireAccount} from "@/lib/auth/page-context";
import {UserManager} from "@/components/user-manager";
import {LogoutButton} from "@/components/auth-form";
export const dynamic="force-dynamic";
export default async function ManageUsers(){const {client,profile}=await requireAccount(true);const {data}=await client.from('school_memberships').select('school_id,membership_roles(role_code)').eq('user_id',profile.id).eq('status','active');const membership=await selectedMembership(data??[],m=>m.membership_roles.some((r:{role_code:string})=>r.role_code==='admin'));if(!membership)redirect('/ruang-belajar');return <main className="mx-auto max-w-5xl px-6 py-10"><header className="mb-9 flex items-center justify-between gap-4"><Link href="/ruang-belajar" className="text-sm text-emerald-800 underline">Kembali ke ruang akun</Link><LogoutButton/></header><h1 className="text-3xl font-semibold">Manajemen pengguna</h1><p className="mb-8 mt-3 text-stone-600">Kelola identitas dan hak akses pengguna madrasah.</p><p className="mb-6"><Link href="/admin/akademik" className="text-sm font-semibold text-emerald-800 underline">Buka pusat akademik untuk template dan impor Excel →</Link></p><UserManager school={membership.school_id}/></main>;}
