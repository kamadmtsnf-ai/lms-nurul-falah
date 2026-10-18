import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";
export default function Forgot() {
  return (
    <AuthShell
      title="Pulihkan akses akun"
      description="Masukkan username. Jika akun memiliki email terverifikasi, tautan pemulihan akan dikirim ke email akun tersebut."
    >
      <AuthForm
        action="forgot"
        label="Kirim tautan pemulihan"
        fields={[
          { name: "username", label: "Username", autoComplete: "username" },
        ]}
      />
      <Link className="mt-5 block text-center text-sm underline" href="/masuk">
        Kembali ke login
      </Link>
    </AuthShell>
  );
}
