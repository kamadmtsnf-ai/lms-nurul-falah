begin;
create table private.school_features(school_id uuid primary key references public.schools(id),offline_enabled boolean not null default false,team_enabled boolean not null default false,channels_enabled boolean not null default false,acceptance_reference text not null default '' check(length(acceptance_reference)<=500),revision int not null default 0);
create table private.platform_features(id boolean primary key default true check(id),multi_school boolean not null default false,acceptance_reference text not null default '');insert into private.platform_features(id) values(true);
create table private.course_team(course_id uuid not null references public.teaching_classes(id),user_id uuid not null references public.profiles(id) on delete cascade,active boolean not null default true,primary key(course_id,user_id));create index course_team_user on private.course_team(user_id);
create table private.channel_contacts(school_id uuid not null,user_id uuid not null references public.profiles(id) on delete cascade,channel text not null check(channel in ('telegram','whatsapp')),destination text not null check(length(destination) between 3 and 80),consent_reference text not null check(length(trim(consent_reference)) between 5 and 500),verified boolean not null default false,active boolean not null default true,primary key(school_id,user_id,channel),foreign key(school_id,user_id) references public.school_memberships(school_id,user_id) on delete cascade);
create index channel_contacts_user on private.channel_contacts(user_id);
create table private.channel_jobs(message_id uuid not null references private.activity_messages(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,channel text not null check(channel in ('telegram','whatsapp')),status text not null default 'pending' check(status in ('pending','sending','accepted','unknown')),created_at timestamptz not null default now(),primary key(message_id,user_id,channel));create index channel_jobs_user on private.channel_jobs(user_id);
create table private.platform_audit(id uuid primary key default gen_random_uuid(),school_id uuid references public.schools(id),actor_id uuid references public.profiles(id) on delete set null,action text not null,created_at timestamptz not null default now());create index platform_audit_school on private.platform_audit(school_id);create index platform_audit_actor on private.platform_audit(actor_id);
do $$declare t text;begin foreach t in array array['platform_audit','school_features','platform_features','course_team','channel_contacts','channel_jobs'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);execute format('grant all on private.%I to service_role',t);end loop;end;$$;
create function private.team_member(cid uuid,usr uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.course_team ct join public.teaching_classes t on t.id=ct.course_id join private.school_features f on f.school_id=t.school_id where ct.course_id=cid and ct.user_id=usr and ct.active and t.active and f.team_enabled and private.user_school_role(t.school_id,usr,'teacher'));$$;
create function private.team_teacher(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select private.account_ready() and private.team_member(cid,auth.uid());$$;
revoke all on function private.team_member(uuid,uuid),private.team_teacher(uuid) from public,anon,authenticated;grant execute on function private.team_teacher(uuid) to authenticated,service_role;grant execute on function private.team_member(uuid,uuid) to service_role;
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.learning_context(uuid)'::regprocedure);definition:=replace(definition,'t.teacher_id=auth.uid()','(t.teacher_id=auth.uid() or private.team_teacher(t.id))');execute definition;
 definition:=pg_get_functiondef('private.learning_browse_v1(text,jsonb)'::regprocedure);definition:=replace(definition,'t.teacher_id=actor and t.active','(t.teacher_id=actor or private.team_teacher(t.id)) and t.active');execute definition;
 definition:=pg_get_functiondef('public.activity_mail_claim(uuid,uuid,uuid)'::regprocedure);definition:=replace(definition,'t.teacher_id=actor or exists','t.teacher_id=actor or private.team_member(t.id,actor) or exists');execute definition;
end;$$;
create policy team_classroom_read on public.classrooms for select to authenticated using(private.is_member(school_id) and exists(select 1 from public.teaching_classes t where t.classroom_id=classrooms.id and private.team_teacher(t.id)));
create policy team_teaching_read on public.teaching_classes for select to authenticated using(private.team_teacher(id));
create policy team_enrollment_read on public.student_enrollments for select to authenticated using(private.is_member(school_id) and exists(select 1 from public.teaching_classes t where t.classroom_id=student_enrollments.classroom_id and private.team_teacher(t.id)));
create function private.development_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();school uuid:=(p->>'school')::uuid;course uuid:=(p->>'course')::uuid;target uuid:=(p->>'target')::uuid;d jsonb:=coalesce(p->'data','{}');c jsonb;r jsonb;f private.school_features;central boolean;usr uuid;mem uuid;s public.learning_submissions;task public.learning_assignments;
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi akun.' using errcode='42501';end if;
 central:=exists(select 1 from private.platform_admins where user_id=actor);
 if cmd='schools' then return jsonb_build_object('central',central,'schools',(select coalesce(jsonb_agg(x),'[]') from (select sc.id,sc.name from public.schools sc where private.is_member(sc.id) order by sc.name,sc.id) x));end if;
 if cmd like 'platform-%' then
 if not central then raise exception 'Hanya admin pusat.' using errcode='42501';end if;
 if cmd='platform-state' then return jsonb_build_object('features',(select to_jsonb(x) from private.platform_features x),'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.schools));
 elsif cmd='platform-enable' then
 if length(trim(coalesce(d->>'acceptance_reference','')))<10 then raise exception 'Referensi validasi izin dan kapasitas diperlukan.';end if;
 update private.platform_features set multi_school=(d->>'enabled')::boolean,acceptance_reference=d->>'acceptance_reference';
 elsif cmd='platform-create' then
 if not (select multi_school from private.platform_features where id) then raise exception 'Pengelolaan banyak sekolah belum diaktifkan.';end if;
 select id into usr from public.profiles where username_normalized=d->>'admin_username' and status='active';if usr is null then raise exception 'Username admin yang sudah ada tidak ditemukan.';end if;
 if length(trim(coalesce(d->>'name',''))) not between 2 and 150 then raise exception 'Nama sekolah tidak valid.';end if;
 insert into public.schools(name,education_level) values(d->>'name',coalesce(d->>'education_level','MTs/SMP')) returning id into school;

 insert into public.school_memberships(school_id,user_id) values(school,usr) returning id into mem;insert into public.membership_roles values(school,mem,'admin');
 elsif cmd='platform-link' then
 if not (select multi_school from private.platform_features where id) or not exists(select 1 from public.schools where id=school) then raise exception 'Pengelolaan sekolah tidak tersedia.';end if;
 select id into usr from public.profiles where username_normalized=d->>'username' and status='active';if usr is null or d->>'role' not in ('admin','teacher','student','guardian','principal','homeroom_teacher','duty_teacher') then raise exception 'Pengguna/peran tidak valid.';end if;
 insert into public.school_memberships(school_id,user_id) values(school,usr) on conflict(school_id,user_id) do update set status='active' returning id into mem;insert into public.membership_roles values(school,mem,d->>'role') on conflict do nothing;
 else raise exception 'Tindakan pusat tidak dikenal.';end if;
 insert into private.platform_audit(school_id,actor_id,action) values(school,actor,'development.'||cmd);return jsonb_build_object('school',school);
 end if;
 if course is not null then c:=private.learning_context(course);if c is null then raise exception 'Kelas tidak dapat diakses.' using errcode='42501';end if;school:=(c->>'school')::uuid;end if;
 if school is null or not private.is_member(school) then raise exception 'Sekolah tidak dapat diakses.' using errcode='42501';end if;
 select * into f from private.school_features where school_id=school;
 if cmd='settings' then
 return jsonb_build_object('admin',private.has_school_role(school,'admin'),'features',coalesce(case when f.school_id is null then null else to_jsonb(f) end,jsonb_build_object('school_id',school,'offline_enabled',false,'team_enabled',false,'channels_enabled',false,'revision',0,'acceptance_reference','')),'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'classroom',cl.name,'subject',su.name)),'[]') from public.teaching_classes t join public.classrooms cl on cl.id=t.classroom_id join public.subjects su on su.id=t.subject_id where t.school_id=school and private.has_school_role(school,'admin')),'users',(select coalesce(jsonb_agg(x order by x.full_name),'[]') from(select pr.id,pr.full_name from public.profiles pr where private.has_school_role(school,'admin') and exists(select 1 from public.school_memberships m where m.school_id=school and m.user_id=pr.id and m.status='active') limit 500) x),'team',(select coalesce(jsonb_agg(to_jsonb(ct)),'[]') from private.course_team ct join public.teaching_classes t on t.id=ct.course_id where t.school_id=school and private.has_school_role(school,'admin')),'contacts',(select coalesce(jsonb_agg(to_jsonb(cc)-'consent_reference'),'[]') from private.channel_contacts cc where cc.school_id=school and private.has_school_role(school,'admin')));
 elsif cmd in ('offline-material','offline-draft-context') then
 if not coalesce(f.offline_enabled,false) or not coalesce((c->>'writable')::boolean,false) then raise exception 'Offline belum diaktifkan atau kelas diarsipkan.' using errcode='42501';end if;
 if cmd='offline-material' then
 if not private.material_access(target) then raise exception 'Materi terkunci.' using errcode='42501';end if;
 select jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'links',m.links) into r from public.learning_materials m where m.id=target and m.teaching_class_id=course and private.learning_published(m.status,m.publish_at);if r is null then raise exception 'Materi belum diterbitkan.';end if;
 else
 if not (c->>'student_writable')::boolean then raise exception 'Hanya siswa aktif.' using errcode='42501';end if;
 select * into task from public.learning_assignments where id=target and teaching_class_id=course and private.learning_published(status,publish_at);if not found or not (task.formats&&array['text','link']::text[]) or exists(select 1 from private.assignment_rules where assignment_id=target and group_mode) then raise exception 'Draf offline hanya untuk tugas individu yang sudah diterbitkan.';end if;
 select * into s from public.learning_submissions where assignment_id=target and student_id=actor;
 r:=jsonb_build_object('id',task.id,'title',task.title,'formats',task.formats,'revision',coalesce(s.revision,0),'due_at',task.due_at,'accept_late',task.accept_late);
 end if;
 return jsonb_build_object('owner',actor,'school',school,'course',course,'expires_at',clock_timestamp()+interval '30 minutes','kind',case when cmd='offline-material' then 'material' else 'draft' end,'content',r);
 elsif cmd in ('channel-queue','channel-state','channel-check') then
 if c is null or not (c->>'manager')::boolean or not (c->>'writable')::boolean then raise exception 'Hanya pengampu aktif.' using errcode='42501';end if;
 if cmd='channel-state' then return (select coalesce(jsonb_agg(x),'[]') from (select j.message_id,j.channel,m.subject,count(*) as total,count(*) filter(where j.status='pending') as pending,count(*) filter(where j.status='accepted') as accepted,count(*) filter(where j.status in ('unknown','sending')) as uncertain from private.channel_jobs j join private.activity_messages m on m.id=j.message_id where m.course_id=course group by j.message_id,j.channel,m.subject order by j.message_id limit 100) x);end if;
 if not coalesce(f.channels_enabled,false) then raise exception 'Kanal tambahan belum diaktifkan.';end if;
 if not exists(select 1 from private.activity_messages where id=target and course_id=course) then raise exception 'Pesan tidak ditemukan.';end if;
 if cmd='channel-check' then return jsonb_build_object('school',school);end if;
 if d->>'channel' not in ('telegram','whatsapp') then raise exception 'Kanal tidak valid.';end if;
 insert into private.channel_jobs(message_id,user_id,channel) select target,ar.user_id,d->>'channel' from private.activity_recipients ar join private.channel_contacts cc on cc.school_id=school and cc.user_id=ar.user_id and cc.channel=d->>'channel' where ar.message_id=target and cc.verified and cc.active and private.user_school_role(school,ar.user_id,'student') on conflict do nothing;return '{}';
 end if;
 if not private.has_school_role(school,'admin') then raise exception 'Hanya admin sekolah.' using errcode='42501';end if;
 if cmd='feature-save' then
 if coalesce((d->>'offline_enabled')::boolean,false) or coalesce((d->>'team_enabled')::boolean,false) or coalesce((d->>'channels_enabled')::boolean,false) then if length(trim(coalesce(d->>'acceptance_reference','')))<10 then raise exception 'Catat referensi validasi izin, perangkat dan kapasitas terlebih dahulu.';end if;end if;
 insert into private.school_features(school_id) values(school) on conflict do nothing;perform 1 from private.school_features where school_id=school for update;
 if (select revision from private.school_features where school_id=school) is distinct from (d->>'revision')::int then raise exception 'Pengaturan berubah. Muat ulang.';end if;
 update private.school_features set offline_enabled=(d->>'offline_enabled')::boolean,team_enabled=(d->>'team_enabled')::boolean,channels_enabled=(d->>'channels_enabled')::boolean,acceptance_reference=coalesce(d->>'acceptance_reference',''),revision=revision+1 where school_id=school;
 elsif cmd='team-save' then
 if not exists(select 1 from public.teaching_classes where id=(d->>'course_id')::uuid and school_id=school) or not private.user_school_role(school,(d->>'user_id')::uuid,'teacher') then raise exception 'Guru dan kelas harus berasal dari sekolah ini.';end if;
 insert into private.course_team values((d->>'course_id')::uuid,(d->>'user_id')::uuid,(d->>'active')::boolean) on conflict(course_id,user_id) do update set active=excluded.active;
 elsif cmd='contact-save' then
 if d->>'channel'='telegram' and d->>'destination' !~ '^[0-9]{3,20}$' or d->>'channel'='whatsapp' and d->>'destination' !~ '^[1-9][0-9]{7,14}$' then raise exception 'Gunakan chat ID privat atau nomor internasional tanpa +.';end if;
 if not exists(select 1 from public.school_memberships where school_id=school and user_id=(d->>'user_id')::uuid and status='active') then raise exception 'Pengguna bukan anggota sekolah ini.';end if;
 insert into private.channel_contacts values(school,(d->>'user_id')::uuid,d->>'channel',d->>'destination',d->>'consent_reference',(d->>'verified')::boolean,(d->>'active')::boolean) on conflict(school_id,user_id,channel) do update set destination=excluded.destination,consent_reference=excluded.consent_reference,verified=excluded.verified,active=excluded.active;
 else raise exception 'Tindakan tidak dikenal.';end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id) values(school,actor,'development.'||cmd,'school_features',school::text);return '{}';
end;$$;
revoke all on function private.development_command(text,jsonb) from public,anon;grant execute on function private.development_command(text,jsonb) to authenticated,service_role;
create function public.development_command(cmd text,p jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.development_command(cmd,p);$$;
revoke all on function public.development_command(text,jsonb) from public,anon;grant execute on function public.development_command(text,jsonb) to authenticated,service_role;
create function public.channel_claim(message uuid,course uuid,actor uuid,kind text) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;school uuid;begin
 select t.school_id into school from public.teaching_classes t join private.school_features f on f.school_id=t.school_id where t.id=course and f.channels_enabled and t.active and (private.user_school_role(t.school_id,actor,'admin') or (private.user_school_role(t.school_id,actor,'teacher') and (t.teacher_id=actor or private.team_member(t.id,actor))));if school is null then raise exception 'Kanal atau penugasan tidak tersedia.';end if;
 with selected as(select j.message_id,j.user_id,j.channel from private.channel_jobs j join private.activity_messages m on m.id=j.message_id join private.channel_contacts cc on cc.school_id=school and cc.user_id=j.user_id and cc.channel=j.channel where j.message_id=message and m.course_id=course and j.channel=kind and j.status='pending' and cc.active and cc.verified and private.user_school_role(school,j.user_id,'student') order by j.user_id for update of j skip locked limit 3),claimed as(update private.channel_jobs j set status='sending' from selected s where j.message_id=s.message_id and j.user_id=s.user_id and j.channel=s.channel returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('user_id',j.user_id,'destination',cc.destination,'subject',m.subject,'body',m.body)),'[]') into result from claimed j join private.activity_messages m on m.id=j.message_id join private.channel_contacts cc on cc.school_id=school and cc.user_id=j.user_id and cc.channel=j.channel;return result;end;$$;
create function public.channel_ack(message uuid,recipient uuid,kind text,result text) returns void language sql security definer set search_path='' as $$update private.channel_jobs set status=case when result='accepted' then 'accepted' else 'unknown' end where message_id=message and user_id=recipient and channel=kind and status='sending';$$;
revoke all on function public.channel_claim(uuid,uuid,uuid,text),public.channel_ack(uuid,uuid,text,text) from public,anon,authenticated;grant execute on function public.channel_claim(uuid,uuid,uuid,text),public.channel_ack(uuid,uuid,text,text) to service_role;
create function public.platform_admin_provision(username text,ack text) returns void language plpgsql security definer set search_path='' as $$declare usr uuid;begin
 if ack<>'grant-platform-administration' then raise exception 'Operator acknowledgement required';end if;
 select p.id into usr from public.profiles p where p.username_normalized=username and p.status='active' and p.email_verified_at is not null and not p.must_change_password and exists(select 1 from public.school_memberships m join public.membership_roles mr on mr.membership_id=m.id where m.user_id=p.id and m.status='active' and mr.role_code='admin');if usr is null then raise exception 'Existing activated school administrator required';end if;
 insert into private.platform_admins(user_id) values(usr) on conflict do nothing;
 insert into private.platform_audit(actor_id,action) values(usr,'platform.admin_provision');
end;$$;
revoke all on function public.platform_admin_provision(text,text) from public,anon,authenticated;grant execute on function public.platform_admin_provision(text,text) to service_role;

commit;
