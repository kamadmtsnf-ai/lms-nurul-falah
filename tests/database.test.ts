import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const user="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const sid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const school="00000000-0000-4000-8000-000000000001";
const school2="00000000-0000-4000-8000-000000000002";
test("migrasi PostgreSQL dan pengamanan akses fondasi",async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null,not_after timestamptz);
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
   grant usage on schema public,auth to anon,authenticated,service_role;
   create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  `);
  await db.exec(await readFile('supabase/migrations/20261017152937_foundation.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261017152957_private_storage.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261017153203_foundation_rls_indexes.sql','utf8'));
  await db.exec(await readFile('supabase/seed.sql','utf8'));
  await db.exec(`insert into auth.users values('${user}'),('${other}');
   insert into public.profiles(id,username_normalized,full_name) values('${user}','siswa.1','Siswa Satu'),('${other}','siswa.2','Siswa Dua');
   insert into auth.sessions values('${sid}','${user}',now(),null);
   insert into public.school_memberships(id,school_id,user_id) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${school}','${user}');
   insert into public.schools(id,name) values('${school2}','Sekolah Dua');
   insert into public.academic_years(id,school_id,name,starts_on,ends_on) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${school}','2026/2027','2026-07-01','2027-06-30');
   select set_config('request.jwt.claims','{"sub":"${user}","session_id":"${sid}"}',false);
  `);
  const asUser=async(sql:string)=>{await db.exec('set role authenticated');try{return await db.query(sql);}finally{await db.exec('reset role');}};
  await t.test("akun belum aktivasi hanya membaca profilnya sendiri",async()=>{
   assert.equal((await asUser('select * from public.profiles')).rows.length,1);
   assert.equal((await asUser('select * from public.schools')).rows.length,0);
  });
  await t.test("email belum verifikasi tetap tidak mendapat akses sekolah",async()=>{
   await db.exec(`update public.profiles set must_change_password=false where id='${user}'`);
   assert.equal((await asUser('select * from public.schools')).rows.length,0);
  });
  await t.test("akun aktif hanya membaca sekolah keanggotaannya",async()=>{
   await db.exec(`update public.profiles set contact_email='wali@example.com',email_verified_at=now() where id='${user}'`);
   const result=await asUser('select id from public.schools');
   assert.deepEqual(result.rows,[{id:school}]);
  });
  await t.test("email wali boleh sama pada akun berbeda",async()=>{
   await db.exec(`update public.profiles set contact_email='wali@example.com' where id='${other}'`);
   assert.equal((await db.query(`select id from public.profiles where contact_email='wali@example.com'`)).rows.length,2);
  });
  await t.test("user tidak dapat mengubah status aktivasi atau menambah peran",async()=>{
   await assert.rejects(()=>asUser('update public.profiles set must_change_password=false'),/permission denied/);
   await assert.rejects(()=>asUser(`insert into public.membership_roles values('${school}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin')`),/permission denied/);
  });
  await t.test("token email dan pemetaan admin pusat tidak bisa dibaca user",async()=>{
   await assert.rejects(()=>asUser('select * from private.email_tokens'),/permission denied/);
   await assert.rejects(()=>asUser('select * from private.platform_admins'),/permission denied/);
  });
  await t.test("role pusat ditolak pada penugasan sekolah",async()=>{
   await assert.rejects(()=>db.exec(`insert into public.membership_roles values('${school}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','central_admin')`),/check constraint/);
  });
  await t.test("semester lintas sekolah ditolak foreign key komposit",async()=>{
   await assert.rejects(()=>db.exec(`insert into public.semesters(school_id,academic_year_id,number,starts_on,ends_on) values('${school2}','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'2026-07-01','2026-12-31')`),/foreign key constraint/);
  });
  await t.test("periode terbalik ditolak",async()=>{
   await assert.rejects(()=>db.exec(`insert into public.academic_years(school_id,name,starts_on,ends_on) values('${school}','bad','2027-01-01','2026-01-01')`),/check constraint/);
  });
  await t.test("bucket privat dan batas global 5 MB",async()=>{
   const result=await db.query('select public,file_size_limit from storage.buckets');
   assert.deepEqual(result.rows,[{public:false,file_size_limit:5000000}]);
  });
  await t.test("anggota nonaktif tidak membaca data sekolah",async()=>{
   await db.exec(`update public.school_memberships set status='inactive' where user_id='${user}'`);
   assert.equal((await asUser('select * from public.schools')).rows.length,0);
   await db.exec(`update public.school_memberships set status='active' where user_id='${user}'`);
  });
  await t.test("sesi sebelum penggantian password ditolak walau JWT belum kedaluwarsa",async()=>{
   await db.exec(`update public.profiles set credentials_changed_at=now()+interval '1 second' where id='${user}'`);
   assert.equal((await asUser('select * from public.profiles')).rows.length,0);
   assert.equal((await asUser('select * from public.schools')).rows.length,0);
   await db.exec(`update public.profiles set credentials_changed_at='-infinity' where id='${user}'`);
  });
  await t.test("sesi dicabut kehilangan akses langsung",async()=>{
   await db.exec(`delete from auth.sessions where id='${sid}'`);
   assert.equal((await asUser('select * from public.profiles')).rows.length,0);
  });
  await t.test("anonim tidak dapat membaca profil atau mengakses RPC status server",async()=>{
   await db.exec('set role anon');
   try{await assert.rejects(()=>db.query('select * from public.profiles'),/permission denied/);
    await assert.rejects(()=>db.query('select public.foundation_status()'),/permission denied/);
   }finally{await db.exec('reset role');}
  });
  await t.test("RLS aktif pada seluruh tabel fondasi",async()=>{
   const result=await db.query(`select tablename from pg_tables where schemaname in ('public','private') and not rowsecurity`);
   assert.equal(result.rows.length,0);
  });
 } finally {await db.close();}
});
