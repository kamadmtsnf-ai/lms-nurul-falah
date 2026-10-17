import 'server-only';
import {accountContext,IdentityError} from '@/lib/auth/identity';
export type AccountContext=Awaited<ReturnType<typeof accountContext>>;
export async function academicCommand<T=Record<string,unknown>>(context:AccountContext,cmd:string,p:Record<string,unknown>):Promise<T>{
 const {data,error}=await context.client.rpc('academic_command',{cmd,p});
 if(error){
  if(error.code==='42501')throw new IdentityError('Anda tidak memiliki akses untuk tindakan ini.',403);
  if(error.code==='23505')throw new IdentityError('Data duplikat atau siswa sudah memiliki rombel aktif pada semester ini.',409);
  if(error.code==='23503')throw new IdentityError('Referensi tidak ditemukan atau berasal dari sekolah lain.',409);
  if(['23514','23502','22P02'].includes(error.code))throw new IdentityError('Isian tidak sesuai aturan data. Periksa kembali form.',400);
  if(error.code==='P0001')throw new IdentityError(error.message,409);
  throw new IdentityError('Data akademik belum dapat diproses. Coba lagi.',503);
 }
 return data as T;
}
export async function requireSchoolAdmin(context:AccountContext,school:string){
 const {data,error}=await context.client.from('school_memberships').select('school_id,membership_roles(role_code)').eq('school_id',school).eq('user_id',context.actor).eq('status','active').single();
 if(error || !data?.membership_roles.some((r:{role_code:string})=>r.role_code==='admin'))throw new IdentityError('Hanya admin sekolah yang dapat mengelola data ini.',403);
}
