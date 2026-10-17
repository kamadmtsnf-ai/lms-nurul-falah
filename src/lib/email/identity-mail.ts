import "server-only";
import {createEmailTransport,smtpSchema} from "./transport";
import {identity,IdentityError} from "@/lib/auth/identity";
export function emailReady(){return smtpSchema.safeParse(process.env).success && !!process.env.APP_URL;}
export async function deliverIdentityMail(ticket:{id:string;email:string},token:string,purpose:"verify_email"|"reset_password"){
 if(!emailReady())throw new IdentityError("Layanan email belum dikonfigurasi. Hubungi admin madrasah.",503);
 const url=new URL(purpose==="verify_email"?"/verifikasi":"/pulihkan",process.env.APP_URL);
 if(url.protocol!=="https:" && url.hostname!=="localhost")throw new IdentityError("Konfigurasi alamat aplikasi belum valid.",503);
 url.hash=`token=${token}`;const {from,transport}=createEmailTransport();
 try{
  await transport.sendMail({from,to:ticket.email,subject:purpose==="verify_email"?"Verifikasi email LMS Nurul Falah":"Pemulihan password LMS Nurul Falah",text:`${purpose==="verify_email"?"Konfirmasi email akun":"Atur password baru akun"} Anda melalui tautan berikut. Tautan berlaku 15 menit dan hanya dapat dipakai sekali.\n\n${url.toString()}\n\nJika tidak meminta tindakan ini, abaikan email ini.`});
  await identity("mail_sent",{token_id:ticket.id});
 }catch{
  await identity("mail_failed",{token_id:ticket.id}).catch(()=>{});
  throw new IdentityError("Email belum berhasil dikirim. Periksa alamat atau coba kirim ulang.",503);
 }finally{transport.close();}
}
