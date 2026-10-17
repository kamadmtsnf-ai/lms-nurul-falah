import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
export function hashToken(value:string){return createHash("sha256").update(value).digest("hex");}
export function makeToken(){return randomBytes(32).toString("base64url");}
export function sameSecret(a:string,b:string){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
export function validOrigin(origin:string|null,requestUrl:string,canonical?:string){
 if(!origin)return false;
 try{return origin===new URL(requestUrl).origin && (!canonical || origin===new URL(canonical).origin || origin===`https://${process.env.VERCEL_URL}`); }catch{return false;}
}
