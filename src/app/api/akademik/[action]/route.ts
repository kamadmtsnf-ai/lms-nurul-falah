import {z} from 'zod';
import {accountContext,IdentityError,limit} from '@/lib/auth/identity';
import {validOrigin} from '@/lib/auth/security';
import {DEFAULT_PASSWORD} from '@/lib/auth/validation';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {academicCommand,requireSchoolAdmin} from '@/lib/academic/server';
import {parseEntity,schoolSchema} from '@/lib/academic/config';
import {importKinds,type ImportKind} from '@/lib/academic/import-config';
import {makeTemplate,readImport,MAX_IMPORT_BYTES} from '@/lib/academic/excel';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=120;
const reply=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
function fail(error:unknown){return reply({ok:false,message:error instanceof IdentityError?error.message:error instanceof z.ZodError?'Isian belum lengkap atau format data tidak sesuai.':error instanceof Error && error.name==='AcademicInputError'?error.message:'Permintaan akademik belum dapat diproses. Coba lagi.'},error instanceof IdentityError?error.status:error instanceof z.ZodError?400:503);}
async function boundedBody(request:Request,max:number){
 if(Number(request.headers.get('content-length')??0)>max)throw new IdentityError('Berkas atau permintaan terlalu besar.',413);
 const reader=request.body?.getReader();if(!reader)throw new IdentityError('Permintaan kosong.');
 const chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new IdentityError('Berkas atau permintaan terlalu besar.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
export async function GET(request:Request,{params}:{params:Promise<{action:string}>}){
 try{
  if((await params).action!=='template')throw new IdentityError('Fitur tidak ditemukan.',404);
  const url=new URL(request.url),school=z.uuid().parse(url.searchParams.get('school')),kind=z.enum(importKinds).parse(url.searchParams.get('kind'));
  const ctx=await accountContext(true);await requireSchoolAdmin(ctx,school);
  const bytes=await makeTemplate(kind);
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="template-${kind}-lms-nurul-falah.xlsx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return fail(e);}
}
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 try{
  if(!validOrigin(request.headers.get('origin'),request.url,process.env.APP_URL))throw new IdentityError('Asal permintaan tidak diizinkan.',403);
  const action=(await params).action;
  if(!['state','save','school','preview','import','import-users'].includes(action))throw new IdentityError('Fitur tidak ditemukan.',404);
  const ctx=await accountContext(true);await limit('academic',ctx.actor,180,900);
  if(action==='preview'){
   if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new IdentityError('Unggah berkas Excel melalui form impor.',415);
   const bytes=await boundedBody(request,MAX_IMPORT_BYTES+30_000);
   const form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')!},body:new Uint8Array(bytes)}).formData();
   const school=z.uuid().parse(form.get('school'));const kind=z.enum(importKinds).parse(form.get('kind'));await requireSchoolAdmin(ctx,school);
   const file=form.get('file');if(!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size>MAX_IMPORT_BYTES)throw new IdentityError('Gunakan berkas .xlsx maksimal 2 MB.');
   await limit('academic-preview',ctx.actor,20,900);
   let parsed:Awaited<ReturnType<typeof readImport>>;
   try{parsed=await readImport(Buffer.from(await file.arrayBuffer()),kind);}catch(e){throw new IdentityError(e instanceof Error?e.message:'Berkas tidak dapat dibaca.');}
   if(parsed.errors.length)return reply({ok:true,errors:parsed.errors,count:parsed.rows.length+parsed.errors.length,display:parsed.display});
   const preview=await academicCommand(ctx,'preview',{school,kind,rows:parsed.rows});return reply({ok:true,...preview,display:parsed.display});
  }
  if(!request.headers.get('content-type')?.includes('application/json'))throw new IdentityError('Format permintaan harus JSON.',415);
  const bytes=await boundedBody(request,30_000);let raw:unknown;try{raw=JSON.parse(bytes.toString('utf8'));}catch{throw new IdentityError('Data JSON tidak valid.');}
  const input=z.object({school:z.uuid(),entity:z.string().max(40).optional(),data:z.unknown().optional(),ticket:z.uuid().optional()}).strict().parse(raw);
  await requireSchoolAdmin(ctx,input.school);
  if(action==='state')return reply({ok:true,state:await academicCommand(ctx,'state',{school:input.school})});
  if(action==='save'){
   let data:Record<string,unknown>;try{data=parseEntity(input.entity??'',input.data);}catch(e){throw new IdentityError(e instanceof z.ZodError?'Periksa semua kolom wajib, panjang isian dan format tanggal.':e instanceof Error?e.message:'Isian tidak valid.');}
   const result=await academicCommand(ctx,'save',{school:input.school,entity:input.entity,data});return reply({ok:true,...result,message:'Data berhasil disimpan.'});
  }
  if(action==='school'){await academicCommand(ctx,'school',{school:input.school,data:schoolSchema.parse(input.data)});return reply({ok:true,message:'Pengaturan sekolah berhasil disimpan.'});}
  const ticket=z.uuid().parse(input.ticket);
  if(action==='import')return reply({ok:true,...await academicCommand(ctx,'import',{school:input.school,ticket}),message:'Impor berhasil disimpan.'});
  await limit('academic-import-users',ctx.actor,8,900);
  const claimed=await academicCommand<{committed?:boolean;count?:number;lease?:string;rows?:({_id:string;username:string;name:string;roles:string[];email?:string})[]}>(ctx,'claim',{school:input.school,ticket});
  if(claimed.committed)return reply({ok:true,count:claimed.count,message:'Impor ini sudah berhasil disimpan sebelumnya.'});
  const admin=createSupabaseAdminClient();const created:string[]=[];
  try{
   for(const row of claimed.rows??[]){
    const result=await admin.auth.admin.createUser({id:row._id,email:`${row._id}@accounts.lms.invalid`,password:DEFAULT_PASSWORD,email_confirm:true});
    if(result.error)throw new IdentityError('Pembuatan akun belum berhasil. Data pengguna belum diimpor; buat pratinjau baru.',409);
    created.push(row._id);
   }
   return reply({ok:true,...await academicCommand(ctx,'commit-users',{school:input.school,ticket,lease:claimed.lease}),message:'Akun berhasil diimpor. Semua akun wajib mengganti password dan memverifikasi email.'});
  }catch(e){
   // Jangan menghapus akun yang ternyata sudah tersimpan ketika respons jaringan commit terputus.
   if(created.length){const saved=await admin.from('profiles').select('id').in('id',created);if(!saved.error){const attached=new Set(saved.data.map(p=>p.id));for(const id of created)if(!attached.has(id)){const clean=await admin.auth.admin.deleteUser(id);if(clean.error)console.error('Pembersihan identitas impor memerlukan pemeriksaan operator.');}}}
   await academicCommand(ctx,'abort',{school:input.school,ticket,lease:claimed.lease}).catch(()=>{});throw e;
  }
 }catch(e){return fail(e);}
}
