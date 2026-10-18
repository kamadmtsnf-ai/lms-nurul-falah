import { profileCommand } from "@/lib/profile/server";
import { canEdit, profileDate } from "@/lib/profile/validation";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { AuthForm, LogoutButton } from "@/components/auth-form";
import { requireAccount } from "@/lib/auth/page-context";
export const dynamic = "force-dynamic";
export default async function Verify() {
  const ctx = await requireAccount();
  const { profile } = ctx;
  if (profile.must_change_password) redirect("/ganti-password");
  if (profile.email_verified_at) redirect("/profil");
  const emailState = await profileCommand<{ next: string | null }>(
    ctx,
    "email-state",
  );
  const locked = !canEdit(emailState.next);
  return (
    <AuthShell
      title="Verifikasi email Anda"
      description="Email digunakan untuk pemulihan akun. Siswa boleh menggunakan email orang tua atau wali. Akses pembelajaran dibuka setelah email terverifikasi."
    >
      {locked && (
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6">
          Verifikasi email baru yang ditampilkan di bawah. Anda dapat mengirim
          ulang tautan ke alamat yang sama. Perubahan alamat berikutnya tersedia
          pada {profileDate(emailState.next)} (WIB).
        </p>
      )}
      <AuthForm
        action="email"
        label="Kirim tautan verifikasi"
        fields={[
          {
            name: "email",
            label: "Email pribadi atau wali",
            type: "email",
            autoComplete: "email",
            value: profile.contact_email ?? "",
            readOnly: locked,
          },
        ]}
      />
      <div className="my-8 border-t border-stone-200" />
      <h2 className="font-semibold">Sudah membuka tautan email?</h2>
      <AuthForm
        action="confirm-email"
        label="Konfirmasi email akun ini"
        fragment
      />
      <div className="mt-6">
        <LogoutButton />
      </div>
    </AuthShell>
  );
}
