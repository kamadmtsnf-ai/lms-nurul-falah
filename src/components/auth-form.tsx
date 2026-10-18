"use client";
import {clearOffline} from '@/lib/offline/store';
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
export type Field={name:string;label:string;type?:string;autoComplete?:string;hint?:string;value?:string;required?:boolean;minLength?:number};
export function AuthForm({action,fields=[],label,fragment=false,extra={}}:{action:string;fields?:Field[];label:string;fragment?:boolean;extra?:Record<string,string>}){
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [token,setToken]=useState("");const [success,setSuccess]=useState(false);
 useEffect(()=>{if(fragment){const t=new URLSearchParams(window.location.hash.slice(1)).get("token");if(t){setToken(t);window.history.replaceState(null,"",window.location.pathname);}}},[fragment]);
 return <form className="mt-7 space-y-5" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");setSuccess(false);const form=new FormData(e.currentTarget);const body:Record<string,unknown>={...extra};form.forEach((value,key)=>{body[key]=String(value);});if(fragment)body.token=token;
 try{const response=await fetch(`/api/identitas/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();setSuccess(response.ok);setMessage(data.message??(response.ok?"Berhasil.":"Permintaan belum berhasil."));if(response.ok && data.next){if(['login','password','reset'].includes(action))await clearOffline();window.location.assign(data.next);};}catch{setMessage("Koneksi terputus. Periksa jaringan dan coba lagi.");}finally{setBusy(false);}}}>
 {fields.map(f=><div key={f.name}><label htmlFor={f.name} className="mb-2 block text-sm font-semibold">{f.label}</label><input id={f.name} name={f.name} type={f.type??"text"} autoComplete={f.autoComplete} defaultValue={f.value} required={f.required!==false} minLength={f.minLength} maxLength={f.type==="password"?128:f.type==="email"?254:100} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-offset-4 focus:outline-emerald-700" aria-describedby={f.hint?`${f.name}-hint`:undefined}/>{f.hint&&<p id={`${f.name}-hint`} className="mt-2 text-xs leading-5 text-stone-500">{f.hint}</p>}</div>)}
 {fragment && !token && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Buka tautan dari email pada browser ini untuk melanjutkan. Jika Anda baru login, buka kembali tautan tersebut.</p>}
 <div aria-live="polite">{message&&<p className={`rounded-xl p-4 text-sm ${success?"bg-emerald-50 text-emerald-900":"bg-red-50 text-red-800"}`}>{message}</p>}</div><Button type="submit" disabled={busy || (fragment&&!token)} className="w-full">{busy?"Memproses…":label}</Button>
 </form>;
}
export function LogoutButton(){const [busy,setBusy]=useState(false);return <Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await clearOffline();const r=await fetch('/api/identitas/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(r.ok)window.location.assign('/masuk');}finally{setBusy(false);}}}>{busy?"Keluar…":"Keluar"}</Button>;}
