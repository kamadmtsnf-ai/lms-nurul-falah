export type ActivationProfile = { status: string; must_change_password: boolean; email_verified_at: string | null };
export type ActivationState = "disabled" | "change-password" | "verify-email" | "active";
export function getActivationState(profile: ActivationProfile): ActivationState {
 if (profile.status !== "active") return "disabled";
 if (profile.must_change_password) return "change-password";
 if (!profile.email_verified_at) return "verify-email";
 return "active";
}
