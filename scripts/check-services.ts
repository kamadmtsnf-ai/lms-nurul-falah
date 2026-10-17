import { createClient } from "@supabase/supabase-js";
import { readPublicEnv } from "../src/lib/env";
import { createEmailTransport } from "../src/lib/email/transport";
async function main() {
 const env=readPublicEnv();
 if (!env || !process.env.SUPABASE_SECRET_KEY) { console.error("BLOCKED: isi konfigurasi Supabase pada .env.local terlebih dahulu."); process.exitCode=2; return; }
 let failed=false;
 const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
 try {
  const {data,error}=await admin.rpc("foundation_status");
  if(error || data!=="202610170001") throw new Error();
  const {data:buckets,error:storageError}=await admin.storage.listBuckets();
  const bucket=buckets?.find(b=>b.id==="lms-private");
  if(storageError || !bucket || bucket.public) throw new Error();
  console.log("PASS: koneksi database, revisi fondasi, dan bucket privat.");
 } catch { failed=true; console.error("FAIL: periksa koneksi, kunci server, dan penerapan kedua migrasi."); }
 try {
  const publicClient=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
  const {data,error}=await publicClient.from("profiles").select("id").limit(1);
  if(!error && data?.length) throw new Error();
  if(error && !["42501","PGRST301"].includes(error.code)) throw new Error();
  console.log("PASS: akun anonim tidak dapat membaca profil.");
 } catch {failed=true; console.error("FAIL: pemeriksaan akses anonim belum lolos.");}
 try {
  const {transport}=createEmailTransport();
  try {await transport.verify(); console.log("PASS: koneksi dan autentikasi SMTP. Belum menguji penerimaan email.");}
  finally {transport.close();}
 } catch {failed=true; console.error("BLOCKED/FAIL: konfigurasi atau koneksi SMTP belum lolos.");}
 process.exitCode=failed?1:0;
}
main().catch(()=>{console.error("Pemeriksaan gagal; konfigurasi tidak dicetak untuk menjaga secret.");process.exitCode=1;});
