import {AuthShell} from "@/components/auth-shell";
import {AuthForm} from "@/components/auth-form";
export default function Recover(){return <AuthShell title="Atur password baru" description="Tautan hanya berlaku 15 menit dan dapat dipakai sekali. Setelah berhasil, login kembali menggunakan password baru."><AuthForm action="reset" fragment label="Simpan password baru" fields={[{name:"password",label:"Password baru",type:"password",autoComplete:"new-password",minLength:8},{name:"confirm",label:"Ulangi password baru",type:"password",autoComplete:"new-password",minLength:8}]}/></AuthShell>;}
