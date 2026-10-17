import {AuthShell} from "@/components/auth-shell";
import {AuthForm,LogoutButton} from "@/components/auth-form";
import {requireAccount} from "@/lib/auth/page-context";
export const dynamic="force-dynamic";
export default async function ChangePassword(){await requireAccount();return <AuthShell title="Ganti password akun" description="Gunakan password baru minimal 8 karakter. Setelah berhasil, semua sesi berakhir dan Anda wajib login ulang."><AuthForm action="password" label="Simpan password dan keluar" fields={[{name:"current",label:"Password saat ini",type:"password",autoComplete:"current-password"},{name:"password",label:"Password baru",type:"password",autoComplete:"new-password",minLength:8},{name:"confirm",label:"Ulangi password baru",type:"password",autoComplete:"new-password",minLength:8}]}/><div className="mt-5"><LogoutButton/></div></AuthShell>;}
