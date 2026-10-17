// Urutan fail-closed dipakai oleh perubahan dan pemulihan password.
export async function passwordFlow<T>(steps:{begin:()=>Promise<T>;update:(ticket:T)=>Promise<void>;revoke:(ticket:T)=>Promise<void>;finish:(ticket:T)=>Promise<void>;clear:()=>Promise<void>}) {
 const ticket=await steps.begin();
 // Begitu begin berhasil, sesi lama sudah diblokir oleh cutoff dan flag aktivasi.
 try {await steps.update(ticket);await steps.revoke(ticket);await steps.finish(ticket);}
 finally {await steps.clear();}
}
