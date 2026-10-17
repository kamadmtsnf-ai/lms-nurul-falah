import "server-only";
import {redirect} from "next/navigation";
import {accountContext} from "./identity";
import {nextFor} from "./validation";
export async function requireAccount(active=false){
 let context:Awaited<ReturnType<typeof accountContext>>;
 try{context=await accountContext();}catch{redirect("/masuk");}
 if(active && (context.profile.must_change_password || !context.profile.email_verified_at))redirect(nextFor(context.profile));
 return context;
}
