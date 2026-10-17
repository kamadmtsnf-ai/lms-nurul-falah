import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {validateFile} from '../src/lib/learning/file-validation';
const school='00000000-0000-4000-8000-000000000001';
test('kuis: snapshots, autosave, deadline, finalisasi, privasi dan laporan',async t=>{
 const db=new PGlite();const ids=Object.fromEntries(['admin','teacher','student','other','guardian','duty','homeroom','outsider'].map(k=>[k,randomUUID()]));const sessions=Object.fromEntries(Object.keys(ids).map(k=>[k,randomUUID()]));
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null,not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
  grant usage on schema public,auth to anon,authenticated,service_role;create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${f}`,'utf8'));
  await db.exec(await readFile('supabase/seed.sql','utf8'));
  const roles:Record<string,string[]>={admin:['admin'],teacher:['teacher'],student:['student'],other:['student'],guardian:['guardian'],duty:['duty_teacher'],homeroom:['homeroom_teacher'],outsider:['teacher']};
  for(const [key,id] of Object.entries(ids)){
   await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles(id,username_normalized,full_name,contact_email,email_verified_at,must_change_password) values($1,$2,$2,'wali@example.test',now(),false)",[id,key]);await db.query('insert into auth.sessions values($1,$2,now(),null)',[sessions[key],id]);const m=await db.query<{id:string}>('insert into school_memberships(school_id,user_id) values($1,$2) returning id',[school,id]);for(const role of roles[key])await db.query('insert into membership_roles values($1,$2,$3)',[school,m.rows[0].id,role]);
  }
  async function as(key:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids[key],session_id:sessions[key],role:'authenticated'})]);await db.exec('set role authenticated');}
  async function ac(entity:string,data:Record<string,unknown>){const r=await db.query<{v:{id:string}}>('select public.academic_command($1,$2::jsonb) v',['save',JSON.stringify({school,entity,data})]);return r.rows[0].v.id;}
  await as('admin');const year=new Date().getUTCFullYear();const y=await ac('academic_years',{name:String(year),starts_on:`${year}-01-01`,ends_on:`${year}-12-31`,status:'active'});const sem=await ac('semesters',{academic_year_id:y,number:1,starts_on:`${year}-01-01`,ends_on:`${year}-12-31`,status:'active'});const gr=await ac('grade_levels',{number:7,name:'7'});const room=await ac('classrooms',{semester_id:sem,grade_level_id:gr,name:'7A'});const room2=await ac('classrooms',{semester_id:sem,grade_level_id:gr,name:'7B'});const subject=await ac('subjects',{code:'IPS',name:'IPS',active:true});const cur=await ac('curriculum_versions',{name:'Merdeka',version:'1',description:''});const course=await ac('teaching_classes',{classroom_id:room,subject_id:subject,curriculum_version_id:cur,teacher_id:ids.teacher});const course2=await ac('teaching_classes',{classroom_id:room2,subject_id:subject,curriculum_version_id:cur,teacher_id:ids.outsider});
  for(const who of ['student','other'])await ac('student_enrollments',{classroom_id:room,semester_id:sem,student_id:ids[who],status:'active'});await ac('homeroom_assignments',{classroom_id:room,teacher_id:ids.homeroom});await ac('guardian_students',{guardian_id:ids.guardian,student_id:ids.student,relationship:'Ibu',active:true});const duty=await ac('duty_assignments',{semester_id:sem,teacher_id:ids.duty,weekdays:[1,2,3,4,5,6,7],active:true});
  async function cmd(action:string,p:Record<string,unknown>={}){const r=await db.query<{v:any}>('select public.quiz_command($1,$2::jsonb) v',[action,JSON.stringify({course,...p})]);return r.rows[0].v;}
  async function state(){return cmd('course');}
  const now=new Date(),past=new Date(now.getTime()-60000).toISOString(),future=new Date(now.getTime()+3600000).toISOString();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

  const questions=[{kind:'choice',prompt:'Dua tambah dua?',options:['3','4','5'],correct:1,explanation:'2+2=4',points:2},{kind:'boolean',prompt:'Bumi bulat',options:['Benar','Salah'],correct:0,explanation:'Bumi berbentuk hampir bulat.',points:1}];
  const data={title:'Kuis IPS',instructions:'Pilih jawaban.',status:'published',opens_at:past,closes_at:future,duration_minutes:30,questions};let quiz='',attempt='',second='';
  await t.test('guru membuat, draf tersembunyi dan akses lintas kelas ditolak',async()=>{
   await as('teacher');quiz=(await cmd('save',{data})).id;await cmd('save',{data:{...data,title:'Kuis draf',status:'draft'}});assert.equal((await cmd('list')).quizzes.length,2);
   await as('student');assert.equal((await cmd('list')).quizzes.length,1);await assert.rejects(()=>cmd('edit',{target:quiz}),/pengampu/);await assert.rejects(()=>cmd('save',{data}),/pengampu/);await as('outsider');await assert.rejects(()=>cmd('list'),/diakses/);await as('duty');await assert.rejects(()=>cmd('list'),/diakses/);
  });
  await t.test('start berulang, snapshot tanpa kunci dan satu percobaan',async()=>{
   await as('student');const a=await cmd('start',{target:quiz});attempt=a.id;assert.equal(a.questions.length,2);assert.equal(a.questions[0].correct,undefined);assert.equal(a.questions[0].explanation,undefined);assert.equal(a.score,null);assert.equal((await cmd('start',{target:quiz})).id,attempt);
   await as('teacher');const q=await cmd('edit',{target:quiz});await assert.rejects(()=>cmd('save',{target:quiz,data:{...data,expected_updated_at:q.updated_at}}),/dikunci/);
   await as('other');await assert.rejects(()=>cmd('attempt',{target:attempt}),/diakses/);second=(await cmd('start',{target:quiz})).id;
  });
  await t.test('autosave idempoten, revisi konflik dan validasi atomik',async()=>{
   await as('student');const request_id=randomUUID();const p={target:attempt,request_id,revision:0,answers:[{position:1,choice:1}]};const a=await cmd('answers',p);assert.equal(a.revision,1);assert.equal(a.answers[0].choice,1);assert.equal((await cmd('answers',p)).revision,1);
   await assert.rejects(()=>cmd('answers',{...p,answers:[{position:1,choice:0}]}),/dipakai ulang/);
   await assert.rejects(()=>cmd('answers',{...p,request_id:randomUUID()}),/perangkat lain/);
   await assert.rejects(()=>cmd('answers',{target:attempt,request_id:randomUUID(),revision:1,answers:[{position:1,choice:0},{position:2,choice:8}]}),/tidak valid/);assert.equal((await cmd('attempt',{target:attempt})).answers[0].choice,1);
   await assert.rejects(()=>cmd('answers',{target:attempt,request_id:randomUUID(),revision:1,answers:[{position:1,choice:1},{position:1,choice:0}]}),/ganda/);
   assert.equal((await cmd('answers',{target:attempt,request_id:randomUUID(),revision:1,answers:[{position:2,choice:0}]})).revision,2);
  });
  await t.test('finalisasi berulang, nilai tersembunyi dan izin rilis',async()=>{
   await as('student');await assert.rejects(()=>cmd('finish',{target:attempt,revision:0}),/Simpan/);const a=await cmd('finish',{target:attempt,revision:2});assert.equal(a.status,'submitted');assert.equal(a.score,null);assert.equal(a.questions[0].correct,undefined);assert.equal((await cmd('finish',{target:attempt,revision:2})).finished_at,a.finished_at);assert.equal((await cmd('answers',{target:attempt,revision:2,request_id:randomUUID(),answers:[{position:1,choice:0}]})).revision,2);
   await as('teacher');const review=await cmd('attempt',{target:attempt});assert.equal(review.score,3);assert.equal(review.questions[0].correct,1);let q=await cmd('edit',{target:quiz});await cmd('release',{target:quiz,data:{grades_visible:true,explanations_visible:true,expected_updated_at:q.updated_at}});
   await as('student');const visible=await cmd('attempt',{target:attempt});assert.equal(visible.score,3);assert.equal(visible.questions[0].correct,undefined);assert.equal(visible.review_visible,false);
  });
  await t.test('deadline server, sambung ulang dan penolakan jawaban terlambat',async()=>{
   await as('other');await cmd('answers',{target:second,request_id:randomUUID(),revision:0,answers:[{position:1,choice:0}]});await db.exec('reset role');await db.query("update learning_quiz_attempts set deadline=clock_timestamp()-interval '1 second' where id=$1",[second]);await db.query("update learning_quizzes set closes_at=clock_timestamp()-interval '1 second' where id=$1",[quiz]);await as('other');const late=await cmd('answers',{target:second,request_id:randomUUID(),revision:1,answers:[{position:1,choice:1}]});assert.equal(late.status,'expired');assert.equal(late.score,0);assert.equal(late.revision,1);assert.equal(late.answers[0].choice,0);
   await as('student');const a=await cmd('attempt',{target:attempt});assert.equal(a.questions[0].correct,1);assert.equal(a.review_visible,true);
  });
  await t.test('laporan berizin, wali hanya anak tertaut dan tanpa jawaban',async()=>{
   await as('teacher');let r=await cmd('report');assert.equal(r.rows.length,2);assert.equal(r.quizzes.length,2);assert.equal(r.rows.find((x:any)=>x.id===ids.student).quiz_average,100);assert.equal(JSON.stringify(r).includes('correct'),false);await as('guardian');r=await cmd('report');assert.equal(r.rows.length,1);assert.equal(r.rows[0].id,ids.student);assert.equal(r.quizzes.length,1);await assert.rejects(()=>cmd('attempt',{target:attempt}),/diakses/);
   await as('teacher');const q=await cmd('edit',{target:quiz});await cmd('release',{target:quiz,data:{grades_visible:false,explanations_visible:false,expected_updated_at:q.updated_at}});await as('guardian');r=await cmd('report');assert.equal(r.quizzes[0].score,null);assert.equal(r.rows[0].quiz_average,null);
  });
  await t.test('waktu buka, semester arsip dan tabel privat',async()=>{
   await as('teacher');const futureQuiz=(await cmd('save',{data:{...data,opens_at:future,closes_at:new Date(Date.now()+7200000).toISOString()}})).id;await as('student');await assert.rejects(()=>cmd('start',{target:futureQuiz}),/belum dibuka/);await assert.rejects(()=>db.query('select * from private.quiz_questions'),/permission denied/);await assert.rejects(()=>db.query('select * from public.learning_quiz_attempts'),/permission denied/);await db.exec('reset role');await db.query("update semesters set status='archived' where id=$1",[sem]);await as('teacher');await assert.rejects(()=>cmd('save',{data}),/diarsipkan/);assert.equal((await cmd('report')).rows.length,2);await as('student');assert.equal((await cmd('attempt',{target:attempt})).status,'submitted');await db.exec('set role anon');await assert.rejects(()=>cmd('list'),/permission denied/);
  });
 }finally{await db.close();}
});
