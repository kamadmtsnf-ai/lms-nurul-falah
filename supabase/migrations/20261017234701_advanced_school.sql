begin;
create table private.activity_messages(id uuid primary key default gen_random_uuid(),course_id uuid not null references public.teaching_classes(id),created_by uuid not null references public.profiles(id),subject text not null check(length(trim(subject)) between 2 and 150),body text not null check(length(trim(body)) between 1 and 3000),created_at timestamptz not null default now());
create index activity_messages_course on private.activity_messages(course_id);create index activity_messages_author on private.activity_messages(created_by);
create table private.activity_recipients(message_id uuid not null references private.activity_messages(id) on delete cascade,user_id uuid not null references public.profiles(id),email text,status text not null default 'pending' check(status in ('pending','sending','sent','failed','unknown','skipped')),read_at timestamptz,sent_at timestamptz,primary key(message_id,user_id));
create index activity_recipients_user on private.activity_recipients(user_id,message_id);
create table private.alumni_retention(school_id uuid not null references public.schools(id),student_id uuid not null,graduation_year_id uuid not null references public.academic_years(id),retain_until date not null,status text not null default 'scheduled' check(status in ('scheduled','prepared','purged')),export_reference text not null default '',confirmed_by uuid references public.profiles(id),confirmed_at timestamptz,primary key(school_id,student_id));
create index alumni_retention_student on private.alumni_retention(student_id);create index alumni_retention_year on private.alumni_retention(graduation_year_id);create index alumni_retention_confirmer on private.alumni_retention(confirmed_by);
do $$ declare t text;begin foreach t in array array['activity_messages','activity_recipients','alumni_retention'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);execute format('grant all on private.%I to service_role',t);end loop;end;$$;
create function private.advanced_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();course uuid:=(p->>'course')::uuid;target uuid:=(p->>'target')::uuid;school uuid:=(p->>'school')::uuid;d jsonb:=coalesce(p->'data','{}');c jsonb;r jsonb;item jsonb;mid uuid;gid uuid;sub public.learning_submissions;task public.learning_assignments;gr private.assignment_groups;rule private.assignment_rules;v record;n int;student uuid;eligible date;year_end date;offset_n int:=greatest(0,least(coalesce((p->>'offset')::int,0),100000));
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi akun.' using errcode='42501';end if;
 if cmd='inbox' then
 return (select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') from (select m.id,m.subject,m.body,m.created_at,m.course_id,ar.read_at from private.activity_recipients ar join private.activity_messages m on m.id=ar.message_id where ar.user_id=actor and private.learning_context(m.course_id) is not null order by m.created_at desc,m.id limit 50 offset offset_n) x);
 elsif cmd='message-read' then update private.activity_recipients set read_at=coalesce(read_at,now()) where message_id=target and user_id=actor;return '{}';
 elsif cmd='portal' then
 return jsonb_build_object('children',(select coalesce(jsonb_agg(x),'[]') from (select distinct pr.id,pr.full_name,g.relationship from public.guardian_students g join public.profiles pr on pr.id=g.student_id where g.guardian_id=actor and g.active and private.has_school_role(g.school_id,'guardian') and private.is_member(g.school_id) order by pr.full_name,pr.id limit 100) x),'courses',private.learning_browse('catalog','{}'));
 elsif cmd like 'retention-%' then
 if school is null or not private.has_school_role(school,'admin') or not private.is_member(school) then raise exception 'Hanya admin madrasah.' using errcode='42501';end if;
 if cmd='retention-list' then return jsonb_build_object('records',(select coalesce(jsonb_agg(x),'[]') from (select a.*,pr.full_name,pr.username_normalized from private.alumni_retention a left join public.profiles pr on pr.id=a.student_id where a.school_id=school order by a.retain_until,a.student_id limit 100 offset offset_n) x),'students',(select coalesce(jsonb_agg(x),'[]') from (select pr.id,pr.full_name from public.profiles pr where private.user_school_role(school,pr.id,'student') order by pr.full_name,pr.id limit 300) x),'years',(select coalesce(jsonb_agg(to_jsonb(y) order by y.starts_on),'[]') from public.academic_years y where y.school_id=school));end if;
 student:=(d->>'student_id')::uuid;
 if cmd='retention-schedule' then
 if not private.user_school_role(school,student,'student') then raise exception 'Siswa tidak ditemukan.';end if;
 select ends_on into year_end from public.academic_years where id=(d->>'graduation_year_id')::uuid and school_id=school;
 select ends_on into eligible from public.academic_years where school_id=school and starts_on>year_end order by starts_on limit 1;
 if year_end is null or eligible is null then raise exception 'Tetapkan tahun kelulusan dan kalender tahun pelajaran berikutnya dahulu.';end if;
 insert into private.alumni_retention(school_id,student_id,graduation_year_id,retain_until) values(school,student,(d->>'graduation_year_id')::uuid,eligible) on conflict(school_id,student_id) do update set graduation_year_id=excluded.graduation_year_id,retain_until=excluded.retain_until where alumni_retention.status='scheduled';
 elsif cmd='retention-prepare' then
 if d->>'confirmation'<>'SIAPKAN PENGHAPUSAN' or length(trim(coalesce(d->>'export_reference','')))<5 then raise exception 'Konfirmasi dan bukti ekspor diperlukan.';end if;
 perform 1 from private.alumni_retention where school_id=school and student_id=student and retain_until<(clock_timestamp() at time zone 'Asia/Jakarta')::date and status in ('scheduled','prepared') for update;if not found then raise exception 'Retensi belum berakhir.';end if;
 if exists(select 1 from private.platform_admins where user_id=student) or exists(select 1 from public.school_memberships m where m.user_id=student and m.school_id<>school) or exists(select 1 from public.membership_roles mr join public.school_memberships m on m.id=mr.membership_id where m.user_id=student and mr.role_code<>'student') then raise exception 'Akun mempunyai peran/sekolah lain. Pemeriksaan operator diperlukan.';end if;
 update private.alumni_retention set status='prepared',export_reference=d->>'export_reference',confirmed_by=actor,confirmed_at=clock_timestamp() where school_id=school and student_id=student;
 update public.school_memberships set status='inactive' where school_id=school and user_id=student;
 delete from auth.sessions where user_id=student;
 return jsonb_build_object('student_id',student,'paths',(select coalesce(jsonb_agg(object_path),'[]') from public.learning_assets where owner_id=student and school_id=school),'status','prepared');
 elsif cmd='retention-auth' then
 if not exists(select 1 from private.alumni_retention where school_id=school and student_id=student and status='purged') then raise exception 'Pembersihan data belum selesai.';end if;return jsonb_build_object('student_id',student);
 elsif cmd='retention-purge' then
 -- Called only after Storage removal succeeds; rechecks the admin, confirmation and scope.
 perform 1 from private.alumni_retention where school_id=school and student_id=student and status='prepared' and confirmed_by=actor and retain_until<(clock_timestamp() at time zone 'Asia/Jakarta')::date for update;if not found or d->>'confirmation'<>'HAPUS DATA ALUMNI' then raise exception 'Persiapan/konfirmasi penghapusan tidak sesuai.';end if;
 if exists(select 1 from private.platform_admins where user_id=student) or exists(select 1 from public.school_memberships where user_id=student and school_id<>school) or exists(select 1 from public.membership_roles mr join public.school_memberships m on m.id=mr.membership_id where m.user_id=student and mr.role_code<>'student') then raise exception 'Lingkup akun berubah.';end if;
 if exists(select 1 from public.learning_assets a join storage.objects o on o.name=a.object_path and o.bucket_id='lms-private' where a.owner_id=student) then raise exception 'Berkas Storage belum dihapus.';end if;
 delete from private.email_outbox where dedupe_key in(select id::text from private.email_tokens where user_id=student);
 delete from private.email_tokens where user_id=student;
 delete from private.activity_recipients where user_id=student;
 delete from private.course_discussions where author_id=student;
 delete from private.material_progress where student_id=student;
 delete from private.assignment_group_members where student_id=student;
 delete from public.learning_quiz_attempts where student_id=student;
 delete from public.learning_grades where version_id in(select v.id from public.learning_submission_versions v join public.learning_submissions s on s.id=v.submission_id where s.student_id=student);
 update public.learning_submissions set latest_version_id=null where student_id=student;
 delete from public.learning_submission_versions where submission_id in(select id from public.learning_submissions where student_id=student);
 delete from public.learning_submissions where student_id=student;
 delete from public.learning_assets where owner_id=student;
 delete from public.learning_meeting_attendance where student_id=student;
 delete from public.learning_roster where student_id=student;
 delete from public.learning_daily_attendance where student_id=student;
 delete from public.guardian_students where student_id=student;
 delete from public.student_details where student_id=student;
 delete from public.student_enrollments where student_id=student;
 delete from public.audit_logs where school_id=school and (actor_id=student or details::text like '%'||student::text||'%' or entity_id=student::text);
 update private.alumni_retention set status='purged',export_reference='' where school_id=school and student_id=student;
 update public.profiles set full_name='Alumni dihapus',contact_email=null,email_verified_at=null,status='disabled',must_change_password=true where id=student;
 return jsonb_build_object('student_id',student,'status','purged_auth_removal_pending');
 else raise exception 'Tindakan retensi tidak dikenal.';end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id) values(school,actor,cmd,'retention',student::text);return '{}';
 end if;
 c:=private.learning_context(course);if c is null then raise exception 'Kelas tidak dapat diakses.' using errcode='42501';end if;school:=(c->>'school')::uuid;
 if cmd='weighted-report' then return private.weighted_report(p);end if;
 if cmd='features' then
 return jsonb_build_object('context',c,'actor',actor,
 'materials',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'accessible',private.material_access(m.id),'completed',exists(select 1 from private.material_progress pr where pr.material_id=m.id and pr.student_id=actor),'prerequisite_id',r.prerequisite_id,'enabled',coalesce(r.enabled,false)) order by m.created_at,m.id),'[]') from public.learning_materials m left join private.material_rules r on r.material_id=m.id where m.teaching_class_id=course and ((c->>'manager')::boolean or private.learning_published(m.status,m.publish_at))),
 'rules',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from private.assignment_rules r join public.learning_assignments a on a.id=r.assignment_id where a.teaching_class_id=course and ((c->>'manager')::boolean or private.learning_published(a.status,a.publish_at))),
 'groups',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'full_name',pr.full_name)),'[]') from private.assignment_group_members gm join public.profiles pr on pr.id=gm.student_id where gm.group_id=g.id))),'[]') from private.assignment_groups g join public.learning_assignments a on a.id=g.assignment_id where a.teaching_class_id=course and ((c->>'manager')::boolean or exists(select 1 from private.assignment_group_members gm where gm.group_id=g.id and gm.student_id=actor))),
 'progress',(select coalesce(jsonb_agg(jsonb_build_object('material_id',pr.material_id,'student_id',pr.student_id,'full_name',p.full_name,'completed_at',pr.completed_at)),'[]') from private.material_progress pr join public.learning_materials m on m.id=pr.material_id join public.profiles p on p.id=pr.student_id where m.teaching_class_id=course and ((c->>'reviewer')::boolean or pr.student_id=actor or (c->'children')@>to_jsonb(array[pr.student_id]))));
 end if;
 if cmd='discussion-list' then
 if not exists(select 1 from public.learning_materials where id=target and teaching_class_id=course) or not private.material_access(target) then raise exception 'Materi terkunci.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') from (select d.id,d.body,d.author_id,pr.full_name,d.created_at,d.hidden from private.course_discussions d join public.profiles pr on pr.id=d.author_id where d.course_id=course and d.material_id=target and (not d.hidden or (c->>'manager')::boolean) order by d.created_at desc,d.id limit 50 offset offset_n) x);
 end if;
 if not (c->>'writable')::boolean then raise exception 'Semester diarsipkan.';end if;
 if cmd='complete' then
 if not (c->>'student_writable')::boolean or not private.material_access(target) or not exists(select 1 from public.learning_materials where id=target and teaching_class_id=course) then raise exception 'Materi tidak dapat diselesaikan.' using errcode='42501';end if;
 insert into private.material_progress(material_id,student_id) values(target,actor) on conflict do nothing;return '{}';
 elsif cmd='discussion-post' then
 if not ((c->>'student_writable')::boolean or (c->>'manager')::boolean) or not private.material_access(target) or not exists(select 1 from public.learning_materials where id=target and teaching_class_id=course) then raise exception 'Diskusi tidak diizinkan.' using errcode='42501';end if;
 insert into private.course_discussions(course_id,material_id,author_id,body) values(course,target,actor,d->>'body');return '{}';
 elsif cmd='group-submit' then
 select g.* into gr from private.assignment_groups g join public.learning_assignments a on a.id=g.assignment_id where g.id=target and a.teaching_class_id=course for update of g;
 if not (c->>'student_writable')::boolean or not exists(select 1 from private.assignment_group_members where group_id=gr.id and student_id=actor) then raise exception 'Bukan anggota kelompok.' using errcode='42501';end if;
 select * into task from public.learning_assignments where id=gr.assignment_id for update;select * into rule from private.assignment_rules where assignment_id=task.id;
 if not rule.group_mode or not private.learning_published(task.status,task.publish_at) then raise exception 'Tugas kelompok belum tersedia.';end if;
 if exists(select 1 from public.learning_submission_versions v join public.learning_submissions s on s.id=v.submission_id where v.id=(d->>'request_id')::uuid and s.assignment_id=task.id and s.student_id=actor) then return jsonb_build_object('repeated',true);end if;
 if gr.revision is distinct from (d->>'revision')::int or gr.revision>=rule.revision_limit then raise exception 'Revisi berubah atau batas revisi tercapai.';end if;
 if clock_timestamp()>task.due_at and (not task.accept_late or (rule.late_minutes>0 and clock_timestamp()>task.due_at+make_interval(mins=>rule.late_minutes))) then raise exception 'Tenggat kelompok sudah lewat.';end if;
 if length(trim(coalesce(d->>'body','')))=0 and jsonb_array_length(coalesce(d->'links','[]'))=0 and jsonb_array_length(coalesce(d->'asset_ids','[]'))=0 then raise exception 'Isi kiriman terlebih dahulu.';end if;
 if not private.learning_links(coalesce(d->'links','[]')) or (length(coalesce(d->>'body',''))>0 and not 'text'=any(task.formats)) or (jsonb_array_length(coalesce(d->'links','[]'))>0 and not 'link'=any(task.formats)) or (jsonb_array_length(coalesce(d->'asset_ids','[]'))>0 and not 'file'=any(task.formats)) then raise exception 'Format tidak sesuai aturan guru.';end if;
 if jsonb_array_length(coalesce(d->'asset_ids','[]'))>5 or exists(select 1 from jsonb_array_elements_text(coalesce(d->'asset_ids','[]')) x where not exists(select 1 from public.learning_assets a where a.id=x::uuid and a.owner_id=actor and a.target_id=task.id and a.target_type='submission' and a.teaching_class_id=course and a.status='ready')) then raise exception 'Lampiran bukan milik pengirim.';end if;
 for v in select gm.student_id from private.assignment_group_members gm join public.student_enrollments e on e.student_id=gm.student_id and e.classroom_id=(c->>'classroom')::uuid and e.status='active' where gm.group_id=gr.id order by gm.student_id loop
 insert into public.learning_submissions(school_id,assignment_id,student_id) values(school,task.id,v.student_id) on conflict do nothing;
 select * into sub from public.learning_submissions where assignment_id=task.id and student_id=v.student_id for update;
 mid:=case when v.student_id=actor then (d->>'request_id')::uuid else gen_random_uuid() end;
 insert into public.learning_submission_versions(id,school_id,submission_id,version,body,links,asset_ids,is_late) values(mid,school,sub.id,sub.revision+1,coalesce(d->>'body',''),coalesce(d->'links','[]'),array(select x::uuid from jsonb_array_elements_text(coalesce(d->'asset_ids','[]')) x),clock_timestamp()>task.due_at);
 update public.learning_submissions set latest_version_id=mid,revision=revision+1 where id=sub.id;
 end loop;update private.assignment_groups set revision=revision+1 where id=gr.id;return '{}';
 end if;
 if not (c->>'manager')::boolean then raise exception 'Hanya guru pengampu atau admin.' using errcode='42501';end if;
 if cmd='material-rule' then
 perform 1 from public.learning_materials where id=target and teaching_class_id=course for update;if not found then raise exception 'Materi tidak ditemukan.';end if;
 mid:=nullif(d->>'prerequisite_id','')::uuid;
 if coalesce((d->>'enabled')::boolean,false) and mid is null then raise exception 'Pilih prasyarat.';end if;
 if mid is not null and (mid=target or not exists(select 1 from public.learning_materials where id=mid and teaching_class_id=course)) then raise exception 'Prasyarat harus materi lain pada kelas sama.';end if;
 perform pg_advisory_xact_lock(hashtextextended(course::text,8));
 if mid is not null and exists(with recursive ch as(select mid id,array[mid] path union all select r.prerequisite_id,path||r.prerequisite_id from ch join private.material_rules r on r.material_id=ch.id where r.enabled and r.prerequisite_id is not null and not r.prerequisite_id=any(path) and cardinality(path)<101) select 1 from ch where id=target) then raise exception 'Prasyarat membentuk siklus.';end if;
 insert into private.material_rules values(target,mid,coalesce((d->>'enabled')::boolean,false)) on conflict(material_id) do update set prerequisite_id=excluded.prerequisite_id,enabled=excluded.enabled;
 elsif cmd='material-share' then
 select to_jsonb(m) into item from public.learning_materials m where m.id=target and m.teaching_class_id=course;if item is null then raise exception 'Materi tidak ditemukan.';end if;
 mid:=(d->>'destination_course')::uuid;r:=private.learning_context(mid);
 if r is null or not (r->>'manager')::boolean or not (r->>'writable')::boolean or r->>'school'<>c->>'school' or not exists(select 1 from public.classrooms a join public.classrooms b on b.grade_level_id=a.grade_level_id and b.semester_id=a.semester_id where a.id=(c->>'classroom')::uuid and b.id=(r->>'classroom')::uuid) then raise exception 'Tujuan wajib setingkat, satu semester dan dapat Anda kelola.';end if;
 insert into public.learning_meetings(school_id,teaching_class_id,title,starts_at,created_by) values(school,mid,'Salinan materi',(select starts_at from public.learning_meetings where id=(item->>'meeting_id')::uuid),actor) returning id into gid;
 insert into public.learning_materials(school_id,teaching_class_id,meeting_id,title,body,links,status,created_by) values(school,mid,gid,item->>'title',item->>'body',item->'links','draft',actor) returning id into gid;
 return jsonb_build_object('id',gid,'note','Draf dibuat; penyalinan lampiran dilanjutkan oleh API.');
 elsif cmd='discussion-hide' then update private.course_discussions set hidden=coalesce((d->>'hidden')::boolean,true) where id=target and course_id=course;
 elsif cmd='weights' then insert into private.course_weights values(course,(d->>'assignment_weight')::numeric,(d->>'quiz_weight')::numeric,coalesce((d->>'visible')::boolean,false)) on conflict(course_id) do update set assignment_weight=excluded.assignment_weight,quiz_weight=excluded.quiz_weight,visible=excluded.visible;
 elsif cmd='assignment-rule' then
 select * into task from public.learning_assignments where id=target and teaching_class_id=course for update;if not found then raise exception 'Tugas tidak ditemukan.';end if;
 if exists(select 1 from public.learning_submissions where assignment_id=target) then raise exception 'Aturan tugas dikunci setelah pengumpulan pertama.';end if;
 if jsonb_typeof(d->'rubric') is distinct from 'array' or jsonb_array_length(d->'rubric')>20 or exists(select 1 from jsonb_array_elements(d->'rubric') x where length(trim(coalesce(x->>'label',''))) not between 1 and 150 or coalesce((x->>'points')::numeric,0)<=0) then raise exception 'Rubrik tidak valid.';end if;
 if jsonb_array_length(d->'rubric')>0 and (select sum((x->>'points')::numeric) from jsonb_array_elements(d->'rubric') x)<>task.max_score then raise exception 'Total poin rubrik harus sama dengan skor maksimum tugas.';end if;
 insert into private.assignment_rules values(target,(d->>'revision_limit')::int,(d->>'late_minutes')::int,d->'rubric',coalesce((d->>'group_mode')::boolean,false)) on conflict(assignment_id) do update set revision_limit=excluded.revision_limit,late_minutes=excluded.late_minutes,rubric=excluded.rubric,group_mode=excluded.group_mode;
 elsif cmd='group-save' then
 mid:=(d->>'assignment_id')::uuid;select * into task from public.learning_assignments where id=mid and teaching_class_id=course for update;
 if task.id is null or not exists(select 1 from private.assignment_rules where assignment_id=mid and group_mode) then raise exception 'Aktifkan mode kelompok dahulu.';end if;
 if exists(select 1 from public.learning_submissions where assignment_id=mid) then raise exception 'Kelompok dikunci setelah pengumpulan pertama.';end if;
 if jsonb_typeof(d->'members') is distinct from 'array' or jsonb_array_length(d->'members') not between 1 and 30 then raise exception 'Isi 1 sampai 30 anggota.';end if;
 if exists(select 1 from jsonb_array_elements_text(d->'members') x where not exists(select 1 from public.student_enrollments e where e.student_id=x::uuid and e.classroom_id=(c->>'classroom')::uuid and e.status='active')) then raise exception 'Anggota harus siswa aktif rombel ini.';end if;
 if target is null then insert into private.assignment_groups(assignment_id,name) values(mid,d->>'name') returning id into target;else update private.assignment_groups set name=d->>'name' where id=target and assignment_id=mid;if not found then raise exception 'Kelompok tidak ditemukan.';end if;delete from private.assignment_group_members where group_id=target;end if;
 insert into private.assignment_group_members(group_id,assignment_id,student_id) select target,mid,x::uuid from jsonb_array_elements_text(d->'members') x;
 elsif cmd='bank-list' then return (select coalesce(jsonb_agg(x),'[]') from (select * from private.bank_questions where course_id=course order by created_at desc,id limit 100 offset offset_n) x);
 elsif cmd='bank-save' then
 if jsonb_typeof(d->'questions') is distinct from 'array' or jsonb_array_length(d->'questions') not between 1 and 100 then raise exception 'Isi 1 sampai 100 soal.';end if;
 for item in select * from jsonb_array_elements(d->'questions') loop if not private.valid_question(item) then raise exception 'Soal bank tidak valid.';end if;insert into private.bank_questions(course_id,question,created_by) values(course,item,actor);end loop;
 elsif cmd='bank-delete' then delete from private.bank_questions where id=target and course_id=course;
 elsif cmd='message-create' then
 insert into private.activity_messages(course_id,created_by,subject,body) values(course,actor,d->>'subject',d->>'body') returning id into target;
 insert into private.activity_recipients(message_id,user_id,email,status) select target,pr.id,case when coalesce((d->>'email')::boolean,false) and pr.email_verified_at is not null then pr.contact_email else null end,case when coalesce((d->>'email')::boolean,false) and pr.email_verified_at is not null and pr.contact_email is not null then 'pending' else 'skipped' end from public.student_enrollments e join public.profiles pr on pr.id=e.student_id where e.classroom_id=(c->>'classroom')::uuid and e.status='active' and pr.status='active';
 return jsonb_build_object('id',target);
 elsif cmd='message-status' then return (select coalesce(jsonb_agg(x),'[]') from (select m.id,m.subject,m.created_at,count(*) as recipients,count(*) filter(where ar.status='sent') as sent,count(*) filter(where ar.status='pending') as pending,count(*) filter(where ar.status in ('failed','unknown')) as failed from private.activity_messages m join private.activity_recipients ar on ar.message_id=m.id where m.course_id=course group by m.id order by m.created_at desc limit 50) x);
 else raise exception 'Tindakan lanjutan tidak dikenal.';end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id) values(school,actor,'advanced.'||cmd,'course',course::text);return '{}';
end;$$;
revoke all on function private.advanced_command(text,jsonb) from public,anon;grant execute on function private.advanced_command(text,jsonb) to authenticated,service_role;
create function public.advanced_command(cmd text,p jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.advanced_command(cmd,p);$$;
revoke all on function public.advanced_command(text,jsonb) from public,anon;grant execute on function public.advanced_command(text,jsonb) to authenticated,service_role;
create function public.activity_mail_claim(message uuid,course uuid,actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare jobs jsonb;begin
 if not exists(select 1 from private.activity_messages m join public.teaching_classes t on t.id=m.course_id where m.id=message and m.course_id=course and (t.teacher_id=actor or exists(select 1 from public.school_memberships sm join public.membership_roles mr on mr.membership_id=sm.id where sm.user_id=actor and sm.school_id=t.school_id and sm.status='active' and mr.role_code='admin'))) then raise exception 'Akses ditolak.';end if;
 with selected as (select ar.message_id,ar.user_id from private.activity_recipients ar join public.profiles pr on pr.id=ar.user_id where ar.message_id=message and ar.status='pending' and pr.status='active' and pr.contact_email=ar.email and pr.email_verified_at is not null and exists(select 1 from public.teaching_classes t join public.student_enrollments e on e.classroom_id=t.classroom_id join public.school_memberships sm on sm.school_id=t.school_id and sm.user_id=e.student_id where t.id=course and e.student_id=ar.user_id and e.status='active' and sm.status='active') order by ar.user_id for update of ar skip locked limit 3), claimed as(update private.activity_recipients ar set status='sending' from selected s where ar.message_id=s.message_id and ar.user_id=s.user_id returning ar.*)
 select coalesce(jsonb_agg(jsonb_build_object('user_id',ar.user_id,'email',ar.email,'subject',m.subject,'body',m.body)),'[]') into jobs from claimed ar join private.activity_messages m on m.id=ar.message_id;return jobs;end;$$;
create function public.activity_mail_ack(message uuid,recipient uuid,result text) returns void language sql security definer set search_path='' as $$ update private.activity_recipients set status=case when result='sent' then 'sent' else 'unknown' end,sent_at=case when result='sent' then now() else null end where message_id=message and user_id=recipient and status='sending';$$;
revoke all on function public.activity_mail_claim(uuid,uuid,uuid),public.activity_mail_ack(uuid,uuid,text) from public,anon,authenticated;grant execute on function public.activity_mail_claim(uuid,uuid,uuid),public.activity_mail_ack(uuid,uuid,text) to service_role;

commit;
