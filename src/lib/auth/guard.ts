import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readPublicEnv } from "@/lib/env";
import { getActivationState } from "./state";
export async function requireActiveAccount() {
 if (!readPublicEnv()) redirect("/masuk?status=setup");
 const client = await createSupabaseServerClient();
 const {data, error} = await client.auth.getClaims();
 if (error || !data?.claims?.sub) redirect("/masuk");
 const {data: profile, error: profileError} = await client.from("profiles").select("id,full_name,status,must_change_password,email_verified_at").eq("id", data.claims.sub).single();
 if (profileError || !profile) redirect("/masuk?status=session");
 const state = getActivationState(profile);
 if (state !== "active") redirect(`/masuk?status=${state}`);
 return {client, profile};
}
