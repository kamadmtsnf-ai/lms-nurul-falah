export function canReturnFromPassword(
  profile: { must_change_password: boolean; email_verified_at: string | null },
  from: unknown,
) {
  return (
    from === "ruang-belajar" &&
    !profile.must_change_password &&
    Boolean(profile.email_verified_at)
  );
}
