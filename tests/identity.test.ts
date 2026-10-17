import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {makeToken,hashToken,sameSecret,validOrigin} from '../src/lib/auth/security';
import {passwordPair,rolesSchema,usernameSchema,nextFor} from '../src/lib/auth/validation';
import {passwordFlow} from '../src/lib/auth/password-flow';
const school='00000000-0000-4000-8000-000000000001',admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222';
const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sid2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('workflow akun di PostgreSQL',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;create table auth.users(id uuid primary key);
  create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null,not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
  grant usage on schema public,auth to anon,authenticated,service_role;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
  await db.exec(await readFile('supabase/seed.sql','utf8'));
  await db.exec(`insert into auth.users values('${admin}'),('${student}');`);
  async function command<T=Record<string,unknown>>(cmd:string,p:Record<string,unknown>={}){await db.exec('set role service_role');try{const r=await db.query<{result:T}>('select public.identity_command($1,$2::jsonb) as result',[cmd,JSON.stringify(p)]);return r.rows[0].result;}finally{await db.exec('reset role');}}
  let claim:{nonce:string};
  await t.test('bootstrap sekali pakai lalu terkunci',async()=>{
   claim=await command<{nonce:string}>('bootstrap_claim',{school});
   await assert.rejects(()=>command('bootstrap_claim',{school}));
   await command('bootstrap_finish',{school,nonce:claim.nonce,target:admin,username:'admin',name:'Admin Uji'});
   await assert.rejects(()=>command('bootstrap_claim',{school}));
   const r=await db.query<{must_change_password:boolean;email_verified_at:null}>('select must_change_password,email_verified_at from public.profiles');assert.equal(r.rows[0].must_change_password,true);assert.equal(r.rows[0].email_verified_at,null);
  });
  await db.exec(`update public.profiles set must_change_password=false,contact_email='wali@example.test',email_verified_at=now() where id='${admin}';insert into auth.sessions values('${sid}','${admin}',now(),null);`);
  const actor={actor:admin,session:sid,school};
  await t.test('pembatasan atomik menolak percobaan di atas batas',async()=>{for(let i=0;i<3;i++)assert.equal((await command('rate',{key:'test',limit:3,seconds:60})).allowed,true);assert.equal((await command('rate',{key:'test',limit:3,seconds:60})).allowed,false);});
  await t.test('RPC istimewa tidak dapat dieksekusi pengguna atau anonim',async()=>{
   for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{await assert.rejects(()=>db.query("select public.identity_command('lookup','{}')"),/permission denied/);}finally{await db.exec('reset role');}}
  });
  await t.test('admin membuat akun dengan email wali yang sama dan beberapa peran',async()=>{
   await command('admin_attach',{...actor,target:student,username:'siswa.1',name:'Siswa Uji',email:'wali@example.test',roles:['student','guardian']});
   const r=await command<unknown[]>('admin_list',actor);assert.equal(r.length,2);
   await db.exec(`insert into auth.sessions values('${sid2}','${student}',now(),null);`);
  });
  await t.test('akun belum aktivasi dan nonadmin tidak mengelola pengguna',async()=>{
   await assert.rejects(()=>command('admin_list',{actor:student,session:sid2,school}));
   await assert.rejects(()=>command('email_issue',{actor:student,session:sid2,email:'wali@example.test',hash:hashToken('x')}));
  });
  await t.test('admin sekolah tidak memberikan peran pusat atau menghapus admin terakhir',async()=>{
   await assert.rejects(()=>command('admin_update',{...actor,target:student,roles:['central_admin'],status:'active'}));
   await assert.rejects(()=>command('admin_update',{...actor,target:admin,roles:['teacher'],status:'active'}));
   await assert.rejects(()=>command('admin_update',{...actor,target:admin,roles:['admin'],status:'disabled'}));
  });
  await t.test('email diverifikasi per akun, token gagal kirim dan token salah akun ditolak',async()=>{
   await db.exec(`update public.profiles set must_change_password=false where id='${student}';`);
   const token=makeToken();const ticket=await command<{id:string}>('email_issue',{actor:student,session:sid2,email:'wali@example.test',hash:hashToken(token)});
   await assert.rejects(()=>command('email_confirm',{actor:student,session:sid2,hash:hashToken(token)}));
   await command('mail_sent',{token_id:ticket.id});
   await assert.rejects(()=>command('email_confirm',{...actor,hash:hashToken(token)}));
   await command('email_confirm',{actor:student,session:sid2,hash:hashToken(token)});
   await assert.rejects(()=>command('email_confirm',{actor:student,session:sid2,hash:hashToken(token)}));
   const f=makeToken();const failed=await command<{id:string}>('email_issue',{actor:student,session:sid2,email:'wali@example.test',hash:hashToken(f)});await command('mail_failed',{token_id:failed.id});await assert.rejects(()=>command('email_confirm',{actor:student,session:sid2,hash:hashToken(f)}));
   await db.exec(`update public.profiles set email_verified_at=now() where id='${student}';`);
  });
  await t.test('pengguna yang sudah aktif tetapi bukan admin tetap ditolak',async()=>{await assert.rejects(()=>command('admin_list',{actor:student,session:sid2,school}));});
  await t.test('token kedaluwarsa ditolak',async()=>{
   const tok=makeToken();const ticket=await command<{id:string}>('reset_issue',{target:student,hash:hashToken(tok)});await command('mail_sent',{token_id:ticket.id});
   await db.exec(`update private.email_tokens set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id='${ticket.id}'`);
   await assert.rejects(()=>command('reset_claim',{hash:hashToken(tok)}));
  });
  await t.test('reset mengonsumsi token dan memutus akses sesi lama sebelum password berubah',async()=>{
   const tok=makeToken();const ticket=await command<{id:string}>('reset_issue',{target:student,hash:hashToken(tok)});await command('mail_sent',{token_id:ticket.id});
   const lock=await command<{target:string;nonce:string}>('reset_claim',{hash:hashToken(tok)});
   await assert.rejects(()=>command('reset_claim',{hash:hashToken(tok)}));
   await assert.rejects(()=>command('password_finish',{target:student,nonce:makeToken().slice(0,36)}));
   await command('password_finish',lock);
   await db.exec(`select set_config('request.jwt.claims','{"sub":"${student}","session_id":"${sid2}"}',false);set role authenticated;`);
   try{assert.equal((await db.query('select * from public.profiles')).rows.length,0);assert.equal((await db.query('select * from public.schools')).rows.length,0);}finally{await db.exec('reset role');}
   const row=await db.query<{must_change_password:boolean}>('select must_change_password from public.profiles where id=$1',[student]);assert.equal(row.rows[0].must_change_password,false);
  });
  await t.test('sesi baru setelah perubahan mendapat akses, password awal tetap mewajibkan perubahan',async()=>{
   const ns='cccccccc-cccc-4ccc-8ccc-cccccccccccc';await db.exec(`insert into auth.sessions values('${ns}','${student}',clock_timestamp()+interval '1 second',null);`);
   await command('force_default',{actor:student,session:ns});
   const r=await db.query<{must_change_password:boolean}>('select must_change_password from public.profiles where id=$1',[student]);assert.equal(r.rows[0].must_change_password,true);
  });
 }finally{await db.close();}
});
test('validasi username, password, peran dan urutan aktivasi',()=>{
 assert.equal(usernameSchema.parse(' SISWA.01 '),'siswa.01');assert.throws(()=>usernameSchema.parse('x;drop table'));
 assert.throws(()=>passwordPair({password:'12345678',confirm:'12345678'}));assert.throws(()=>passwordPair({password:'PasswordBaru',confirm:'TidakSama'}));
 assert.throws(()=>rolesSchema.parse(['central_admin']));
 assert.equal(nextFor({must_change_password:true,email_verified_at:null}),'/ganti-password');assert.equal(nextFor({must_change_password:false,email_verified_at:null}),'/verifikasi');
 const token=makeToken();assert.equal(token.length,43);assert.equal(hashToken(token).length,64);assert.equal(sameSecret('abc','abc'),true);assert.equal(sameSecret('abc','def'),false);
 assert.equal(validOrigin('https://evil.test','https://lms.test/api','https://lms.test'),false);assert.equal(validOrigin(null,'https://lms.test/api'),false);assert.equal(validOrigin('https://lms.test','https://lms.test/api','https://lms.test'),true);
});
test('perubahan password mewajibkan pemutusan sesi sebelum aktivasi dibuka',async()=>{
 const seen:string[]=[];await passwordFlow({begin:async()=>{seen.push('block');return 'nonce';},update:async()=>{seen.push('password');},revoke:async()=>{seen.push('revoke');},finish:async()=>{seen.push('finish');},clear:async()=>{seen.push('clear');}});assert.deepEqual(seen,['block','password','revoke','finish','clear']);
 const failed:string[]=[];await assert.rejects(()=>passwordFlow({begin:async()=>1,update:async()=>{throw Error('provider failed');},revoke:async()=>{failed.push('revoke');},finish:async()=>{failed.push('unsafe');},clear:async()=>{failed.push('clear');}}));assert.deepEqual(failed,['clear']);
});
