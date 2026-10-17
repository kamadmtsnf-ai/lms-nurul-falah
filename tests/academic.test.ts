import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {makeTemplate,readImport,validateXlsxArchive} from '../src/lib/academic/excel';
import {parseEntity} from '../src/lib/academic/config';
import ExcelJS from 'exceljs';
const school='00000000-0000-4000-8000-000000000001',school2='00000000-0000-4000-8000-000000000002';
const admin='11111111-1111-4111-8111-111111111111',teacher='22222222-2222-4222-8222-222222222222',student='33333333-3333-4333-8333-333333333333',guardian='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555';
const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('akademik: transaksi, arsip, impor dan RLS',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null,not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
  grant usage on schema public,auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
  await db.exec(await readFile('supabase/seed.sql','utf8'));
  await db.exec(`insert into public.schools(id,name) values('${school2}','Sekolah Lain');`);
  for(const [id,username,roles] of [[admin,'admin',['admin']],[teacher,'guru.01',['teacher','homeroom_teacher']],[student,'siswa.001',['student']],[guardian,'wali.001',['guardian']],[other,'siswa.002',['student']]] as const){
   await db.query('insert into auth.users values($1)',[id]);await db.query("insert into public.profiles(id,username_normalized,full_name,must_change_password,contact_email,email_verified_at) values($1,$2,$2,false,'wali@example.test',now())",[id,username]);
   const m=await db.query<{id:string}>('insert into public.school_memberships(school_id,user_id) values($1,$2) returning id',[school,id]);for(const role of roles)await db.query('insert into public.membership_roles values($1,$2,$3)',[school,m.rows[0].id,role]);
  }
  await db.query('insert into auth.sessions values($1,$2,now(),null)',[sid,admin]);
  async function as(id=admin){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:sid})]);await db.query('update auth.sessions set user_id=$1 where id=$2',[id,sid]);await db.exec('set role authenticated');}
  async function command(cmd:string,p:Record<string,unknown>={}){const r=await db.query<{r:Record<string,unknown>}>('select public.academic_command($1,$2::jsonb) r',[cmd,JSON.stringify({school,...p})]);return r.rows[0].r;}
  async function save(entity:string,data:Record<string,unknown>){return String((await command('save',{entity,data})).id);}
  async function row(table:string,id:string){await db.exec('reset role');const r=await db.query<{r:Record<string,unknown>}>(`select to_jsonb(t) r from public.${table} t where id=$1`,[id]);await as();return r.rows[0].r;}
  await as();let year='',sem='',grade='',room='',room2='',subject='',curriculum='',enrollment='';
  await t.test('master dan penugasan yang valid tersimpan',async()=>{
   year=await save('academic_years',{name:'2026/2027',starts_on:'2026-07-01',ends_on:'2027-06-30',status:'active'});
   sem=await save('semesters',{academic_year_id:year,number:1,starts_on:'2026-07-01',ends_on:'2026-12-31',status:'active'});
   grade=await save('grade_levels',{number:7,name:'Kelas 7'});room=await save('classrooms',{semester_id:sem,grade_level_id:grade,name:'7A'});room2=await save('classrooms',{semester_id:sem,grade_level_id:grade,name:'7B'});
   subject=await save('subjects',{code:'IPS',name:'Ilmu Pengetahuan Sosial',active:true});curriculum=await save('curriculum_versions',{name:'Kurikulum Merdeka',version:'2026',description:''});
   await save('teaching_classes',{classroom_id:room,subject_id:subject,curriculum_version_id:curriculum,teacher_id:teacher});
   enrollment=await save('student_enrollments',{classroom_id:room,semester_id:sem,student_id:student,status:'active'});
   await save('student_enrollments',{classroom_id:room2,semester_id:sem,student_id:other,status:'active'});
   await save('guardian_students',{guardian_id:guardian,student_id:student,relationship:'Ibu'});
  });
  await t.test('satu rombel aktif dan satu pengampu per mapel',async()=>{
   await assert.rejects(()=>save('student_enrollments',{classroom_id:room2,semester_id:sem,student_id:student,status:'active'}),/duplicate key/);
   await assert.rejects(()=>save('teaching_classes',{classroom_id:room,subject_id:subject,curriculum_version_id:curriculum,teacher_id:teacher}),/duplicate key/);
  });
  await t.test('periode di luar tahun dan semester tumpang tindih ditolak',async()=>{
   await assert.rejects(()=>save('semesters',{academic_year_id:year,number:2,starts_on:'2026-12-01',ends_on:'2027-06-30',status:'draft'}),/bertumpang/);
   await assert.rejects(()=>save('semesters',{academic_year_id:year,number:2,starts_on:'2027-01-01',ends_on:'2027-07-01',status:'draft'}),/Tanggal semester/);
  });
  await t.test('kurikulum terpakai dan peran salah tidak boleh diubah',async()=>{
   const old=await row('curriculum_versions',curriculum);await assert.rejects(()=>save('curriculum_versions',{...old,expected_updated_at:old.updated_at,name:'K13'}),/versi baru/);
   await assert.rejects(()=>save('homeroom_assignments',{classroom_id:room,teacher_id:student}),/Wali Kelas/);
  });
  await t.test('update basi ditolak',async()=>{await assert.rejects(()=>save('subjects',{id:subject,code:'IPS',name:'IPS',active:true,expected_updated_at:'2020-01-01T00:00:00Z'}),/Data berubah/);});
  await t.test('pratinjau dan impor invalid tidak menulis satu baris pun',async()=>{
   const before=await command('state');const preview=await command('preview',{kind:'subjects',rows:[{code:'IPA',name:'IPA'},{code:'IPS',name:'Duplikat'}]});assert.equal((preview.errors as unknown[]).length,1);assert.equal(preview.ticket,undefined);
   const after=await command('state');assert.equal((before.subjects as unknown[]).length,(after.subjects as unknown[]).length);
  });
  await t.test('impor valid sekali pakai dan pengulangan idempoten',async()=>{
   const p=await command('preview',{kind:'subjects',rows:[{code:'IPA',name:'Ilmu Pengetahuan Alam'}]});assert.ok(p.ticket);
   assert.equal((await command('import',{ticket:p.ticket})).count,1);assert.equal((await command('import',{ticket:p.ticket})).committed,true);
   assert.equal(((await command('state')).subjects as unknown[]).length,2);
  });
  await t.test('validasi ulang saat commit mencegah impor setengah tersimpan',async()=>{
   const p=await command('preview',{kind:'subjects',rows:[{code:'BHS',name:'Bahasa Indonesia'},{code:'MTK',name:'Matematika'}]});
   await save('subjects',{code:'MTK',name:'Matematika',active:true});await assert.rejects(()=>command('import',{ticket:p.ticket}),/duplicate key/);
   assert.equal(((await command('state')).subjects as {code:string}[]).some(x=>x.code==='BHS'),false);
  });
  await t.test('username ganda dan peran admin pusat dalam impor ditolak',async()=>{
   const p=await command('preview',{kind:'users',rows:[{username:'baru.001',name:'Baru',roles:['student'],email:''},{username:'baru.001',name:'Baru 2',roles:['student'],email:''}]});assert.equal((p.errors as unknown[]).length,2);
   const q=await command('preview',{kind:'users',rows:[{username:'pusat.001',name:'Pusat',roles:['central_admin'],email:''}]});assert.equal((q.errors as unknown[]).length,1);
  });
  await t.test('guru hanya melihat kelas penugasannya dan tidak dapat mengelola master',async()=>{
   await as(teacher);assert.deepEqual((await db.query('select name from classrooms')).rows,[{name:'7A'}]);await assert.rejects(()=>command('state'),/Hanya admin/);
  });
  await t.test('wali hanya membaca keanggotaan anak tertaut',async()=>{
   await as(guardian);assert.deepEqual((await db.query('select student_id from student_enrollments')).rows,[{student_id:student}]);assert.equal((await db.query('select * from student_details')).rows.length,0);
  });
  await t.test('siswa tidak melihat keanggotaan siswa lain',async()=>{
   await as(student);assert.deepEqual((await db.query('select student_id from student_enrollments')).rows,[{student_id:student}]);await assert.rejects(()=>db.query('insert into subjects(school_id,code,name) values($1,$2,$3)',[school,'X','Test']),/permission denied/);
  });
  await t.test('data lintas sekolah dan RPC anonim ditolak',async()=>{
   await as();await assert.rejects(()=>command('state',{school:school2}),/Hanya admin/);
   await db.exec('set role anon');await assert.rejects(()=>command('state'),/permission denied/);await as();
  });
  await t.test('impor akun atomik dengan lease dan aktivasi tetap wajib',async()=>{
   const p=await command('preview',{kind:'users',rows:[{username:'baru.001',name:'Siswa Baru',roles:['student'],email:'wali@example.test'}]});
   const claimed=await command('claim',{ticket:p.ticket});const rows=claimed.rows as {_id:string}[];assert.equal(rows.length,1);
   await assert.rejects(()=>command('claim',{ticket:p.ticket}),/sedang diproses/);
   await db.exec('reset role');await db.query('insert into auth.users values($1)',[rows[0]._id]);await as();
   await assert.rejects(()=>command('commit-users',{ticket:p.ticket,lease:'00000000-0000-4000-8000-000000000099'}),/tidak valid/);
   assert.equal((await command('commit-users',{ticket:p.ticket,lease:claimed.lease})).count,1);
   assert.equal((await command('claim',{ticket:p.ticket})).committed,true);
   await db.exec('reset role');const record=await db.query<{must_change_password:boolean;email_verified_at:null}>('select must_change_password,email_verified_at from profiles where id=$1',[rows[0]._id]);assert.equal(record.rows[0].must_change_password,true);assert.equal(record.rows[0].email_verified_at,null);await as();
  });
  await t.test('banyak peran tidak memperluas lingkup mapel wali atau guru',async()=>{
   // Guru punya peran wali kelas tetapi belum ditugaskan sebagai wali rombel ini.
   const extra=await save('subjects',{code:'TIK',name:'Informatika',active:true});
   await db.exec('reset role');const m=await db.query<{id:string}>('select id from school_memberships where school_id=$1 and user_id=$2',[school,other]);await db.query("insert into membership_roles values($1,$2,'teacher')",[school,m.rows[0].id]);await as();
   await save('teaching_classes',{classroom_id:room,subject_id:extra,curriculum_version_id:curriculum,teacher_id:other});
   await save('teaching_classes',{classroom_id:room2,subject_id:extra,curriculum_version_id:curriculum,teacher_id:other});
   await as(teacher);assert.equal((await db.query('select * from teaching_classes')).rows.length,1);
   await as();await db.exec('reset role');const gm=await db.query<{id:string}>('select id from school_memberships where school_id=$1 and user_id=$2',[school,guardian]);await db.query("insert into membership_roles values($1,$2,'duty_teacher')",[school,gm.rows[0].id]);await as();
   const duty=await save('duty_assignments',{teacher_id:guardian,starts_on:'2026-01-01',ends_on:'2027-12-31',active:true});
   await as(guardian);assert.equal((await db.query('select * from classrooms')).rows.length,2);assert.equal((await db.query('select * from teaching_classes')).rows.length,2);
   await as();const d=await row('duty_assignments',duty);await save('duty_assignments',{...d,active:false,expected_updated_at:d.updated_at});
  });
  await t.test('menonaktifkan tautan wali langsung menutup akses anak',async()=>{
   const links=(await command('state')).guardian_students as Record<string,unknown>[];const g=links[0];
   await save('guardian_students',{...g,active:false,expected_updated_at:g.updated_at});await as(guardian);assert.equal((await db.query('select * from classrooms')).rows.length,0);assert.equal((await db.query('select * from student_enrollments')).rows.length,0);
   await as();const fresh=await row('guardian_students',String(g.id));await save('guardian_students',{...fresh,active:true,expected_updated_at:fresh.updated_at});
  });
  await t.test('akun belum aktivasi dan sesi usang menolak RPC akademik',async()=>{
   await db.exec('reset role');await db.query('update profiles set must_change_password=true where id=$1',[admin]);await as();await assert.rejects(()=>command('state'),/aktivasi/);
   await db.exec('reset role');await db.query("update profiles set must_change_password=false,credentials_changed_at=now()+interval '1 second' where id=$1",[admin]);await as();await assert.rejects(()=>command('state'),/Sesi/);
   await db.exec('reset role');await db.query("update profiles set credentials_changed_at='-infinity' where id=$1",[admin]);await as();
  });
  await t.test('arsip menutup mutasi tanpa menghapus anggota masa lalu',async()=>{
   const old=await row('semesters',sem);await save('semesters',{...old,status:'archived',expected_updated_at:old.updated_at});
   await assert.rejects(()=>save('classrooms',{semester_id:sem,grade_level_id:grade,name:'7C'}),/diarsipkan/);
   const e=await row('student_enrollments',enrollment);await assert.rejects(()=>save('student_enrollments',{...e,status:'inactive',expected_updated_at:e.updated_at}),/diarsipkan/);
   assert.equal(((await command('state')).student_enrollments as unknown[]).length,2);
  });
 }finally{await db.close();}
});
test('template Excel, nol awal, formula dan batas berkas',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await makeTemplate('students') as unknown as Parameters<typeof wb.xlsx.load>[0]);
 wb.getWorksheet('Data')!.addRow(['siswa.001','0001','2026/2027','1','7A']);
 const result=await readImport(Buffer.from(await wb.xlsx.writeBuffer()),'students');assert.equal(result.rows[0].student_number,'0001');
 wb.getWorksheet('Data')!.getCell('A2').value={formula:'1+1',result:2};assert.equal((await readImport(Buffer.from(await wb.xlsx.writeBuffer()),'students')).errors.length,1);
 assert.throws(()=>validateXlsxArchive(Buffer.alloc(2_000_001)),/2 MB/);assert.throws(()=>validateXlsxArchive(Buffer.from('not an Excel file')),/tidak valid/);
 assert.throws(()=>parseEntity('subjects',{code:'X',name:'X',active:'true'}));
});
