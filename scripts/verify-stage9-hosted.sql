-- Integration check only: synthetic identities, database claims, no HTTP login, no email, no Storage writes.
-- The entire fixture is rolled back. Never remove ROLLBACK or change this to COMMIT.
begin;
create temporary table stage9_context(data jsonb) on commit drop;
grant select,update on pg_temp.stage9_context to authenticated;
do $$
declare sc uuid:=gen_random_uuid();ad uuid:=gen_random_uuid();te uuid:=gen_random_uuid();st uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();ses uuid;who uuid;rr text;m uuid;y uuid;sem uuid;gr uuid;room uuid;su uuid;cu uuid;course uuid;j jsonb:='{}';
begin
 insert into public.schools(id,name) values(sc,'[UJI-TAHAP9-ROLLBACK]');
 for who,rr in select * from (values(ad,'admin'),(te,'teacher'),(st,'student'),(pa,'guardian')) a(id,role) loop
  ses:=gen_random_uuid();insert into auth.users(id) values(who);
  insert into public.profiles(id,username_normalized,full_name,contact_email,email_verified_at,must_change_password) values(who,'lms9check_'||replace(who::text,'-',''),'Akun sintetis Tahap 9','stage9@example.invalid',now(),false);
  insert into auth.sessions(id,user_id,created_at) values(ses,who,now());
  insert into public.school_memberships(school_id,user_id) values(sc,who) returning id into m;
  insert into public.membership_roles(school_id,membership_id,role_code) values(sc,m,rr);
  j:=j||jsonb_build_object(rr,jsonb_build_object('sub',who,'session_id',ses,'role','authenticated'));
 end loop;
 perform set_config('request.jwt.claims',(j->'admin')::text,true);
 y:=(public.academic_command('save',jsonb_build_object('school',sc,'entity','academic_years','data',jsonb_build_object('name','Uji Tahap 9','starts_on',date_trunc('year',now())::date,'ends_on',(date_trunc('year',now())+interval '1 year'-interval '1 day')::date,'status','active')))->>'id')::uuid;
 sem:=(public.academic_command('save',jsonb_build_object('school',sc,'entity','semesters','data',jsonb_build_object('academic_year_id',y,'number',1,'starts_on',date_trunc('year',now())::date,'ends_on',(date_trunc('year',now())+interval '1 year'-interval '1 day')::date,'status','active')))->>'id')::uuid;
 gr:=(public.academic_command('save',jsonb_build_object('school',sc,'entity','grade_levels','data','{"number":7,"name":"7"}'::jsonb))->>'id')::uuid;
 room:=(public.academic_command('save',jsonb_build_object('school',sc,'entity','classrooms','data',jsonb_build_object('semester_id',sem,'grade_level_id',gr,'name','7 Uji')))->>'id')::uuid;
 su:=(public.academic_command('save',jsonb_build_object('school',sc,'entity','subjects','data','{"code":"UJI8","name":"Uji Tahap 9","active":true}'::jsonb))->>'id')::uuid;
 cu:=(public.academic_command('save',jsonb_build_object('school',sc,'entity','curriculum_versions','data','{"name":"Kurikulum uji","version":"1","description":""}'::jsonb))->>'id')::uuid;
 course:=(public.academic_command('save',jsonb_build_object('school',sc,'entity','teaching_classes','data',jsonb_build_object('classroom_id',room,'subject_id',su,'curriculum_version_id',cu,'teacher_id',te)))->>'id')::uuid;
 perform public.academic_command('save',jsonb_build_object('school',sc,'entity','student_enrollments','data',jsonb_build_object('classroom_id',room,'semester_id',sem,'student_id',st,'status','active')));
 perform public.academic_command('save',jsonb_build_object('school',sc,'entity','guardian_students','data',jsonb_build_object('guardian_id',pa,'student_id',st,'relationship','Wali','active',true)));
 insert into public.membership_roles(school_id,membership_id,role_code) select sc,id,'teacher' from public.school_memberships where school_id=sc and user_id=pa;
 perform public.platform_admin_provision('lms9check_'||replace(ad::text,'-',''),'grant-platform-administration');
 insert into pg_temp.stage9_context values(j||jsonb_build_object('course',course,'school',sc));
end;$$;
set local role authenticated;
do $$
declare c jsonb;course uuid;quiz uuid;attempt uuid;r jsonb;mid uuid;mat uuid;task uuid;sid uuid;
begin
 select data into c from pg_temp.stage9_context;course:=(c->>'course')::uuid;
 perform set_config('request.jwt.claims',(c->'teacher')::text,true);
 quiz:=(public.quiz_command('save',jsonb_build_object('course',course,'data',jsonb_build_object('title','Kuis Tahap 9','instructions','','status','published','opens_at',clock_timestamp()-interval '1 minute','closes_at',clock_timestamp()+interval '1 hour','duration_minutes',30,'max_attempts',2,'questions','[{"kind":"complex","prompt":"Pilih A dan B","options":["A","B"],"key":[0,1],"points":2},{"kind":"essay","prompt":"Jelaskan","options":[],"points":3}]'::jsonb)))->>'id')::uuid;
 mid:=(public.learning_command('meeting-save',jsonb_build_object('course',course,'data',jsonb_build_object('title','Pertemuan Tahap 9','starts_at',clock_timestamp()-interval '1 minute')))->>'id')::uuid;
 mat:=(public.learning_command('material-save',jsonb_build_object('course',course,'data',jsonb_build_object('title','Materi Tahap 9','meeting_id',mid,'body','Materi uji','links','[]'::jsonb,'status','published')))->>'id')::uuid;
 perform public.advanced_command('bank-save',jsonb_build_object('course',course,'data','{"questions":[{"kind":"short","prompt":"Isian","options":[],"key":["Ya"],"points":1}]}'::jsonb));
 perform set_config('request.jwt.claims',(c->'student')::text,true);
 r:=public.quiz_command('start',jsonb_build_object('course',course,'target',quiz));attempt:=(r->>'id')::uuid;
 if r->'questions'->0?'answer_key' then raise exception 'Kunci bocor';end if;
 perform public.quiz_command('answers',jsonb_build_object('course',course,'target',attempt,'revision',0,'request_id',gen_random_uuid(),'answers','[{"position":1,"choice":[0,1]},{"position":2,"choice":"Esai uji"}]'::jsonb));
 r:=public.quiz_command('finish',jsonb_build_object('course',course,'target',attempt,'revision',1));if not (r->>'grading_pending')::boolean or r->>'score' is not null then raise exception 'Esai belum dikoreksi harus menunggu';end if;
 perform public.advanced_command('complete',jsonb_build_object('course',course,'target',mat));
 perform public.advanced_command('discussion-post',jsonb_build_object('course',course,'target',mat,'data','{"body":"Diskusi uji"}'::jsonb));
 begin perform public.advanced_command('bank-list',jsonb_build_object('course',course));raise exception 'Bank dapat dibaca siswa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',(c->'teacher')::text,true);
 r:=public.quiz_command('essay-grade',jsonb_build_object('course',course,'target',attempt,'data','{"position":2,"score":3,"feedback":"Baik","expected_revision":0}'::jsonb));if (r->>'score')::numeric<>5 then raise exception 'Total skor salah';end if;
 perform public.advanced_command('message-create',jsonb_build_object('course',course,'data','{"subject":"Pesan uji","body":"Tanpa email nyata","email":false}'::jsonb));
 perform set_config('request.jwt.claims',(c->'guardian')::text,true);
 r:=public.advanced_command('portal','{}');if jsonb_array_length(r->'children')<>1 then raise exception 'Portal wali salah';end if;
 r:=public.advanced_command('weighted-report',jsonb_build_object('course',course));if jsonb_array_length(r->'rows')<>1 or r->'rows'->0->>'quiz_average' is not null then raise exception 'Nilai tertutup bocor';end if;

 perform set_config('request.jwt.claims',(c->'admin')::text,true);
 r:=public.development_command('settings',jsonb_build_object('school',c->'school'));if (r->'features'->>'offline_enabled')::boolean is distinct from false then raise exception 'Default fitur harus mati';end if;
 perform public.development_command('feature-save',jsonb_build_object('school',c->'school','data','{"offline_enabled":true,"team_enabled":true,"channels_enabled":true,"revision":0,"acceptance_reference":"Validasi fixture rollback saja"}'::jsonb));
 perform public.development_command('team-save',jsonb_build_object('school',c->'school','data',jsonb_build_object('course_id',course,'user_id',c->'guardian'->>'sub','active',true)));
 perform set_config('request.jwt.claims',(c->'guardian')::text,true);
 r:=public.quiz_command('list',jsonb_build_object('course',course));if not (r->'context'->>'manager')::boolean then raise exception 'Tim pengajar tidak mendapat akses';end if;
 perform set_config('request.jwt.claims',(c->'student')::text,true);
 r:=public.development_command('offline-material',jsonb_build_object('course',course,'target',mat));if r->>'owner'<>c->'student'->>'sub' then raise exception 'Tiket offline salah pemilik';end if;
 perform set_config('request.jwt.claims',(c->'admin')::text,true);
 perform public.development_command('platform-enable',jsonb_build_object('data','{"enabled":true,"acceptance_reference":"Validasi sekolah rollback"}'::jsonb));
 r:=public.development_command('platform-create',jsonb_build_object('data',jsonb_build_object('name','[UJI-TAHAP9-ROLLBACK] Secondary','education_level','MTs/SMP','admin_username','lms9check_'||replace(c->'admin'->>'sub','-',''))));
 perform public.development_command('contact-save',jsonb_build_object('school',c->'school','data',jsonb_build_object('user_id',c->'student'->>'sub','channel','telegram','destination','123456789','consent_reference','Hanya fixture uji','verified',true,'active',true)));
 sid:=(public.advanced_command('message-create',jsonb_build_object('course',course,'data','{"subject":"Kanal uji","body":"Tidak dikirim nyata","email":false}'::jsonb))->>'id')::uuid;
 perform public.development_command('channel-queue',jsonb_build_object('course',course,'target',sid,'data','{"channel":"telegram"}'::jsonb));
 r:=public.development_command('channel-state',jsonb_build_object('course',course));if (r->0->>'pending')::int<>1 then raise exception 'Antrean kanal tidak sesuai';end if;
end;$$;
reset role;
rollback;
select 'passed_rolled_back' as stage9_database_integration,
 (select count(*) from public.schools where name like '[UJI-TAHAP9-ROLLBACK]%') as synthetic_schools_remaining,
 (select count(*) from public.profiles where username_normalized like 'lms9check_%') as synthetic_users_remaining;
