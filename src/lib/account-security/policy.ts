export type SecurityFactor = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
};
export function verifiedTotp(factors: SecurityFactor[] = []) {
  return factors.filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
}
export function needsSecondFactor(
  factors: SecurityFactor[] | undefined,
  aal: unknown,
) {
  return verifiedTotp(factors).length > 0 && aal !== "aal2";
}
export function maskNik(value: string) {
  return value
    ? "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4)
    : "";
}
export const eventLabels: Record<string, string> = {
  name: "Nama diperbarui",
  identity: "Identitas diperbarui",
  phone: "Nomor HP diperbarui",
  photo: "Foto diperbarui",
  username: "Username diperbarui",
  email: "Email diperbarui",
  "security.nik_revealed": "NIK ditampilkan setelah verifikasi password",
  "security.sessions_revoked": "Sesi perangkat lain diakhiri",
  "security.logout_all": "Semua sesi diakhiri",
  "security.mfa_enrolled": "Autentikator diaktifkan",
  "security.mfa_verified": "Kode autentikator diverifikasi",
  "security.mfa_disable_requested": "Penonaktifan autentikator diminta",
  "security.mfa_disabled": "Autentikator dinonaktifkan; sesi diakhiri",
  "security.operator_mfa_recovery": "Pemulihan autentikator oleh operator",
};
