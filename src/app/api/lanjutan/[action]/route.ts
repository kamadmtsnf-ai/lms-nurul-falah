import {cleanupRetainedProfilePhotos} from '@/lib/profile/server';
import {z} from 'zod';
import {accountContext,IdentityError,limit} from '@/lib/auth/identity';
import {validOrigin} from '@/lib/auth/security';
import {advancedCommand} from '@/lib/advanced/server';
import {actions,envelope} from '@/lib/advanced/validation';
import {parseQuestions,questionTemplate} from '@/lib/advanced/excel';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {learningCommand} from '@/lib/learning/server';
import {randomUUID} from 'node:crypto';
import {createEmailTransport} from '@/lib/email/transport';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const output=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request,{params}:{params:Promise<{action:string}>}){try{if((await params).action!=='bank-template')throw new IdentityError('Tidak ditemukan.',404);const course=z.uuid().parse(new URL(request.url).searchParams.get('course'));const ctx=await accountContext(true);await advancedCommand(ctx,'bank-list',{course});return new Response(new Uint8Array(await questionTemplate()),{headers:{'Cache-Control':'private, no-store','Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="template-bank-soal.xlsx"'}});}catch{return output({message:'Template tidak dapat dibuka.'},403);}}
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){try{
 if(!validOrigin(request.headers.get('origin'),request.url,process.env.APP_URL))throw new IdentityError('Asal permintaan tidak diizinkan.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new IdentityError('Gunakan JSON.',415);
 const {action}=await params;if(!actions[action])throw new IdentityError('Fitur tidak ditemukan.',404);
 const reader=request.body?.getReader();if(!reader)throw new IdentityError('Permintaan kosong.');let size=0;const chunks:Uint8Array[]=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();throw new IdentityError('Permintaan terlalu besar.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new IdentityError('JSON tidak valid.');}
 const input=envelope.parse(raw);input.data=actions[action].parse(input.data??{});
 const ctx=await accountContext(true);await limit('advanced.'+action,ctx.actor,action==='discussion-post'?30:120,900);
 if(!['portal','inbox','message-read'].includes(action)&&!action.startsWith('retention-'))z.uuid().parse(input.course);
 if(action.startsWith('retention-'))z.uuid().parse(input.school);
 if(['complete','discussion-list','discussion-post','discussion-hide','material-rule','material-share','assignment-rule','group-submit','bank-delete','message-read','message-send'].includes(action))z.uuid().parse(input.target);
 if(action==='bank-import'){await advancedCommand(ctx,'bank-list',{course:input.course});const file=(input.data as {file:string}).file;const questions=await parseQuestions(Buffer.from(file,'base64'));return output({ok:true,result:{questions}});}
 if(action==='message-send'){
  await advancedCommand(ctx,'message-status',{course:input.course});const admin=createSupabaseAdminClient();const {from,transport}=createEmailTransport();try{
   const claim=await admin.rpc('activity_mail_claim',{message:input.target,course:input.course,actor:ctx.actor});if(claim.error)throw new IdentityError('Antrean belum dapat diproses.',409);
   let sent=0,uncertain=0;for(const job of claim.data??[]){let status='sent';try{await transport.sendMail({from,to:job.email,subject:job.subject,text:job.body+'\n\nBuka LMS Nurul Falah untuk melihat kegiatan pembelajaran.'});sent++;}catch{status='unknown';uncertain++;}const ack=await admin.rpc('activity_mail_ack',{message:input.target,recipient:job.user_id,result:status});if(ack.error)uncertain++;}return output({ok:true,result:{sent,uncertain,message:'Batch maksimal 3 penerima diproses. Periksa antrean sebelum melanjutkan.'}});
  }finally{transport.close();}
 }
 if(action==='retention-auth'){const result=await advancedCommand<{student_id:string}>(ctx,action,input);await cleanupRetainedProfilePhotos(result.student_id);const removed=await createSupabaseAdminClient().auth.admin.deleteUser(result.student_id);if(removed.error)throw new IdentityError('Penghapusan akun Auth belum selesai. Hubungi operator.',503);return output({ok:true,result:{status:'purged'}});}
 if(action==='retention-purge'){
  // Prepare rechecks scope and confirms the authorized operator; repeatable after partial Storage failure.
  const records=await advancedCommand<{records:{student_id:string;export_reference:string;status:string}[]}>(ctx,'retention-list',{school:input.school,offset:input.offset??0},true);const d=input.data as {student_id:string;confirmation:string};const row=records.records.find(r=>r.student_id===d.student_id);if(!row||row.status!=='prepared')throw new IdentityError('Siapkan penghapusan dahulu.',409);
  const prepared=await advancedCommand<{paths:string[]}>(ctx,'retention-prepare',{school:input.school,data:{student_id:d.student_id,confirmation:'SIAPKAN PENGHAPUSAN',export_reference:row.export_reference}});
  const admin=createSupabaseAdminClient();for(let n=0;n<prepared.paths.length;n+=100){const removed=await admin.storage.from('lms-private').remove(prepared.paths.slice(n,n+100));if(removed.error)throw new IdentityError('Penghapusan berkas belum selesai. Akun tetap dinonaktifkan; periksa lalu ulangi.',503);}
  await advancedCommand(ctx,'retention-purge',input);await cleanupRetainedProfilePhotos(d.student_id);const removed=await admin.auth.admin.deleteUser(d.student_id);if(removed.error)throw new IdentityError('Data aktif sudah dibersihkan; penghapusan Auth masih memerlukan operator.',503);return output({ok:true,result:{status:'purged'}});
 }
 if(action==='material-share'){
 const result=await advancedCommand<{id:string}>(ctx,action,input);const destination=(input.data as {destination_course:string}).destination_course;const admin=createSupabaseAdminClient();
 const assets=await admin.from('learning_assets').select('*').eq('teaching_class_id',input.course!).eq('target_type','material').eq('target_id',input.target!).eq('status','ready');if(assets.error)throw new IdentityError('Draf telah dibuat; daftar lampiran sumber belum dapat dibaca.',503);
 for(const a of assets.data??[]){const ticket=await learningCommand<{id:string;path:string}>(ctx,'asset-reserve',{course:destination,data:{target_type:'material',target_id:result.id,name:a.name,kind:a.kind,mime:a.mime,bytes:a.bytes}});const copied=await admin.storage.from('lms-private').copy(a.object_path,ticket.path);if(copied.error){await learningCommand(ctx,'asset-fail',{course:destination,target:ticket.id}).catch(()=>{});throw new IdentityError('Draf tersimpan; sebagian lampiran belum tersalin. Periksa kelas tujuan sebelum berbagi lagi.',503);}const proof=randomUUID();const attested=await admin.rpc('learning_asset_attest',{asset:ticket.id,proof});if(attested.error)throw new IdentityError('Salinan lampiran menunggu pemeriksaan.',503);await learningCommand(ctx,'asset-complete',{course:destination,target:ticket.id,check:proof});}
 return output({ok:true,result:{id:result.id,copied_assets:assets.data?.length??0}});
 }
 const result=await advancedCommand(ctx,action,input);return output({ok:true,result});
}catch(e){return output({ok:false,message:e instanceof IdentityError?e.message:e instanceof z.ZodError?e.issues[0]?.message:e instanceof Error&&e.message.startsWith('Baris ')?e.message:'Layanan lanjutan belum dapat menyelesaikan permintaan.'},e instanceof IdentityError?e.status:e instanceof z.ZodError?400:503);}}
