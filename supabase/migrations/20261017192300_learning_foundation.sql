begin;
create table public.learning_meetings (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,teaching_class_id uuid not null,
 title text not null check(length(trim(title)) between 2 and 150),starts_at timestamptz not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(school_id,id),foreign key(school_id,teaching_class_id) references public.teaching_classes(school_id,id)
);
create table public.learning_roster (
 school_id uuid not null,meeting_id uuid not null,student_id uuid not null,
 primary key(meeting_id,student_id),foreign key(school_id,meeting_id) references public.learning_meetings(school_id,id),
 foreign key(school_id,student_id) references public.school_memberships(school_id,user_id)
);
create table public.learning_materials (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,teaching_class_id uuid not null,meeting_id uuid not null,
 title text not null check(length(trim(title)) between 2 and 150),body text not null default '' check(length(body)<=30000),links jsonb not null default '[]' check(jsonb_typeof(links)='array' and jsonb_array_length(links)<=10),
 status text not null check(status in ('draft','scheduled','published','archived')),publish_at timestamptz,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(school_id,id),foreign key(school_id,teaching_class_id) references public.teaching_classes(school_id,id),foreign key(school_id,meeting_id) references public.learning_meetings(school_id,id),check(status<>'scheduled' or publish_at is not null)
);
create table public.learning_assignments (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,teaching_class_id uuid not null,
 title text not null check(length(trim(title)) between 2 and 150),instructions text not null default '' check(length(instructions)<=30000),
 formats text[] not null check(cardinality(formats) between 1 and 3 and formats <@ array['text','file','link']::text[] and array_position(formats,null) is null),
 due_at timestamptz not null,accept_late boolean not null default false,max_score numeric(10,2) not null check(max_score>0 and max_score<=10000),
 status text not null check(status in ('draft','scheduled','published','archived')),publish_at timestamptz,grades_visible boolean not null default false,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(school_id,id),foreign key(school_id,teaching_class_id) references public.teaching_classes(school_id,id),check(status<>'scheduled' or publish_at is not null)
);
create table public.learning_submissions (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,assignment_id uuid not null,student_id uuid not null,
 latest_version_id uuid,revision int not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(assignment_id,student_id),unique(school_id,id),
 foreign key(school_id,assignment_id) references public.learning_assignments(school_id,id),foreign key(school_id,student_id) references public.school_memberships(school_id,user_id)
);
create table public.learning_submission_versions (
 id uuid primary key,school_id uuid not null,submission_id uuid not null,version int not null check(version>0),
 body text not null default '' check(length(body)<=30000),links jsonb not null default '[]' check(jsonb_typeof(links)='array' and jsonb_array_length(links)<=10),asset_ids uuid[] not null default '{}' check(cardinality(asset_ids)<=5),
 is_late boolean not null,submitted_at timestamptz not null default clock_timestamp(),unique(submission_id,version),unique(school_id,id),
 foreign key(school_id,submission_id) references public.learning_submissions(school_id,id)
);
alter table public.learning_submissions add constraint latest_submission_version_fk foreign key(school_id,latest_version_id) references public.learning_submission_versions(school_id,id);
create table public.learning_grades (
 version_id uuid primary key,school_id uuid not null,score numeric(10,2) not null check(score>=0),feedback text not null default '' check(length(feedback)<=5000),
 graded_by uuid not null references public.profiles(id),reason text not null default '' check(length(reason)<=1000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(school_id,version_id) references public.learning_submission_versions(school_id,id)
);
create table public.learning_assets (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,teaching_class_id uuid not null,owner_id uuid not null references public.profiles(id),
 target_type text not null check(target_type in ('material','assignment','submission')),target_id uuid not null,
 name text not null check(length(name) between 1 and 150),kind text not null check(kind in ('image','document','audio','video')),mime text not null,bytes int not null check(bytes>0 and bytes<=5000000),
 object_path text not null unique,status text not null default 'pending' check(status in ('pending','ready','removed')),
 expires_at timestamptz not null default now()+interval '2 hours',created_at timestamptz not null default now(),
 foreign key(school_id,teaching_class_id) references public.teaching_classes(school_id,id)
);
create table public.learning_meeting_attendance (
 school_id uuid not null,meeting_id uuid not null,student_id uuid not null,
 status text not null check(status in ('present','sick','excused','absent')),revision int not null default 1,reason text not null default '' check(length(reason)<=1000),recorded_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 primary key(meeting_id,student_id),foreign key(meeting_id,student_id) references public.learning_roster(meeting_id,student_id),foreign key(school_id,meeting_id) references public.learning_meetings(school_id,id)
);
create table public.learning_daily_attendance (
 school_id uuid not null,classroom_id uuid not null,student_id uuid not null,local_date date not null,
 status text not null check(status in ('present','sick','excused','absent')),revision int not null default 1,reason text not null default '' check(length(reason)<=1000),recorded_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 primary key(school_id,student_id,local_date),foreign key(school_id,classroom_id) references public.classrooms(school_id,id),foreign key(school_id,student_id) references public.school_memberships(school_id,user_id)
);
alter table public.learning_meetings enable row level security;
revoke all on public.learning_meetings from public,anon,authenticated;
grant all on public.learning_meetings to service_role;
alter table public.learning_roster enable row level security;
revoke all on public.learning_roster from public,anon,authenticated;
grant all on public.learning_roster to service_role;
alter table public.learning_materials enable row level security;
revoke all on public.learning_materials from public,anon,authenticated;
grant all on public.learning_materials to service_role;
alter table public.learning_assignments enable row level security;
revoke all on public.learning_assignments from public,anon,authenticated;
grant all on public.learning_assignments to service_role;
alter table public.learning_submissions enable row level security;
revoke all on public.learning_submissions from public,anon,authenticated;
grant all on public.learning_submissions to service_role;
alter table public.learning_submission_versions enable row level security;
revoke all on public.learning_submission_versions from public,anon,authenticated;
grant all on public.learning_submission_versions to service_role;
alter table public.learning_grades enable row level security;
revoke all on public.learning_grades from public,anon,authenticated;
grant all on public.learning_grades to service_role;
alter table public.learning_assets enable row level security;
revoke all on public.learning_assets from public,anon,authenticated;
grant all on public.learning_assets to service_role;
alter table public.learning_meeting_attendance enable row level security;
revoke all on public.learning_meeting_attendance from public,anon,authenticated;
grant all on public.learning_meeting_attendance to service_role;
alter table public.learning_daily_attendance enable row level security;
revoke all on public.learning_daily_attendance from public,anon,authenticated;
grant all on public.learning_daily_attendance to service_role;
create trigger learning_meetings_updated before update on public.learning_meetings for each row execute function private.touch_updated_at();
create trigger learning_materials_updated before update on public.learning_materials for each row execute function private.touch_updated_at();
create trigger learning_assignments_updated before update on public.learning_assignments for each row execute function private.touch_updated_at();
create trigger learning_submissions_updated before update on public.learning_submissions for each row execute function private.touch_updated_at();
create trigger learning_grades_updated before update on public.learning_grades for each row execute function private.touch_updated_at();
create trigger learning_meeting_attendance_updated before update on public.learning_meeting_attendance for each row execute function private.touch_updated_at();
create trigger learning_daily_attendance_updated before update on public.learning_daily_attendance for each row execute function private.touch_updated_at();
create index learning_meetings_scope_0 on public.learning_meetings(school_id,teaching_class_id);
create index learning_meetings_scope_1 on public.learning_meetings(created_by);
create index learning_roster_scope_0 on public.learning_roster(school_id,meeting_id);
create index learning_roster_scope_1 on public.learning_roster(school_id,student_id);
create index learning_materials_scope_0 on public.learning_materials(school_id,teaching_class_id);
create index learning_materials_scope_1 on public.learning_materials(school_id,meeting_id);
create index learning_materials_scope_2 on public.learning_materials(created_by);
create index learning_assignments_scope_0 on public.learning_assignments(school_id,teaching_class_id);
create index learning_assignments_scope_1 on public.learning_assignments(created_by);
create index learning_submissions_scope_0 on public.learning_submissions(school_id,assignment_id);
create index learning_submissions_scope_1 on public.learning_submissions(school_id,student_id);
create index learning_submissions_scope_2 on public.learning_submissions(school_id,latest_version_id);
create index learning_submission_versions_scope_0 on public.learning_submission_versions(school_id,submission_id);
create index learning_grades_scope_0 on public.learning_grades(school_id,version_id);
create index learning_grades_scope_1 on public.learning_grades(graded_by);
create index learning_assets_scope_0 on public.learning_assets(school_id,teaching_class_id);
create index learning_assets_scope_1 on public.learning_assets(owner_id,status,expires_at);
create index learning_assets_scope_2 on public.learning_assets(target_type,target_id);
create index learning_meeting_attendance_scope_0 on public.learning_meeting_attendance(school_id,meeting_id);
create index learning_meeting_attendance_scope_1 on public.learning_meeting_attendance(recorded_by);
create index learning_daily_attendance_scope_0 on public.learning_daily_attendance(school_id,classroom_id,local_date);
create index learning_daily_attendance_scope_1 on public.learning_daily_attendance(recorded_by);

create function private.learning_context(course uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.teaching_classes; room public.classrooms; sem public.semesters; manager boolean; reviewer boolean; student boolean; children uuid[]; role_admin boolean;
begin
 select * into t from public.teaching_classes where id=course;
 if not found or not private.is_member(t.school_id) then return null; end if;
 select * into room from public.classrooms where id=t.classroom_id and school_id=t.school_id;
 select * into sem from public.semesters where id=room.semester_id and school_id=t.school_id;
 role_admin:=private.has_school_role(t.school_id,'admin');
 manager:=role_admin or (t.active and t.teacher_id=auth.uid() and private.has_school_role(t.school_id,'teacher'));
 reviewer:=manager or private.has_school_role(t.school_id,'principal') or (private.has_school_role(t.school_id,'homeroom_teacher') and exists(select 1 from public.homeroom_assignments h where h.school_id=t.school_id and h.classroom_id=t.classroom_id and h.teacher_id=auth.uid() and h.active));
 student:=private.has_school_role(t.school_id,'student') and exists(select 1 from public.student_enrollments e where e.school_id=t.school_id and e.classroom_id=t.classroom_id and e.student_id=auth.uid() and e.status='active');
 select coalesce(array_agg(g.student_id),'{}') into children from public.guardian_students g join public.student_enrollments e on e.school_id=g.school_id and e.student_id=g.student_id where g.school_id=t.school_id and g.guardian_id=auth.uid() and g.active and e.classroom_id=t.classroom_id and private.has_school_role(t.school_id,'guardian');
 if not reviewer and not student and cardinality(children)=0 and not (private.has_school_role(t.school_id,'student') and exists(select 1 from public.student_enrollments e where e.school_id=t.school_id and e.classroom_id=t.classroom_id and e.student_id=auth.uid())) then return null; end if;
 return jsonb_build_object('school',t.school_id,'classroom',room.id,'semester',sem.id,'semester_status',sem.status,'manager',manager,'reviewer',reviewer,'admin',role_admin,'teacher',t.teacher_id=auth.uid() and private.has_school_role(t.school_id,'teacher'),'student',student,'children',to_jsonb(children),'writable',sem.status<>'archived' and t.active,'student_writable',student and sem.status='active' and t.active);
end; $$;
create function private.learning_published(state text,publish_at timestamptz) returns boolean language sql stable set search_path='' as $$ select state='published' or (state='scheduled' and publish_at<=now()); $$;
create function private.learning_links(links jsonb) returns boolean language sql immutable set search_path='' as $$ select jsonb_typeof(links)='array' and jsonb_array_length(links)<=10 and not exists(select 1 from jsonb_array_elements_text(links) x where length(x)>2000 or x !~ '^https://[^[:space:]]+$'); $$;
create function private.learning_asset_read(asset uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.learning_assets; c jsonb;
begin
 select * into a from public.learning_assets where id=asset and status='ready';if not found then return false; end if;
 c:=private.learning_context(a.teaching_class_id);if c is null then return false; end if;
 if a.target_type='material' then return exists(select 1 from public.learning_materials m where m.id=a.target_id and m.teaching_class_id=a.teaching_class_id and ((c->>'manager')::boolean or private.learning_published(m.status,m.publish_at)));
 elsif a.target_type='assignment' then return exists(select 1 from public.learning_assignments t where t.id=a.target_id and t.teaching_class_id=a.teaching_class_id and ((c->>'manager')::boolean or private.learning_published(t.status,t.publish_at)));
 else return a.owner_id=auth.uid() or ((c->>'manager')::boolean and exists(select 1 from public.learning_submission_versions v where a.id=any(v.asset_ids)));
 end if;
end; $$;
create function private.daily_access(school uuid,room uuid,on_date date,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(school) and exists(select 1 from public.classrooms c join public.semesters s on s.school_id=c.school_id and s.id=c.semester_id where c.school_id=school and c.id=room and on_date between s.starts_on and s.ends_on and (
 (writing and s.status='active' and on_date<=(now() at time zone 'Asia/Jakarta')::date and (private.has_school_role(school,'admin') or (on_date=(now() at time zone 'Asia/Jakarta')::date and private.duty_scheduled(school,on_date)))) or
 (not writing and (private.has_school_role(school,'admin') or private.has_school_role(school,'principal') or
 (private.has_school_role(school,'homeroom_teacher') and exists(select 1 from public.homeroom_assignments h where h.school_id=school and h.classroom_id=room and h.teacher_id=auth.uid() and h.active)) or
 (private.has_school_role(school,'teacher') and exists(select 1 from public.teaching_classes t where t.school_id=school and t.classroom_id=room and t.teacher_id=auth.uid() and t.active)) or
 (private.has_school_role(school,'duty_teacher') and exists(select 1 from public.duty_assignments d where d.school_id=school and d.semester_id=s.id and d.teacher_id=auth.uid() and d.active and extract(isodow from on_date)::smallint=any(d.weekdays)))))));
$$;
create table private.learning_asset_checks(asset_id uuid primary key references public.learning_assets(id),nonce uuid not null,expires_at timestamptz not null default now()+interval '2 minutes');
alter table private.learning_asset_checks enable row level security;
revoke all on private.learning_asset_checks from public,anon,authenticated;
grant all on private.learning_asset_checks to service_role;
-- Bukti pemeriksaan signature hanya dapat diterbitkan backend layanan.
create function public.learning_asset_attest(asset uuid,proof uuid) returns void language sql security invoker set search_path='' as $$
 insert into private.learning_asset_checks(asset_id,nonce) values(asset,proof) on conflict(asset_id) do update set nonce=excluded.nonce,expires_at=now()+interval '2 minutes';
$$;
revoke all on function public.learning_asset_attest(uuid,uuid) from public,anon,authenticated;
grant execute on function public.learning_asset_attest(uuid,uuid) to service_role;
revoke all on function private.learning_context(uuid),private.learning_published(text,timestamptz),private.learning_links(jsonb),private.learning_asset_read(uuid),private.daily_access(uuid,uuid,date,boolean) from public,anon,authenticated;
grant execute on function private.learning_context(uuid),private.learning_published(text,timestamptz),private.learning_links(jsonb),private.learning_asset_read(uuid),private.daily_access(uuid,uuid,date,boolean) to service_role;
commit;
