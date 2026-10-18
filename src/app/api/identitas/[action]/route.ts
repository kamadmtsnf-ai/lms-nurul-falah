import {after} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {accountContext,identity,IdentityError,limit,provePassword,revokeWithPassword} from "@/lib/auth/identity";
import {DEFAULT_PASSWORD,usernameSchema,passwordPair,emailSchema,tokenSchema,createUserSchema,rolesSchema,nextFor} from "@/lib/auth/validation";
import {hashToken,makeToken,sameSecret,validOrigin} from "@/lib/auth/security";
import {passwordFlow} from "@/lib/auth/password-flow";
import {emailReady,deliverIdentityMail} from "@/lib/email/identity-mail";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const ok=(data:Record<string,unknown>={})=>Response.json({ok:true,...data},{headers:{"Cache-Control":"private, no-store"}});
const bodyObject=z.record(z.string(),z.unknown());
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 try{
  if(!validOrigin(request.headers.get("origin"),request.url,process.env.APP_URL))throw new IdentityError("Asal permintaan tidak diizinkan.",403);
  if(!request.headers.get("content-type")?.includes("application/json"))throw new IdentityError("Format permintaan harus JSON.",415);
  if(Number(request.headers.get("content-length")??0)>16_384)throw new IdentityError("Permintaan terlalu besar.",413);
  const raw=await request.text();if(raw.length>16_384)throw new IdentityError("Permintaan terlalu besar.",413);
  let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new IdentityError("Data permintaan tidak valid.");}
  const input=bodyObject.parse(parsed);const {action}=await params;
  if(!["login","logout","bootstrap","forgot","reset","password","email","confirm-email","admin-list","admin-create","admin-update"].includes(action))throw new IdentityError("Fitur tidak ditemukan.",404);
  // Batas jaringan tetap berlaku meskipun username atau token diganti.
  const ip=request.headers.get("x-vercel-forwarded-for")?.split(",")[0]??"local";
  await limit(`network:${action}`,ip,120,900);
  if(action==="login"){
   const v=z.object({username:usernameSchema,password:z.string().min(1).max(128)}).parse(input);
   await limit("login",v.username,10);
   const record=await identity<{id:string}|null>("lookup",{username:v.username});
   // Auth juga dipanggil untuk akun tidak dikenal agar jalur kegagalan serupa.
   const client=await createSupabaseServerClient();
   const {data,error}=await client.auth.signInWithPassword({email:`${record?.id??"00000000-0000-4000-8000-000000000000"}@accounts.lms.invalid`,password:v.password});
   if(error || !data.user || !record){await client.auth.signOut({scope:"local"});throw new IdentityError("Username atau password belum benar.",401);}
   const ctx=await accountContext();
   if(v.password===DEFAULT_PASSWORD){await identity("force_default",{actor:ctx.actor,session:ctx.session});ctx.profile.must_change_password=true;}
   return ok({next:nextFor(ctx.profile)});
  }
  if(action==="logout"){
   const client=await createSupabaseServerClient();const {error}=await client.auth.signOut({scope:"local"});if(error)throw new IdentityError("Sesi belum dapat diakhiri. Periksa koneksi dan coba keluar kembali.",503);return ok({next:"/masuk"});
  }
  if(action==="bootstrap"){
   const supplied=z.string().min(32).max(256).parse(input.code);
   if(!process.env.LMS_SETUP_TOKEN || !sameSecret(supplied,process.env.LMS_SETUP_TOKEN))throw new IdentityError("Kode penyiapan tidak valid atau fitur tidak diaktifkan.",403);
   const v=z.object({username:usernameSchema,name:z.string().trim().min(2).max(100),school:z.uuid()}).parse(input);
   const claim=await identity<{nonce:string}>("bootstrap_claim",{school:v.school});
   const id=randomUUID();const admin=createSupabaseAdminClient();let created=false;
   try{
    const result=await admin.auth.admin.createUser({id,email:`${id}@accounts.lms.invalid`,password:DEFAULT_PASSWORD,email_confirm:true});
    if(result.error)throw new IdentityError("Akun admin belum dapat dibuat.",409);created=true;
    await identity("bootstrap_finish",{...v,target:id,nonce:claim.nonce});
   }catch(e){if(created)await admin.auth.admin.deleteUser(id);await identity("bootstrap_abort",{nonce:claim.nonce}).catch(()=>{});throw e;}
   return ok({next:"/masuk",message:"Admin dibuat. Login dengan username yang dipilih dan password awal dari admin."});
  }
  if(action==="forgot"){
   const username=usernameSchema.parse(input.username);await limit("forgot",username,3);
   if(!emailReady())throw new IdentityError("Layanan pemulihan email belum dikonfigurasi. Hubungi admin.",503);
   const record=await identity<{id:string;verified:boolean}|null>("lookup",{username});
   if(record?.verified){const token=makeToken();const ticket=await identity<{id:string;email:string}|null>("reset_issue",{target:record.id,hash:hashToken(token)});if(ticket)after(async()=>{await deliverIdentityMail(ticket,token,"reset_password").catch(()=>{console.error("Pengiriman email pemulihan gagal; token dibatalkan.");});});}
   return ok({message:"Jika akun memiliki email terverifikasi, tautan pemulihan akan dikirim. Periksa inbox dan folder spam."});
  }
  if(action==="reset"){
   const token=tokenSchema.parse(input.token);const pair=passwordPair(input);await limit("reset",hashToken(token),5);
   const admin=createSupabaseAdminClient();
   await passwordFlow({
    begin:()=>identity<{target:string;nonce:string}>("reset_claim",{hash:hashToken(token)}),
    update:async(ticket)=>{const {error}=await admin.auth.admin.updateUserById(ticket.target,{password:pair.password});if(error)throw new IdentityError("Password belum dapat diubah. Minta tautan pemulihan baru.",409);},
    revoke:ticket=>revokeWithPassword(ticket.target,pair.password),finish:async(ticket)=>{await identity("password_finish",ticket);
    },clear:async()=>{const client=await createSupabaseServerClient();await client.auth.signOut({scope:"local"});}
   });return ok({next:"/masuk?selesai=password",message:"Password berhasil diperbarui. Silakan login ulang."});
  }
  const ctx=await accountContext();const actor={actor:ctx.actor,session:ctx.session};
  if(action==="password"){
   const pair=passwordPair(input);const current=z.string().min(1).max(128).parse(input.current);await limit("password",ctx.actor,5);
   if(current===pair.password)throw new IdentityError("Password baru harus berbeda dari password saat ini.");
   await provePassword(ctx.actor,current);
   await passwordFlow({begin:()=>identity<{target:string;nonce:string}>("password_begin",actor),
    update:async()=>{const {error}=await createSupabaseAdminClient().auth.admin.updateUserById(ctx.actor,{password:pair.password});if(error)throw new IdentityError("Password belum dapat diperbarui. Coba login ulang atau gunakan pemulihan.",409);},
    revoke:()=>revokeWithPassword(ctx.actor,pair.password),finish:ticket=>identity("password_finish",ticket).then(()=>{}),
    clear:async()=>{await ctx.client.auth.signOut({scope:"local"});const store=await cookies();store.getAll().filter(c=>c.name.startsWith("sb-")).forEach(c=>store.delete(c.name));}
   });return ok({next:"/masuk?selesai=password"});
  }
  if(action==="email"){
   if(ctx.profile.must_change_password)throw new IdentityError("Ganti password terlebih dahulu.",403);
   const email=emailSchema.parse(input.email);await limit("email",ctx.actor,3);
   if(!emailReady())throw new IdentityError("Layanan email belum dikonfigurasi. Hubungi admin madrasah.",503);
   const token=makeToken();const ticket=await identity<{id:string;email:string}>("email_issue",{...actor,email,hash:hashToken(token)});
   await deliverIdentityMail(ticket,token,"verify_email");return ok({message:"Tautan verifikasi dikirim. Berlaku 15 menit. Buka tautan dengan akun ini tetap login."});
  }
  if(action==="confirm-email"){
   const token=tokenSchema.parse(input.token);await limit("confirm",ctx.actor,10);
   await identity("email_confirm",{...actor,hash:hashToken(token)});return ok({next:"/ruang-belajar",message:"Email berhasil diverifikasi."});
  }
  if(action==="admin-list"){
   const school=z.uuid().parse(input.school);const offset=z.number().int().min(0).max(100000).default(0).parse(input.offset);
   return ok({users:await identity("admin_list",{...actor,school,offset})});
  }
  if(action==="admin-create"){
   const v=createUserSchema.parse(input);await limit("create-user",ctx.actor,30);
   // Periksa kewenangan sebelum membuat identitas Auth agar tidak ada akun yatim oleh pengguna biasa.
   await identity("admin_list",{...actor,school:v.school,offset:0});
   const id=randomUUID();const admin=createSupabaseAdminClient();
   const created=await admin.auth.admin.createUser({id,email:`${id}@accounts.lms.invalid`,password:DEFAULT_PASSWORD,email_confirm:true});
   if(created.error)throw new IdentityError("Akun belum dapat dibuat. Periksa username dan coba lagi.",409);
   try{await identity("admin_attach",{...actor,...v,target:id});}catch(error){const cleanup=await admin.auth.admin.deleteUser(id);if(cleanup.error)console.error("Pembersihan identitas baru gagal; diperlukan pemeriksaan operator.");throw error;}
   return ok({message:"Pengguna dibuat dengan password awal dan wajib menyelesaikan aktivasi."});
  }
  if(action==="admin-update"){
   const v=z.object({school:z.uuid(),target:z.uuid(),roles:rolesSchema,status:z.enum(["active","disabled"])}).parse(input);
   await identity("admin_update",{...actor,...v});return ok({message:"Hak akses pengguna berhasil diperbarui."});
  }
  throw new IdentityError("Fitur tidak ditemukan.",404);
 }catch(error){
  const status=error instanceof IdentityError?error.status:error instanceof z.ZodError?400:503;
  const message=error instanceof IdentityError?error.message:error instanceof z.ZodError?error.issues[0]?.message:"Layanan akun belum dapat dihubungi. Coba lagi atau hubungi admin.";
  return Response.json({ok:false,message},{status,headers:{"Cache-Control":"private, no-store"}});
 }
}
