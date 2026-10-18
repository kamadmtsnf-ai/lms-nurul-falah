/** Trusted operator only. Never run before offline identity verification. */
import { createClient } from "@supabase/supabase-js";
const {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  LMS_MFA_RECOVERY_USER_ID,
  LMS_MFA_RECOVERY_ACK,
} = process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SECRET_KEY ||
  !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(LMS_MFA_RECOVERY_USER_ID || "") ||
  LMS_MFA_RECOVERY_ACK !== "verified-offline-identity-and-authorized-reset"
) {
  console.error(
    "Pemulihan dibatalkan. Konfigurasi operator, UUID akun, dan pengakuan verifikasi identitas wajib lengkap.",
  );
  process.exit(1);
}
const client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
try {
  const factors = await client.auth.admin.mfa.listFactors({
    userId: LMS_MFA_RECOVERY_USER_ID,
  });
  if (factors.error) throw Error("Status faktor belum dapat diperiksa.");
  // Invalidate first: a partially completed recovery must fail closed.
  const invalid = await client.rpc("security_invalidate_user", {
    target: LMS_MFA_RECOVERY_USER_ID,
    reason: "operator_mfa_recovery",
  });
  if (invalid.error)
    throw Error("Pencabutan sesi gagal; faktor belum dihapus.");
  for (const factor of factors.data.factors.filter(
    (f) => f.factor_type === "totp",
  )) {
    const removed = await client.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: LMS_MFA_RECOVERY_USER_ID,
    });
    if (removed.error)
      throw Error(
        "Sebagian faktor belum dapat dihapus. Akun tetap diwajibkan mengganti password; selesaikan pemulihan melalui operator.",
      );
  }
  console.log(
    "Pemulihan selesai: sesi dicabut, tautan pemulihan lama ditutup, dan penggantian password diwajibkan. Minta pengguna mengaktifkan kembali autentikator.",
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : "Pemulihan belum selesai.");
  process.exitCode = 1;
}
