import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/auth-form";
import { MfaChallenge } from "@/components/security-workspace";
import { accountContext } from "@/lib/auth/identity";
import { nextFor } from "@/lib/auth/validation";
import { verifiedTotp } from "@/lib/account-security/policy";
export const dynamic = "force-dynamic";
export default async function VerifySecurity() {
  let ctx;
  try {
    ctx = await accountContext(false, true);
  } catch {
    redirect("/masuk");
  }
  if (!ctx.mfaRequired) redirect(nextFor(ctx.profile));
  const r = await ctx.client.auth.mfa.listFactors();
  if (r.error) throw Error("Status autentikator belum tersedia.");
  return (
    <AuthShell
      title="Verifikasi dua langkah"
      description="Masukkan kode dari aplikasi autentikator Anda. Data aplikasi tetap terkunci sampai verifikasi berhasil."
    >
      <MfaChallenge
        factors={verifiedTotp(r.data.all).map((f) => ({
          id: f.id,
          name: f.friendly_name || "Autentikator",
        }))}
      />
      <div className="mt-6">
        <LogoutButton />
      </div>
    </AuthShell>
  );
}
