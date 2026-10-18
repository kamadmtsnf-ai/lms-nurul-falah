import "server-only";
import { redirect } from "next/navigation";
import { accountContext, IdentityError } from "./identity";
import { nextFor } from "./validation";
export async function requireAccount(active = false) {
  let context: Awaited<ReturnType<typeof accountContext>>;
  try {
    context = await accountContext();
  } catch (e) {
    redirect(e instanceof IdentityError && e.next ? e.next : "/masuk");
  }
  if (
    active &&
    (context.profile.must_change_password || !context.profile.email_verified_at)
  )
    redirect(nextFor(context.profile));
  return context;
}
