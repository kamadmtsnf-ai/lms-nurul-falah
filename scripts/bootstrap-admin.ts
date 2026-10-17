import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requirePublicEnv } from "../src/lib/env";

async function main() {
 const publicEnv=requirePublicEnv();
 const env=z.object({SUPABASE_SECRET_KEY:z.string().min(20),BOOTSTRAP_SCHOOL_ID:z.uuid(),BOOTSTRAP_USERNAME:z.string().regex(/^[a-z0-9][a-z0-9._-]{2,49}$/),BOOTSTRAP_FULL_NAME:z.string().trim().min(1)}).parse(process.env);
 const client=createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const school=await client.from("schools").select("id").eq("id",env.BOOTSTRAP_SCHOOL_ID).single();
 if(school.error) throw new Error("Sekolah belum tersedia. Terapkan seed terlebih dahulu.");
 const duplicate=await client.from("profiles").select("id").eq("username_normalized",env.BOOTSTRAP_USERNAME).maybeSingle();
 if(duplicate.error || duplicate.data) throw new Error("Username sudah ada atau tidak dapat diperiksa.");
 const uid=randomUUID();
 const {data,error}=await client.auth.admin.createUser({id:uid,email:`${uid}@accounts.lms.invalid`,password:"12345678",email_confirm:true});
 if(error || !data.user) throw new Error("Pembuatan identitas Auth gagal.");
 try {
  const profile=await client.from("profiles").insert({id:uid,username_normalized:env.BOOTSTRAP_USERNAME,full_name:env.BOOTSTRAP_FULL_NAME,must_change_password:true});
  if(profile.error) throw profile.error;
  const membership=await client.from("school_memberships").insert({school_id:env.BOOTSTRAP_SCHOOL_ID,user_id:uid}).select("id").single();
  if(membership.error) throw membership.error;
  const role=await client.from("membership_roles").insert({school_id:env.BOOTSTRAP_SCHOOL_ID,membership_id:membership.data.id,role_code:"admin"});
  if(role.error) throw role.error;
  const audit=await client.from("audit_logs").insert({school_id:env.BOOTSTRAP_SCHOOL_ID,actor_id:uid,action:"bootstrap_admin",entity:"profiles",entity_id:uid});
  if(audit.error) throw audit.error;
  console.log("Admin sekolah berhasil dibuat dengan kewajiban mengganti password. Login tersedia pada Tahap 2.");
 } catch {
  const rollback=await client.auth.admin.deleteUser(uid);
  if(rollback.error) throw new Error("Bootstrap gagal dan pembersihan gagal; periksa Auth/profil secara manual sebelum mencoba ulang.");
  throw new Error("Bootstrap gagal; identitas baru telah dibersihkan.");
 }
}
main().catch((error:unknown)=>{console.error(error instanceof z.ZodError?"Konfigurasi bootstrap belum lengkap/valid.":error instanceof Error?error.message:"Bootstrap gagal.");process.exitCode=1;});
