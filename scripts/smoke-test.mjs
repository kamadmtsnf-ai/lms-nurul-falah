import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
const port=3217;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',NEXT_TELEMETRY_DISABLED:'1',APP_URL:`http://localhost:${port}`},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
const base=`http://127.0.0.1:${port}`;
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw new Error('Server tidak dapat dimulai.');
  try{const response=await fetch(base+'/api/health');if(response.ok){ready=true;break;}}catch{}
  await wait(100);
 }
 assert.equal(ready,true,'Server harus siap dalam 10 detik');
 const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/Satu ruang untuk setiap langkah belajar/);assert.equal(home.headers.get('x-content-type-options'),'nosniff');
 console.log('PASS: beranda dan header keamanan');
 const login=await fetch(base+'/masuk');assert.equal(login.status,200);assert.match(await login.text(),/Selamat datang kembali/);console.log('PASS: halaman informasi akses');
 const health=await fetch(base+'/api/health');assert.equal((await health.json()).status,'ok');assert.match(health.headers.get('cache-control'),/no-store/);console.log('PASS: liveness tanpa cache');
 const protectedPage=await fetch(base+'/ruang-belajar',{redirect:'manual'});assert.equal(protectedPage.status,307);assert.equal(protectedPage.headers.get('location'),'/masuk');console.log('PASS: halaman privat tertutup tanpa konfigurasi');
 const missing=await fetch(base+'/halaman-tidak-ada');assert.equal(missing.status,404);console.log('PASS: halaman 404');
 for(const path of ['/ganti-password','/verifikasi','/admin/pengguna','/admin/akademik','/akademik','/absensi-harian','/laporan/00000000-0000-4000-8000-000000000001','/kuis/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002','/pembelajaran/00000000-0000-4000-8000-000000000001']){const r=await fetch(base+path,{redirect:'manual'});assert.equal(r.status,307);assert.equal(r.headers.get('location'),'/masuk');}console.log('PASS: semua halaman akun privat menolak anonim');
 const csrf=await fetch(base+'/api/identitas/login',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(csrf.status,403);console.log('PASS: asal lintas situs ditolak');
 const academicCsrf=await fetch(base+'/api/akademik/save',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(academicCsrf.status,403);console.log('PASS: mutasi akademik menolak CSRF');
 const learningCsrf=await fetch(base+'/api/pembelajaran/submit',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(learningCsrf.status,403);console.log('PASS: mutasi pembelajaran menolak CSRF');
 const quizCsrf=await fetch(base+'/api/kuis/answers',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(quizCsrf.status,403);console.log('PASS: autosave kuis menolak CSRF');
 const exportAnon=await fetch(base+'/api/laporan/00000000-0000-4000-8000-000000000001?format=xlsx');assert.equal(exportAnon.status,503);assert.match(exportAnon.headers.get('cache-control'),/no-store/);console.log('PASS: ekspor privat tanpa cache dan tertutup');
 const academicAnon=await fetch(base+'/api/akademik/state',{method:'POST',headers:{'Content-Type':'application/json','Origin':`http://localhost:${port}`,'Host':`localhost:${port}`},body:'{}'});assert.equal(academicAnon.status,503);assert.equal((await academicAnon.json()).ok,false);console.log('PASS: API akademik tertutup saat layanan belum dikonfigurasi');
}catch(error){console.error(error);console.error(logs);process.exitCode=1;}finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
