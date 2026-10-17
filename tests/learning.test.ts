import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {validateFile} from '../src/lib/learning/file-validation';
const school='00000000-0000-4000-8000-000000000001';
test('pembelajaran: guru, siswa, wali, piket, versi, nilai dan storage',async t=>{
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
  async function cmd(action:string,p:Record<string,unknown>={}){const r=await db.query<{v:any}>('select public.learning_command($1,$2::jsonb) v',[action,JSON.stringify({course,...p})]);return r.rows[0].v;}
  async function state(){return cmd('course');}
  const now=new Date(),past=new Date(now.getTime()-60000).toISOString(),future=new Date(now.getTime()+3600000).toISOString();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  let meeting='',material='',task='',first='',asset='';
  const taskData={title:'Tugas IPS',instructions:'Jelaskan interaksi sosial.',formats:['text','file','link'],due_at:future,accept_late:false,max_score:100,status:'published',publish_at:null};
  await t.test('guru membuat pertemuan, materi draf dan tugas',async()=>{
   await as('teacher');meeting=(await cmd('meeting-save',{data:{title:'Pertemuan 1',starts_at:past}})).id;material=(await cmd('material-save',{data:{title:'Materi Interaksi',meeting_id:meeting,body:'Materi privat',links:['https://example.com/video'],status:'draft',publish_at:null}})).id;task=(await cmd('assignment-save',{data:taskData})).id;assert.equal((await state()).meeting_roster.length,2);
  });
  await t.test('draf dan publikasi terjadwal dilindungi waktu server',async()=>{
   await as('student');assert.equal((await state()).materials.length,0);await as('teacher');let m=(await state()).materials[0];await cmd('material-save',{target:material,data:{...m,status:'scheduled',publish_at:future,expected_updated_at:m.updated_at}});await as('student');assert.equal((await state()).materials.length,0);
   await as('teacher');m=(await state()).materials[0];await cmd('material-save',{target:material,data:{...m,status:'scheduled',publish_at:past,expected_updated_at:m.updated_at}});await as('student');assert.equal((await state()).materials.length,1);
  });
  await t.test('guru lain, piket dan siswa tidak dapat mengubah kursus',async()=>{
   await as('outsider');await assert.rejects(()=>state(),/diakses/);assert.equal((await cmd('catalog')).some((c:any)=>c.id===course),false);
   await as('duty');await assert.rejects(()=>state(),/diakses/);await as('student');await assert.rejects(()=>cmd('meeting-save',{data:{title:'Palsu',starts_at:past}}),/Hanya guru/);
  });
  await t.test('absensi pertemuan tidak menjadikan siswa kosong sebagai alpa',async()=>{
   await as('teacher');await cmd('meeting-attendance',{target:meeting,entries:[{student:ids.student,status:'present',revision:0}]});assert.equal((await state()).attendance.length,1);
   await assert.rejects(()=>cmd('meeting-attendance',{target:meeting,entries:[{student:ids.student,status:'sick',revision:1}]}),/alasan/);
   await cmd('meeting-attendance',{target:meeting,entries:[{student:ids.student,status:'sick',revision:1,reason:'Koreksi surat sakit'}]});await assert.rejects(()=>cmd('meeting-attendance',{target:meeting,entries:[{student:ids.student,status:'present',revision:1,reason:'Koreksi lagi'}]}),/berubah/);
  });
  await t.test('piket harian terpisah dan mengikuti hari jadwal',async()=>{
   await as('duty');const daily={school,classroom:room,date:today};await cmd('daily-save',{...daily,entries:[{student:ids.student,status:'present',revision:0}]});await as('teacher');assert.equal((await state()).attendance[0].status,'sick');assert.equal((await state()).daily[0].status,'present');await assert.rejects(()=>cmd('daily-save',{...daily,entries:[{student:ids.other,status:'present',revision:0}]}),/bertugas/);
   await as('admin');const s=await db.query<{v:any}>("select public.academic_command('state',$1::jsonb) v",[JSON.stringify({school})]);const old=s.rows[0].v.duty_assignments[0];const wrongDay=(new Date(today+'T00:00:00Z').getUTCDay()||7)%7+1;await ac('duty_assignments',{...old,weekdays:[wrongDay],expected_updated_at:old.updated_at});await as('duty');await assert.rejects(()=>cmd('daily-save',{...daily,entries:[{student:ids.other,status:'present',revision:0}]}),/penugasan|bertugas/);
  });
  await t.test('pengumpulan idempoten, versi immutable dan konflik tab',async()=>{
   await as('student');first=randomUUID();const data={request_id:first,revision:0,body:'Jawaban versi pertama',links:[],asset_ids:[]};await cmd('submit',{target:task,data});assert.equal((await cmd('submit',{target:task,data})).repeated,true);await assert.rejects(()=>cmd('submit',{target:task,data:{...data,request_id:randomUUID()}}),/berubah/);assert.equal((await state()).submissions.length,1);
  });
  await t.test('nilai ditutup sampai guru merilis, wali hanya anak tertaut',async()=>{
   await as('teacher');await cmd('grade',{target:first,data:{score:85,feedback:'Baik'}});await as('student');assert.equal((await state()).grades.length,0);await as('guardian');assert.equal((await state()).grades.length,0);assert.equal((await state()).submissions.length,0);assert.equal((await state()).roster.length,1);
   await as('teacher');const a=(await state()).assignments[0];await cmd('release-grades',{target:task,data:{visible:true,expected_updated_at:a.updated_at}});await as('student');assert.equal((await state()).grades[0].score,85);await as('other');assert.equal((await state()).grades.length,0);await as('guardian');assert.equal((await state()).grades[0].student_id,ids.student);
  });
  await t.test('admin harus memberi alasan dan skor tidak melebihi maksimum',async()=>{
   await as('admin');await assert.rejects(()=>cmd('grade',{target:first,data:{score:90}}),/alasan/);await as('teacher');await assert.rejects(()=>cmd('grade',{target:first,data:{score:101}}),/maksimum/);
  });
  await t.test('revisi menghasilkan versi baru dan tidak mewarisi nilai lama',async()=>{
   await as('student');await cmd('submit',{target:task,data:{request_id:randomUUID(),revision:1,body:'Jawaban revisi',links:[],asset_ids:[]}});const s=(await state()).submissions[0];assert.equal(s.version,2);assert.equal((await state()).grades.length,0);const history=await cmd('history',{target:s.id});assert.equal(history.length,2);assert.equal(history[1].body,'Jawaban versi pertama');await as('teacher');await assert.rejects(()=>cmd('grade',{target:first,data:{score:90}}),/terbaru/);
  });
  await t.test('deadline, format jawaban dan tautan tidak aman ditolak',async()=>{
   await as('teacher');const late=(await cmd('assignment-save',{data:{...taskData,title:'Lewat tenggat',formats:['text'],due_at:past}})).id;await as('student');await assert.rejects(()=>cmd('submit',{target:late,data:{request_id:randomUUID(),revision:0,body:'Terlambat',links:[],asset_ids:[]}}),/sudah lewat/);
   await assert.rejects(()=>cmd('submit',{target:task,data:{request_id:randomUUID(),revision:2,body:'',links:['javascript:alert(1)'],asset_ids:[]}}),/HTTPS/);
  });
  await t.test('berkas pending tidak dapat dibuka; completion memerlukan bukti server',async()=>{
   await as('student');const f=await cmd('asset-reserve',{data:{target_type:'submission',target_id:task,name:'jawaban.pdf',kind:'document',mime:'application/pdf',bytes:10}});asset=f.id;await assert.rejects(()=>cmd('asset-info',{target:asset}),/diakses/);
   await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata) values('lms-private',$1,$2::jsonb)",[f.path,JSON.stringify({size:10,mimetype:'application/pdf'})]);await as('student');await assert.rejects(()=>cmd('asset-complete',{target:asset}),/diverifikasi/);
   await assert.rejects(()=>db.query('select public.learning_asset_attest($1,$2)',[asset,randomUUID()]),/permission denied/);
   const proof=randomUUID();await db.exec('reset role');await db.query('select public.learning_asset_attest($1,$2)',[asset,proof]);await as('student');await cmd('asset-complete',{target:asset,check:proof});
   await as('teacher');await assert.rejects(()=>cmd('asset-info',{target:asset}),/diakses/);await as('other');await assert.rejects(()=>cmd('submit',{target:task,data:{request_id:randomUUID(),revision:0,body:'',links:[],asset_ids:[asset]}}),/Lampiran/);
   await as('student');await cmd('submit',{target:task,data:{request_id:randomUUID(),revision:2,body:'Jawaban file',links:[],asset_ids:[asset]}});await as('teacher');assert.equal((await cmd('asset-info',{target:asset})).id,asset);
  });
  await t.test('wali kelas membaca rekap tanpa mengubah absensi/isi jawaban',async()=>{
   await as('homeroom');const v=await state();assert.equal(v.roster.length,2);assert.equal(v.attendance.length,1);assert.equal(v.submissions.length,0);assert.equal((await cmd('daily',{school,classroom:room,date:today})).can_write,false);await assert.rejects(()=>cmd('meeting-attendance',{target:meeting,entries:[{student:ids.other,status:'present',revision:0}]}),/Hanya guru/);
  });
  await t.test('tabel langsung, sesi nonaktif dan kelas lain tetap tertutup',async()=>{
   await as('student');await assert.rejects(()=>db.query('select * from learning_grades'),/permission denied/);await assert.rejects(()=>cmd('course',{course:course2}),/diakses/);await db.exec('reset role');await db.query('update profiles set must_change_password=true where id=$1',[ids.student]);await as('student');await assert.rejects(()=>state(),/aktivasi/);await db.exec('reset role');await db.query('update profiles set must_change_password=false where id=$1',[ids.student]);
   await db.exec('set role anon');await assert.rejects(()=>cmd('catalog'),/permission denied/);
  });
  await t.test('detail jawaban, rekap agregat dan halaman lama tetap dapat dibaca',async()=>{
   await as('teacher');const snapshot=await state();const latest=snapshot.submissions[0];assert.equal(latest.body,'');const detail=await cmd('submission-detail',{target:latest.id});assert.equal(detail.body,'Jawaban file');assert.equal(detail.assets.length,1);
   await as('guardian');await assert.rejects(()=>cmd('submission-detail',{target:latest.id}),/diakses/);
   await as('homeroom');const report=await cmd('daily-report',{school,classroom:room,from:today,to:today});assert.equal(report.records[0].count,1);assert.equal(report.records[0].status,'present');
   await as('teacher');for(let i=0;i<21;i++)await cmd('material-save',{data:{title:'Materi tambahan '+i,meeting_id:meeting,body:'Isi',links:[],status:'published',publish_at:null}});
   assert.equal((await state()).materials.length,20);assert.equal((await state()).has_more,true);const older=await cmd('course',{offset:20});assert.equal(older.materials.length,2);assert.equal(older.offset,20);
  });
  await t.test('semester arsip menghentikan seluruh mutasi tetapi menyimpan riwayat',async()=>{
   await db.exec('reset role');await db.query("update semesters set status='archived' where id=$1",[sem]);await as('teacher');assert.equal((await state()).meetings.length,1);await assert.rejects(()=>cmd('meeting-sync',{target:meeting}),/arsip/);await as('student');await assert.rejects(()=>cmd('submit',{target:task,data:{request_id:randomUUID(),revision:3,body:'Arsip',links:[],asset_ids:[]}}),/arsip/);
  });
 }finally{await db.close();}
});
test('validasi signature, ekstensi dan ambang berkas',()=>{
 const pdf=Buffer.from('%PDF-1.7\n');validateFile({name:'materi.pdf',kind:'document',mime:'application/pdf',bytes:pdf.length},pdf);
 assert.throws(()=>validateFile({name:'materi.pdf',kind:'document',mime:'application/pdf',bytes:4},Buffer.from('<svg')));
 assert.throws(()=>validateFile({name:'materi.exe',kind:'document',mime:'application/pdf',bytes:pdf.length},pdf));
 assert.throws(()=>validateFile({name:'gambar.png',kind:'image',mime:'image/png',bytes:3000001}));assert.throws(()=>validateFile({name:'video.mp4',kind:'video',mime:'video/mp4',bytes:5000000}));
});
