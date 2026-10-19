import "server-only";
import { identityMessage } from "./identity-template";
import {createEmailTransport,smtpSchema} from "./transport";
import {identity,IdentityError} from "@/lib/auth/identity";
export function emailReady(){return smtpSchema.safeParse(process.env).success && !!process.env.APP_URL;}
export async function deliverIdentityMail(ticket:{id:string;email:string},token:string,purpose:"verify_email"|"reset_password"){
 if(!emailReady())throw new IdentityError("Layanan email belum dikonfigurasi. Hubungi admin madrasah.",503);
 const url=new URL(purpose==="verify_email"?"/verifikasi":"/pulihkan",process.env.APP_URL);
 if(url.protocol!=="https:" && url.hostname!=="localhost")throw new IdentityError("Konfigurasi alamat aplikasi belum valid.",503);
 url.hash=`token=${token}`;const {from,transport}=createEmailTransport();
 try{
  const sent = await transport.sendMail({from: { name: "LMS Nurul Falah", address: from },to:ticket.email,...identityMessage(url.toString(), purpose)});
  if (!sent.accepted?.some((recipient: string | { address: string }) => (typeof recipient === "string" ? recipient : recipient.address).toLowerCase() === ticket.email.toLowerCase())) throw new Error("Recipient rejected");
  await identity("mail_sent",{token_id:ticket.id});
 }catch{
  await identity("mail_failed",{token_id:ticket.id}).catch(()=>{});
  throw new IdentityError("Email belum berhasil dikirim. Periksa alamat atau coba kirim ulang.",503);
 }finally{transport.close();}
}
