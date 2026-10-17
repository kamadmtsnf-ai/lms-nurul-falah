import {z} from 'zod';
import {accountContext,IdentityError,limit} from '@/lib/auth/identity';
import {validOrigin} from '@/lib/auth/security';
import {quizCommand} from '@/lib/quiz/server';
import {quizSchema,releaseSchema,answerSchema} from '@/lib/quiz/validation';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
const output=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 try{
  if(!validOrigin(request.headers.get('origin'),request.url,process.env.APP_URL))throw new IdentityError('Asal permintaan tidak diizinkan.',403);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new IdentityError('Gunakan JSON.',415);
  const reader=request.body?.getReader();if(!reader)throw new IdentityError('Permintaan kosong.');let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>800000){await reader.cancel();throw new IdentityError('Permintaan terlalu besar.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new IdentityError('JSON tidak valid.');}
  const {action}=await params;if(!['list','edit','save','release','start','attempt','answers','finish','report'].includes(action))throw new IdentityError('Fitur tidak ditemukan.',404);
  const input=z.object({course:z.uuid(),target:z.uuid().optional(),offset:z.number().int().min(0).max(100000).optional(),revision:z.number().int().min(0).optional(),request_id:z.uuid().optional(),answers:z.unknown().optional(),data:z.unknown().optional()}).strict().parse(raw);
  if(!['list','report','save'].includes(action)&&!input.target)throw new IdentityError('Pilih kuis atau percobaan.');
  if(action==='save')input.data=quizSchema.parse(input.data);
  if(action==='release')input.data=releaseSchema.parse(input.data);
  if(action==='answers'){input.answers=answerSchema.parse(input.answers);if(!input.request_id||input.revision===undefined)throw new IdentityError('Identitas simpan dan versi diperlukan.');}
  if(action==='finish'&&input.revision===undefined)throw new IdentityError('Versi jawaban diperlukan.');
  const ctx=await accountContext(true);await limit('quiz.'+action,ctx.actor,action==='answers'?240:action==='attempt'?180:120,900);
  return output({ok:true,result:await quizCommand(ctx,action,input)});
 }catch(e){if(e instanceof z.ZodError)return output({ok:false,message:e.issues[0]?.message??'Isian tidak valid.'},400);if(e instanceof IdentityError)return output({ok:false,message:e.message},e.status);console.error('Operasi kuis gagal');return output({ok:false,message:'Layanan kuis belum dapat dihubungi.'},503);}
}
