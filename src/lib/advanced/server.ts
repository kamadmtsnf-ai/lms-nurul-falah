import 'server-only';
import {IdentityError} from '@/lib/auth/identity';
import type {AccountContext} from '@/lib/academic/server';
export async function advancedCommand<T=unknown>(ctx:AccountContext,cmd:string,p:Record<string,unknown>={}):Promise<T>{
 const {data,error}=await ctx.client.rpc('advanced_command',{cmd,p});
 if(error){if(error.code==='42501')throw new IdentityError(error.message,403);if(['P0001','23505'].includes(error.code))throw new IdentityError(error.message,409);if(['23514','23503','23502','22P02','22007'].includes(error.code))throw new IdentityError('Isian atau referensi tidak sesuai aturan.',400);console.error('Fitur lanjutan gagal:',error.code);throw new IdentityError('Fitur lanjutan belum dapat dihubungi.',503);}return data as T;
}
