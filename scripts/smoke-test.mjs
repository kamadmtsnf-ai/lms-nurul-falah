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
 const login=await fetch(base+'/masuk');assert.equal(login.status,200);const loginHtml=await login.text();assert.match(loginHtml,/Selamat datang kembali/);assert.match(loginHtml,/<form[^>]*method="post"/);assert.match(loginHtml,/<input(?=[^>]*name="password")(?=[^>]*disabled="")[^>]*>/);console.log('PASS: halaman informasi akses');
 const health=await fetch(base+'/api/health');assert.equal((await health.json()).status,'ok');assert.match(health.headers.get('cache-control'),/no-store/);console.log('PASS: liveness tanpa cache');
 const protectedPage=await fetch(base+'/ruang-belajar',{redirect:'manual'});assert.equal(protectedPage.status,307);assert.equal(protectedPage.headers.get('location'),'/masuk');console.log('PASS: halaman privat tertutup tanpa konfigurasi');
 const missing=await fetch(base+'/halaman-tidak-ada');assert.equal(missing.status,404);console.log('PASS: halaman 404');
 for(const path of ['/profil','/pengembangan','/pemantauan','/admin/retensi','/ganti-password','/verifikasi','/admin/pengguna','/admin/akademik','/akademik','/absensi-harian','/laporan/00000000-0000-4000-8000-000000000001','/kuis/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002','/pembelajaran/00000000-0000-4000-8000-000000000001']){const r=await fetch(base+path,{redirect:'manual'});assert.equal(r.status,307);assert.equal(r.headers.get('location'),'/masuk');}console.log('PASS: semua halaman akun privat menolak anonim');
 const profileAnon=await fetch(base+'/api/profil/read');assert.equal(profileAnon.status,503);assert.match(profileAnon.headers.get('cache-control'),/no-store/);assert.equal((await profileAnon.json()).ok,false);console.log('PASS: API profil privat tanpa cache dan tertutup');
 const profileCsrf=await fetch(base+'/api/profil/name',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(profileCsrf.status,403);console.log('PASS: perubahan profil menolak CSRF');
 const csrf=await fetch(base+'/api/identitas/login',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(csrf.status,403);console.log('PASS: asal lintas situs ditolak');
 const academicCsrf=await fetch(base+'/api/akademik/save',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(academicCsrf.status,403);console.log('PASS: mutasi akademik menolak CSRF');
 const learningCsrf=await fetch(base+'/api/pembelajaran/submit',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(learningCsrf.status,403);console.log('PASS: mutasi pembelajaran menolak CSRF');
 const quizCsrf=await fetch(base+'/api/kuis/answers',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(quizCsrf.status,403);console.log('PASS: autosave kuis menolak CSRF');
 const advancedCsrf=await fetch(base+'/api/lanjutan/material-rule',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(advancedCsrf.status,403);console.log('PASS: fitur lanjutan menolak CSRF');
 const advancedAnon=await fetch(base+'/api/lanjutan/portal',{method:'POST',headers:{'Content-Type':'application/json','Origin':`http://localhost:${port}`,'Host':`localhost:${port}`},body:'{}'});assert.equal(advancedAnon.status,503);assert.match(advancedAnon.headers.get('cache-control'),/no-store/);console.log('PASS: portal anonim ditolak tanpa cache');
 const devCsrf=await fetch(base+'/api/pengembangan/feature-save',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.test'},body:'{}'});assert.equal(devCsrf.status,403);console.log('PASS: pengembangan menolak CSRF');
 const devAnon=await fetch(base+'/api/pengembangan/schools',{method:'POST',headers:{'Content-Type':'application/json','Origin':`http://localhost:${port}`,'Host':`localhost:${port}`},body:'{}'});assert.equal(devAnon.status,503);console.log('PASS: sekolah anonim ditolak');
 const offline=await fetch(base+'/offline');assert.equal(offline.status,200);assert.match(await offline.text(),/Ruang offline/);const manifest=await fetch(base+'/manifest.webmanifest');assert.equal((await manifest.json()).display,'standalone');const sw=await fetch(base+'/sw.js');assert.equal(sw.status,200);console.log('PASS: halaman offline, manifest dan service worker');
 const exportAnon=await fetch(base+'/api/laporan/00000000-0000-4000-8000-000000000001?format=xlsx');assert.equal(exportAnon.status,503);assert.match(exportAnon.headers.get('cache-control'),/no-store/);console.log('PASS: ekspor privat tanpa cache dan tertutup');
 const academicAnon=await fetch(base+'/api/akademik/state',{method:'POST',headers:{'Content-Type':'application/json','Origin':`http://localhost:${port}`,'Host':`localhost:${port}`},body:'{}'});assert.equal(academicAnon.status,503);assert.equal((await academicAnon.json()).ok,false);console.log('PASS: API akademik tertutup saat layanan belum dikonfigurasi');
}catch(error){console.error(error);console.error(logs);process.exitCode=1;}finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
