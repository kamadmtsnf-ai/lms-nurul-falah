import "server-only";
import {createClient} from "@supabase/supabase-js";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {requirePublicEnv} from "@/lib/env";
import {hashToken} from "./security";
export class IdentityError extends Error {constructor(message:string,public status=400){super(message);}}
export async function identity<T=Record<string,unknown>>(cmd:string,p:Record<string,unknown>):Promise<T>{
 const {data,error}=await createSupabaseAdminClient().rpc("identity_command",{cmd,p});
 if(error) throw new IdentityError("Permintaan akun tidak dapat diselesaikan. Coba kembali atau hubungi admin.",409);
 return data as T;
}
export function transientClient(){const env=requirePublicEnv();return createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function accountContext(active=false){
 const client=await createSupabaseServerClient();
 const {data:{user},error}=await client.auth.getUser();
 if(error || !user)throw new IdentityError("Silakan login kembali.",401);
 const {data:claims,error:claimsError}=await client.auth.getClaims();
 const {data:profile,error:profileError}=await client.from("profiles").select("id,username_normalized,full_name,contact_email,status,must_change_password,email_verified_at").eq("id",user.id).single();
 if(claimsError || !claims?.claims?.session_id || profileError || !profile || profile.status!=="active")throw new IdentityError("Sesi telah berakhir. Silakan login kembali.",401);
 if(active && (profile.must_change_password || !profile.email_verified_at))throw new IdentityError("Selesaikan penggantian password dan verifikasi email terlebih dahulu.",403);
 const {data:session}=await client.auth.getSession(); // Hanya mengambil token untuk signOut setelah identitas diverifikasi getUser/getClaims dan RLS.
 return {client,profile,actor:user.id,session:String(claims.claims.session_id),accessToken:session.session?.access_token};
}
export async function limit(action:string,identifier:string,max=6,seconds=900){
 const result=await identity<{allowed:boolean}>("rate",{key:`${action}:${hashToken(identifier)}`,limit:max,seconds});
 if(!result.allowed)throw new IdentityError("Terlalu banyak percobaan. Silakan coba beberapa saat lagi.",429);
}
export async function revokeAll(accessToken?:string){
 if(!accessToken)throw new IdentityError("Sesi tidak tersedia. Login kembali.",401);
 const {error}=await createSupabaseAdminClient().auth.admin.signOut(accessToken,"global");
 if(error && ![401,403,404].includes(error.status??0))throw new IdentityError("Pemutusan sesi belum berhasil. Gunakan pemulihan password atau coba lagi.",503);
}
export async function provePassword(userId:string,password:string){
 const temp=transientClient();const {data,error}=await temp.auth.signInWithPassword({email:`${userId}@accounts.lms.invalid`,password});
 if(error || !data.user || data.user.id!==userId)throw new IdentityError("Password saat ini belum benar.",401);
 const token=data.session?.access_token;
 await temp.auth.signOut({scope:"local"});
 return token;
}
