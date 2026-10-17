begin;
create table public.curriculum_versions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 name text not null check(length(trim(name)) between 2 and 100), version text not null check(length(trim(version)) between 1 and 40),
 description text not null default '' check(length(description)<=1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,name,version),unique(school_id,id)
);
create table public.grade_levels (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 number smallint not null check(number between 1 and 12), name text not null check(length(trim(name)) between 1 and 50),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,number),unique(school_id,id)
);
create table public.classrooms (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 semester_id uuid not null,grade_level_id uuid not null,name text not null check(length(trim(name)) between 1 and 50),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(school_id,semester_id,name),unique(school_id,id),unique(school_id,id,semester_id),
 foreign key(school_id,semester_id) references public.semesters(school_id,id),
 foreign key(school_id,grade_level_id) references public.grade_levels(school_id,id)
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 code text not null check(length(trim(code)) between 1 and 30),name text not null check(length(trim(name)) between 2 and 100),
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(school_id,code),unique(school_id,id)
);
create table public.teaching_classes (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 classroom_id uuid not null,subject_id uuid not null,curriculum_version_id uuid not null,teacher_id uuid not null,active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,classroom_id,subject_id),unique(school_id,id),
 foreign key(school_id,classroom_id) references public.classrooms(school_id,id),
 foreign key(school_id,subject_id) references public.subjects(school_id,id),
 foreign key(school_id,curriculum_version_id) references public.curriculum_versions(school_id,id),
 foreign key(school_id,teacher_id) references public.school_memberships(school_id,user_id)
);
create table public.student_enrollments (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 classroom_id uuid not null,semester_id uuid not null,student_id uuid not null,status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,id),
 foreign key(school_id,classroom_id,semester_id) references public.classrooms(school_id,id,semester_id),
 foreign key(school_id,student_id) references public.school_memberships(school_id,user_id),unique(school_id,classroom_id,student_id)
);
create unique index enrollment_one_active_class on public.student_enrollments(school_id,semester_id,student_id) where status='active';
create table public.homeroom_assignments (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),classroom_id uuid not null,teacher_id uuid not null,active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,classroom_id),unique(school_id,id),
 foreign key(school_id,classroom_id) references public.classrooms(school_id,id),
 foreign key(school_id,teacher_id) references public.school_memberships(school_id,user_id)
);
create table public.duty_assignments (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),teacher_id uuid not null,active boolean not null default true,
 starts_on date not null,ends_on date not null,check(ends_on>=starts_on),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,teacher_id,starts_on,ends_on),unique(school_id,id),
 foreign key(school_id,teacher_id) references public.school_memberships(school_id,user_id)
);
create table public.guardian_students (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),guardian_id uuid not null,student_id uuid not null,
 active boolean not null default true,relationship text not null check(length(trim(relationship)) between 2 and 50),linked_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,guardian_id,student_id),unique(school_id,id),check(guardian_id<>student_id),
 foreign key(school_id,guardian_id) references public.school_memberships(school_id,user_id),
 foreign key(school_id,student_id) references public.school_memberships(school_id,user_id)
);
create table public.student_details (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null,
 student_number text not null check(length(trim(student_number)) between 1 and 40),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,student_id),unique(school_id,student_number),unique(school_id,id),
 foreign key(school_id,student_id) references public.school_memberships(school_id,user_id)
);
create table public.staff_details (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),teacher_id uuid not null,
 staff_code text not null check(length(trim(staff_code)) between 1 and 40),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(school_id,teacher_id),unique(school_id,staff_code),unique(school_id,id),
 foreign key(school_id,teacher_id) references public.school_memberships(school_id,user_id)
);
create table private.academic_imports (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),actor_id uuid not null references public.profiles(id),
 kind text not null,rows jsonb not null,status text not null default 'ready' check(status in ('ready','processing','committed','failed')),
 lease uuid,lease_until timestamptz,result jsonb,expires_at timestamptz not null default now()+interval '30 minutes',created_at timestamptz not null default now()
);
alter table private.academic_imports enable row level security;
revoke all on private.academic_imports from public,anon,authenticated;
grant all on private.academic_imports to service_role;
create index academic_imports_actor_idx on private.academic_imports(actor_id,school_id,expires_at);
create index guardian_students_linked_idx on public.guardian_students(linked_by);
create index guardian_students_student_idx on public.guardian_students(school_id,student_id);
create index classrooms_grade_idx on public.classrooms(school_id,grade_level_id);
create index classrooms_semester_idx on public.classrooms(school_id,semester_id);
create index teaching_classes_teacher_idx on public.teaching_classes(school_id,teacher_id);
create index teaching_classes_subject_idx on public.teaching_classes(school_id,subject_id);
create index teaching_classes_curriculum_idx on public.teaching_classes(school_id,curriculum_version_id);
create index enrollments_student_idx on public.student_enrollments(school_id,student_id,semester_id);
create index homeroom_teacher_idx on public.homeroom_assignments(school_id,teacher_id);
create index duty_teacher_idx on public.duty_assignments(school_id,teacher_id);
alter table public.curriculum_versions enable row level security;
revoke all on public.curriculum_versions from public,anon,authenticated;
grant select on public.curriculum_versions to authenticated;
grant all on public.curriculum_versions to service_role;
create trigger curriculum_versions_updated before update on public.curriculum_versions for each row execute function private.touch_updated_at();
alter table public.grade_levels enable row level security;
revoke all on public.grade_levels from public,anon,authenticated;
grant select on public.grade_levels to authenticated;
grant all on public.grade_levels to service_role;
create trigger grade_levels_updated before update on public.grade_levels for each row execute function private.touch_updated_at();
alter table public.classrooms enable row level security;
revoke all on public.classrooms from public,anon,authenticated;
grant select on public.classrooms to authenticated;
grant all on public.classrooms to service_role;
create trigger classrooms_updated before update on public.classrooms for each row execute function private.touch_updated_at();
alter table public.subjects enable row level security;
revoke all on public.subjects from public,anon,authenticated;
grant select on public.subjects to authenticated;
grant all on public.subjects to service_role;
create trigger subjects_updated before update on public.subjects for each row execute function private.touch_updated_at();
alter table public.teaching_classes enable row level security;
revoke all on public.teaching_classes from public,anon,authenticated;
grant select on public.teaching_classes to authenticated;
grant all on public.teaching_classes to service_role;
create trigger teaching_classes_updated before update on public.teaching_classes for each row execute function private.touch_updated_at();
alter table public.student_enrollments enable row level security;
revoke all on public.student_enrollments from public,anon,authenticated;
grant select on public.student_enrollments to authenticated;
grant all on public.student_enrollments to service_role;
create trigger student_enrollments_updated before update on public.student_enrollments for each row execute function private.touch_updated_at();
alter table public.homeroom_assignments enable row level security;
revoke all on public.homeroom_assignments from public,anon,authenticated;
grant select on public.homeroom_assignments to authenticated;
grant all on public.homeroom_assignments to service_role;
create trigger homeroom_assignments_updated before update on public.homeroom_assignments for each row execute function private.touch_updated_at();
alter table public.duty_assignments enable row level security;
revoke all on public.duty_assignments from public,anon,authenticated;
grant select on public.duty_assignments to authenticated;
grant all on public.duty_assignments to service_role;
create trigger duty_assignments_updated before update on public.duty_assignments for each row execute function private.touch_updated_at();
alter table public.guardian_students enable row level security;
revoke all on public.guardian_students from public,anon,authenticated;
grant select on public.guardian_students to authenticated;
grant all on public.guardian_students to service_role;
create trigger guardian_students_updated before update on public.guardian_students for each row execute function private.touch_updated_at();
alter table public.student_details enable row level security;
revoke all on public.student_details from public,anon,authenticated;
grant select on public.student_details to authenticated;
grant all on public.student_details to service_role;
create trigger student_details_updated before update on public.student_details for each row execute function private.touch_updated_at();
alter table public.staff_details enable row level security;
revoke all on public.staff_details from public,anon,authenticated;
grant select on public.staff_details to authenticated;
grant all on public.staff_details to service_role;
create trigger staff_details_updated before update on public.staff_details for each row execute function private.touch_updated_at();

create function private.user_school_role(school uuid,usr uuid,role_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.school_memberships m join public.membership_roles r on r.membership_id=m.id and r.school_id=m.school_id join public.profiles pr on pr.id=m.user_id
 where m.school_id=school and m.user_id=usr and m.status='active' and pr.status='active' and r.role_code=role_name);
$$;
create function private.classroom_access(school uuid,room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(school) and (
 private.has_school_role(school,'admin') or private.has_school_role(school,'principal') or
 (private.has_school_role(school,'duty_teacher') and exists(select 1 from public.duty_assignments d where d.school_id=school and d.teacher_id=auth.uid() and d.active and (now() at time zone 'Asia/Jakarta')::date between d.starts_on and d.ends_on)) or
 (private.has_school_role(school,'teacher') and exists(select 1 from public.teaching_classes t where t.school_id=school and t.classroom_id=room and t.teacher_id=auth.uid() and t.active)) or
 (private.has_school_role(school,'homeroom_teacher') and exists(select 1 from public.homeroom_assignments h where h.school_id=school and h.classroom_id=room and h.teacher_id=auth.uid() and h.active)) or
 (private.has_school_role(school,'student') and exists(select 1 from public.student_enrollments e where e.school_id=school and e.classroom_id=room and e.student_id=auth.uid())) or
 (private.has_school_role(school,'guardian') and exists(select 1 from public.student_enrollments e join public.guardian_students g on g.school_id=e.school_id and g.student_id=e.student_id where e.school_id=school and e.classroom_id=room and g.guardian_id=auth.uid() and g.active)));
$$;
revoke all on function private.user_school_role(uuid,uuid,text),private.classroom_access(uuid,uuid) from public,anon,authenticated;
grant execute on function private.classroom_access(uuid,uuid) to authenticated,service_role;
grant execute on function private.user_school_role(uuid,uuid,text) to service_role;
create policy curriculum_read on public.curriculum_versions for select to authenticated using(private.is_member(school_id));
create policy grades_read on public.grade_levels for select to authenticated using(private.is_member(school_id));
create policy subjects_read on public.subjects for select to authenticated using(private.is_member(school_id));
create policy classrooms_read on public.classrooms for select to authenticated using(private.classroom_access(school_id,id));
create function private.academic_scope(school uuid,room uuid,student uuid default null,teacher uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(school) and (
 private.has_school_role(school,'admin') or private.has_school_role(school,'principal') or
 (private.has_school_role(school,'teacher') and (teacher=auth.uid() or (student is not null and exists(select 1 from public.teaching_classes t where t.school_id=school and t.classroom_id=room and t.teacher_id=auth.uid() and t.active)))) or
 (private.has_school_role(school,'homeroom_teacher') and exists(select 1 from public.homeroom_assignments h where h.school_id=school and h.classroom_id=room and h.teacher_id=auth.uid() and h.active)) or
 (student is not null and student=auth.uid() and private.has_school_role(school,'student')) or
 (student is null and private.has_school_role(school,'student') and exists(select 1 from public.student_enrollments e where e.school_id=school and e.classroom_id=room and e.student_id=auth.uid())) or
 (private.has_school_role(school,'guardian') and exists(select 1 from public.guardian_students g join public.student_enrollments e on e.school_id=g.school_id and e.student_id=g.student_id where g.school_id=school and g.guardian_id=auth.uid() and g.active and e.classroom_id=room and (student is null or g.student_id=student))) or
 (student is not null and private.has_school_role(school,'duty_teacher') and exists(select 1 from public.duty_assignments d where d.school_id=school and d.teacher_id=auth.uid() and d.active and (now() at time zone 'Asia/Jakarta')::date between d.starts_on and d.ends_on)));
$$;
revoke all on function private.academic_scope(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function private.academic_scope(uuid,uuid,uuid,uuid) to authenticated,service_role;
create policy teaching_classes_read on public.teaching_classes for select to authenticated using(private.academic_scope(school_id,classroom_id,null,case when active then teacher_id else null end));
create policy enrollments_read on public.student_enrollments for select to authenticated using(private.academic_scope(school_id,classroom_id,student_id,null));
create policy homeroom_read on public.homeroom_assignments for select to authenticated using(private.classroom_access(school_id,classroom_id));
create policy duty_read on public.duty_assignments for select to authenticated using(private.is_member(school_id) and (teacher_id=(select auth.uid()) or private.has_school_role(school_id,'admin') or private.has_school_role(school_id,'principal')));
create policy guardians_read on public.guardian_students for select to authenticated using(private.is_member(school_id) and ((active and guardian_id=(select auth.uid()) and private.has_school_role(school_id,'guardian')) or private.has_school_role(school_id,'admin') or private.has_school_role(school_id,'principal')));
create policy student_details_read on public.student_details for select to authenticated using(private.is_member(school_id) and (student_id=(select auth.uid()) or private.has_school_role(school_id,'admin') or private.has_school_role(school_id,'principal')));
create policy staff_details_read on public.staff_details for select to authenticated using(private.is_member(school_id) and (teacher_id=(select auth.uid()) or private.has_school_role(school_id,'admin') or private.has_school_role(school_id,'principal')));

-- Hanya dipanggil dispatcher internal setelah otorisasi, dengan whitelist entitas/kolom.
create function private.academic_apply(school uuid,entity text,d jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()); room uuid; sem uuid; oldrow jsonb; saved uuid; st text;
begin
 if entity not in ('curriculum_versions','grade_levels','classrooms','subjects','teaching_classes','student_enrollments','homeroom_assignments','duty_assignments','guardian_students','student_details','staff_details','academic_years','semesters') then raise exception 'Jenis data tidak dikenal.'; end if;
 execute format('select to_jsonb(t) from public.%I t where school_id=$1 and id=$2',entity) into oldrow using school,rid;
 if d ? 'id' and oldrow is null then raise exception 'Data tidak ditemukan di sekolah ini.'; end if;
 if oldrow is not null and nullif(d->>'expected_updated_at','')::timestamptz is distinct from (oldrow->>'updated_at')::timestamptz then raise exception 'Data berubah. Muat ulang sebelum menyimpan.'; end if;
 if entity in ('classrooms','student_enrollments') then sem:=(d->>'semester_id')::uuid;
 elsif entity in ('teaching_classes','homeroom_assignments') then
  room:=(d->>'classroom_id')::uuid;
  select semester_id into sem from public.classrooms where school_id=school and id=room;
  if sem is null then raise exception 'Kelas tidak ditemukan.'; end if;
 end if;
 if oldrow is not null and entity='classrooms' and (oldrow->>'semester_id' is distinct from d->>'semester_id' or oldrow->>'grade_level_id' is distinct from d->>'grade_level_id') then raise exception 'Semester dan tingkat kelas tidak dapat dipindah. Buat kelas baru.'; end if;
 if oldrow is not null and entity='student_enrollments' and (oldrow->>'semester_id' is distinct from d->>'semester_id' or oldrow->>'student_id' is distinct from d->>'student_id') then raise exception 'Siswa dan semester keanggotaan tidak dapat diubah.'; end if;
 if sem is not null then
  select status into st from public.semesters where school_id=school and id=sem;
  if st is null or st='archived' then raise exception 'Semester tidak ditemukan atau sudah diarsipkan.'; end if;
 end if;
 -- Menolak pemindahan objek dari semester arsip ke semester terbuka.
 if oldrow is not null and entity in ('teaching_classes','homeroom_assignments','student_enrollments') and exists(
 select 1 from public.classrooms c join public.semesters s on s.id=c.semester_id and s.school_id=c.school_id where c.school_id=school and c.id=(oldrow->>'classroom_id')::uuid and s.status='archived') then raise exception 'Data semester arsip hanya dapat dibaca.'; end if;
 if entity='curriculum_versions' and oldrow is not null and exists(select 1 from public.teaching_classes where school_id=school and curriculum_version_id=rid) then raise exception 'Kurikulum sudah digunakan. Buat versi baru.'; end if;
 if entity='grade_levels' and oldrow is not null and exists(select 1 from public.classrooms where school_id=school and grade_level_id=rid) and oldrow->>'number' is distinct from d->>'number' then raise exception 'Nomor tingkat sudah digunakan. Buat tingkat baru.'; end if;
 if entity in ('teaching_classes','staff_details') and not private.user_school_role(school,(d->>'teacher_id')::uuid,'teacher') then raise exception 'Pilih pengguna aktif dengan peran Guru.'; end if;
 if entity='homeroom_assignments' and not private.user_school_role(school,(d->>'teacher_id')::uuid,'homeroom_teacher') then raise exception 'Pengguna belum memiliki peran Wali Kelas.'; end if;
 if entity='duty_assignments' and not private.user_school_role(school,(d->>'teacher_id')::uuid,'duty_teacher') then raise exception 'Pengguna belum memiliki peran Guru Piket.'; end if;
 if entity in ('student_enrollments','student_details','guardian_students') and not private.user_school_role(school,(d->>'student_id')::uuid,'student') then raise exception 'Pilih pengguna aktif dengan peran Siswa.'; end if;
 if entity='guardian_students' and not private.user_school_role(school,(d->>'guardian_id')::uuid,'guardian') then raise exception 'Pengguna belum memiliki peran Orang Tua / Wali.'; end if;
 if entity='academic_years' then
  if length(trim(coalesce(d->>'name',''))) not between 2 and 100 then raise exception 'Nama tahun ajaran harus 2–100 karakter.'; end if;
  if exists(select 1 from public.academic_years where school_id=school and id<>rid and daterange(starts_on,ends_on,'[]') && daterange((d->>'starts_on')::date,(d->>'ends_on')::date,'[]')) then raise exception 'Tanggal tahun ajaran saling bertumpang tindih.'; end if;
  if exists(select 1 from public.semesters where school_id=school and academic_year_id=rid and (starts_on<(d->>'starts_on')::date or ends_on>(d->>'ends_on')::date)) then raise exception 'Tanggal tahun harus memuat seluruh semester.'; end if;
  if oldrow->>'status'='archived' and (d->>'status'<>'draft' or length(trim(coalesce(d->>'reason','')))<5) then raise exception 'Buka arsip ke status Draf dengan alasan minimal 5 karakter.'; end if;
  if d->>'status'='draft' and exists(select 1 from public.semesters where school_id=school and academic_year_id=rid and status='active') then raise exception 'Arsipkan semester aktif sebelum mengubah tahun menjadi Draf.'; end if;
  if d->>'status'='active' then
   update public.semesters set status='archived' where school_id=school and academic_year_id in(select id from public.academic_years where school_id=school and id<>rid and status='active');
   update public.academic_years set status='archived' where school_id=school and id<>rid and status='active';
  elsif d->>'status'='archived' then update public.semesters set status='archived' where school_id=school and academic_year_id=rid; end if;
 elsif entity='semesters' then
  if oldrow is not null and oldrow->>'academic_year_id' is distinct from d->>'academic_year_id' then raise exception 'Tahun ajaran semester tidak dapat dipindah.'; end if;
  if not exists(select 1 from public.academic_years where school_id=school and id=(d->>'academic_year_id')::uuid and status<>'archived' and starts_on<=(d->>'starts_on')::date and ends_on>=(d->>'ends_on')::date) then raise exception 'Tanggal semester harus berada dalam tahun ajaran yang belum diarsipkan.'; end if;
  if exists(select 1 from public.semesters where school_id=school and academic_year_id=(d->>'academic_year_id')::uuid and id<>rid and daterange(starts_on,ends_on,'[]') && daterange((d->>'starts_on')::date,(d->>'ends_on')::date,'[]')) then raise exception 'Tanggal semester saling bertumpang tindih.'; end if;
  if oldrow->>'status'='archived' and (d->>'status'<>'draft' or length(trim(coalesce(d->>'reason','')))<5) then raise exception 'Buka arsip ke status Draf dengan alasan minimal 5 karakter.'; end if;
  if d->>'status'='active' then
   if not exists(select 1 from public.academic_years where school_id=school and id=(d->>'academic_year_id')::uuid and status='active') then raise exception 'Aktifkan tahun ajaran lebih dahulu.'; end if;
   update public.semesters set status='archived' where school_id=school and id<>rid and status='active';
  end if;
 elsif entity='teaching_classes' then
  if not exists(select 1 from public.subjects where school_id=school and id=(d->>'subject_id')::uuid and active) then raise exception 'Mata pelajaran tidak aktif atau tidak ditemukan.'; end if;
 end if;
 case entity
 when 'academic_years' then
  insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values(rid,school,(d->>'name')::text,(d->>'starts_on')::date,(d->>'ends_on')::date,(d->>'status')::text)
  on conflict(id) do update set name=excluded.name,starts_on=excluded.starts_on,ends_on=excluded.ends_on,status=excluded.status where academic_years.school_id=school returning id into saved;
 when 'semesters' then
  insert into public.semesters(id,school_id,academic_year_id,number,starts_on,ends_on,status) values(rid,school,(d->>'academic_year_id')::uuid,(d->>'number')::smallint,(d->>'starts_on')::date,(d->>'ends_on')::date,(d->>'status')::text)
  on conflict(id) do update set academic_year_id=excluded.academic_year_id,number=excluded.number,starts_on=excluded.starts_on,ends_on=excluded.ends_on,status=excluded.status where semesters.school_id=school returning id into saved;
 when 'curriculum_versions' then
  insert into public.curriculum_versions(id,school_id,name,version,description) values(rid,school,(d->>'name')::text,(d->>'version')::text,(d->>'description')::text)
  on conflict(id) do update set name=excluded.name,version=excluded.version,description=excluded.description where curriculum_versions.school_id=school returning id into saved;
 when 'grade_levels' then
  insert into public.grade_levels(id,school_id,number,name) values(rid,school,(d->>'number')::smallint,(d->>'name')::text)
  on conflict(id) do update set number=excluded.number,name=excluded.name where grade_levels.school_id=school returning id into saved;
 when 'classrooms' then
  insert into public.classrooms(id,school_id,semester_id,grade_level_id,name) values(rid,school,(d->>'semester_id')::uuid,(d->>'grade_level_id')::uuid,(d->>'name')::text)
  on conflict(id) do update set semester_id=excluded.semester_id,grade_level_id=excluded.grade_level_id,name=excluded.name where classrooms.school_id=school returning id into saved;
 when 'subjects' then
  insert into public.subjects(id,school_id,code,name,active) values(rid,school,(d->>'code')::text,(d->>'name')::text,(d->>'active')::boolean)
  on conflict(id) do update set code=excluded.code,name=excluded.name,active=excluded.active where subjects.school_id=school returning id into saved;
 when 'teaching_classes' then
  insert into public.teaching_classes(id,school_id,active,classroom_id,subject_id,curriculum_version_id,teacher_id) values(rid,school,coalesce((d->>'active')::boolean,true),(d->>'classroom_id')::uuid,(d->>'subject_id')::uuid,(d->>'curriculum_version_id')::uuid,(d->>'teacher_id')::uuid)
  on conflict(id) do update set active=excluded.active,classroom_id=excluded.classroom_id,subject_id=excluded.subject_id,curriculum_version_id=excluded.curriculum_version_id,teacher_id=excluded.teacher_id where teaching_classes.school_id=school returning id into saved;
 when 'student_enrollments' then
  insert into public.student_enrollments(id,school_id,classroom_id,semester_id,student_id,status) values(rid,school,(d->>'classroom_id')::uuid,(d->>'semester_id')::uuid,(d->>'student_id')::uuid,(d->>'status')::text)
  on conflict(id) do update set classroom_id=excluded.classroom_id,semester_id=excluded.semester_id,student_id=excluded.student_id,status=excluded.status where student_enrollments.school_id=school returning id into saved;
 when 'homeroom_assignments' then
  insert into public.homeroom_assignments(id,school_id,active,classroom_id,teacher_id) values(rid,school,coalesce((d->>'active')::boolean,true),(d->>'classroom_id')::uuid,(d->>'teacher_id')::uuid)
  on conflict(id) do update set active=excluded.active,classroom_id=excluded.classroom_id,teacher_id=excluded.teacher_id where homeroom_assignments.school_id=school returning id into saved;
 when 'duty_assignments' then
  insert into public.duty_assignments(id,school_id,active,teacher_id,starts_on,ends_on) values(rid,school,coalesce((d->>'active')::boolean,true),(d->>'teacher_id')::uuid,(d->>'starts_on')::date,(d->>'ends_on')::date)
  on conflict(id) do update set active=excluded.active,teacher_id=excluded.teacher_id,starts_on=excluded.starts_on,ends_on=excluded.ends_on where duty_assignments.school_id=school returning id into saved;
 when 'guardian_students' then
  insert into public.guardian_students(id,school_id,active,guardian_id,student_id,relationship,linked_by) values(rid,school,coalesce((d->>'active')::boolean,true),(d->>'guardian_id')::uuid,(d->>'student_id')::uuid,(d->>'relationship')::text,auth.uid())
  on conflict(id) do update set active=excluded.active,guardian_id=excluded.guardian_id,student_id=excluded.student_id,relationship=excluded.relationship,linked_by=excluded.linked_by where guardian_students.school_id=school returning id into saved;
 when 'student_details' then
  insert into public.student_details(id,school_id,student_id,student_number) values(rid,school,(d->>'student_id')::uuid,(d->>'student_number')::text)
  on conflict(id) do update set student_id=excluded.student_id,student_number=excluded.student_number where student_details.school_id=school returning id into saved;
 when 'staff_details' then
  insert into public.staff_details(id,school_id,teacher_id,staff_code) values(rid,school,(d->>'teacher_id')::uuid,(d->>'staff_code')::text)
  on conflict(id) do update set teacher_id=excluded.teacher_id,staff_code=excluded.staff_code where staff_details.school_id=school returning id into saved;
 else raise exception 'Jenis data tidak dikenal.';
 end case;
 if saved is null then raise exception 'Data tidak ditemukan.'; end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(school,auth.uid(),case when oldrow is null then 'academic_create' else 'academic_update' end,entity,saved::text,jsonb_build_object('before',oldrow,'after',d-'expected_updated_at'));
 return saved;
end; $$;
revoke all on function private.academic_apply(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.academic_apply(uuid,text,jsonb) to service_role;

create function private.academic_import_row(school uuid,kind text,r jsonb) returns void language plpgsql security definer set search_path='' as $$
declare usr uuid; room uuid; sem uuid; gr uuid; subj uuid; cur uuid; guardian uuid; target uuid;
begin
 if kind='users' then
  if coalesce(r->>'username','') !~ '^[a-z0-9][a-z0-9._-]{2,49}$' or length(trim(coalesce(r->>'name',''))) not between 2 and 100 then raise exception 'Username atau nama tidak valid.'; end if;
  if exists(select 1 from public.profiles where username_normalized=r->>'username') then raise exception 'Username sudah digunakan.'; end if;
  if jsonb_typeof(r->'roles') is distinct from 'array' or jsonb_array_length(r->'roles') not between 1 and 7 then raise exception 'Peran tidak valid.'; end if;
  if exists(select 1 from jsonb_array_elements_text(r->'roles') v where v='central_admin' or not exists(select 1 from public.roles where code=v)) then raise exception 'Peran tidak valid.'; end if;
  return;
 end if;
 if kind in ('students','teachers','teaching') then
  select id into usr from public.profiles where username_normalized=r->>'username';
  if usr is null then raise exception 'Username belum dibuat. Impor pengguna terlebih dahulu.'; end if;
 end if;
 if kind in ('students','classrooms','teaching') then
  select s.id into sem from public.semesters s join public.academic_years y on y.id=s.academic_year_id and y.school_id=s.school_id where s.school_id=school and y.name=r->>'year' and s.number=(r->>'semester')::int;
  if sem is null then raise exception 'Tahun ajaran / semester tidak ditemukan.'; end if;
  if kind<>'classrooms' then
   select id into room from public.classrooms where school_id=school and semester_id=sem and name=r->>'classroom';
   if room is null then raise exception 'Rombel tidak ditemukan pada semester tersebut.'; end if;
  end if;
 end if;
 if kind='subjects' then
  perform private.academic_apply(school,'subjects',jsonb_build_object('code',r->>'code','name',r->>'name','active',true));
 elsif kind='classrooms' then
  select id into gr from public.grade_levels where school_id=school and number=(r->>'grade')::int;
  if gr is null then raise exception 'Tingkat belum dibuat.'; end if;
  perform private.academic_apply(school,'classrooms',jsonb_build_object('semester_id',sem,'grade_level_id',gr,'name',r->>'name'));
 elsif kind='teachers' then
  perform private.academic_apply(school,'staff_details',jsonb_build_object('teacher_id',usr,'staff_code',r->>'staff_code'));
 elsif kind='students' then
  perform private.academic_apply(school,'student_details',jsonb_build_object('student_id',usr,'student_number',r->>'student_number'));
  perform private.academic_apply(school,'student_enrollments',jsonb_build_object('student_id',usr,'classroom_id',room,'semester_id',sem,'status','active'));
 elsif kind='teaching' then
  select id into subj from public.subjects where school_id=school and code=r->>'subject';
  select id into cur from public.curriculum_versions where school_id=school and name=r->>'curriculum' and version=r->>'version';
  if subj is null or cur is null then raise exception 'Kode mapel atau versi kurikulum tidak ditemukan.'; end if;
  perform private.academic_apply(school,'teaching_classes',jsonb_build_object('teacher_id',usr,'classroom_id',room,'subject_id',subj,'curriculum_version_id',cur));
 elsif kind='guardians' then
  select id into guardian from public.profiles where username_normalized=r->>'guardian';
  select id into target from public.profiles where username_normalized=r->>'student';
  perform private.academic_apply(school,'guardian_students',jsonb_build_object('guardian_id',guardian,'student_id',target,'relationship',r->>'relationship'));
 else raise exception 'Jenis impor tidak dikenal.';
 end if;
end; $$;
revoke all on function private.academic_import_row(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.academic_import_row(uuid,text,jsonb) to service_role;

create function private.academic_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare school uuid:=(p->>'school')::uuid; actor uuid:=auth.uid(); rowp public.profiles; sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
 result jsonb; rowsdata jsonb; r jsonb; errors jsonb:='[]'; n int:=0; message text; ticket private.academic_imports; mid uuid; uid uuid; v_lease uuid;
begin
 select pr.* into rowp from public.profiles pr join auth.sessions s on s.user_id=pr.id
 where pr.id=actor and s.id=sid and pr.status='active' and not pr.must_change_password and pr.email_verified_at is not null
 and s.created_at>pr.credentials_changed_at and (s.not_after is null or s.not_after>clock_timestamp());
 if not found then raise exception 'Sesi atau aktivasi tidak valid.' using errcode='42501'; end if;
 -- Lock sekolah menyerialkan pengalihan periode, validasi impor dan perubahan relasi.
 perform 1 from public.schools where id=school for update;
 if not found or not private.user_school_role(school,actor,'admin') then raise exception 'Hanya admin sekolah yang dapat mengelola data ini.' using errcode='42501'; end if;
 if cmd='state' then
  result:=jsonb_build_object('school',(select to_jsonb(t) from public.schools t where id=school));
  result:=result||jsonb_build_object('academic_years',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.academic_years t where school_id=school));
  result:=result||jsonb_build_object('semesters',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.semesters t where school_id=school));
  result:=result||jsonb_build_object('curriculum_versions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.curriculum_versions t where school_id=school));
  result:=result||jsonb_build_object('grade_levels',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.grade_levels t where school_id=school));
  result:=result||jsonb_build_object('classrooms',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.classrooms t where school_id=school));
  result:=result||jsonb_build_object('subjects',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.subjects t where school_id=school));
  result:=result||jsonb_build_object('teaching_classes',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.teaching_classes t where school_id=school));
  result:=result||jsonb_build_object('student_enrollments',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.student_enrollments t where school_id=school));
  result:=result||jsonb_build_object('homeroom_assignments',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.homeroom_assignments t where school_id=school));
  result:=result||jsonb_build_object('duty_assignments',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.duty_assignments t where school_id=school));
  result:=result||jsonb_build_object('guardian_students',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.guardian_students t where school_id=school));
  result:=result||jsonb_build_object('student_details',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.student_details t where school_id=school));
  result:=result||jsonb_build_object('staff_details',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.id),'[]') from public.staff_details t where school_id=school));
  result:=result||jsonb_build_object('users',(select coalesce(jsonb_agg(x order by x.username_normalized),'[]') from (
   select pr.id,pr.username_normalized,pr.full_name,pr.status,(select jsonb_agg(r.role_code) from public.membership_roles r where r.membership_id=m.id) roles
   from public.school_memberships m join public.profiles pr on pr.id=m.user_id where m.school_id=school and m.status='active'
  ) x));return result;
 elsif cmd='save' then
  return jsonb_build_object('id',private.academic_apply(school,p->>'entity',p->'data'));
 elsif cmd='school' then
  if length(trim(coalesce(p->'data'->>'name',''))) not between 2 and 150 or p->'data'->>'education_level' not in ('MI/SD','MTs/SMP','MA/SMA','Beberapa jenjang') then raise exception 'Nama atau jenjang sekolah tidak valid.'; end if;
  update public.schools set name=p->'data'->>'name',education_level=p->'data'->>'education_level',logo_url=nullif(p->'data'->>'logo_url','') where id=school and updated_at=(p->'data'->>'expected_updated_at')::timestamptz;
  if not found then raise exception 'Data berubah. Muat ulang sebelum menyimpan.'; end if;
  insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(school,actor,'school_update','schools',school::text,p->'data');
  return '{}';
 elsif cmd='preview' then
  delete from private.academic_imports where expires_at<clock_timestamp()-interval '1 day' and status<>'processing';
  rowsdata:=p->'rows';
  if jsonb_typeof(rowsdata) is distinct from 'array' or jsonb_array_length(rowsdata) not between 1 and (case when p->>'kind'='users' then 25 else 250 end) then raise exception 'Jumlah baris impor tidak valid.'; end if;
  -- Seluruh simulasi dibatalkan, termasuk audit. Variabel errors tetap bertahan.
  begin
   for r in select value from jsonb_array_elements(rowsdata) loop
    n:=n+1;
    begin
     if p->>'kind'='users' and exists(select 1 from jsonb_array_elements(rowsdata) x where x->>'username'=r->>'username' having count(*)>1) then raise exception 'Username ganda di dalam berkas.'; end if;
     perform private.academic_import_row(school,p->>'kind',r);
    exception
     when unique_violation then errors:=errors||jsonb_build_array(jsonb_build_object('row',n+1,'message','Data duplikat di berkas atau sudah ada di database.'));
     when foreign_key_violation then errors:=errors||jsonb_build_array(jsonb_build_object('row',n+1,'message','Referensi tidak ditemukan di sekolah ini.'));
     when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow then errors:=errors||jsonb_build_array(jsonb_build_object('row',n+1,'message','Nilai kolom atau tanggal tidak valid.'));
     when raise_exception then errors:=errors||jsonb_build_array(jsonb_build_object('row',n+1,'message',sqlerrm));
    end;
   end loop;
   raise exception using errcode='P0002',message='Rollback preview';
  exception when no_data_found then null; end;
  if jsonb_array_length(errors)>0 then return jsonb_build_object('errors',errors,'count',n); end if;
  if p->>'kind'='users' then select jsonb_agg(value||jsonb_build_object('_id',gen_random_uuid())) into rowsdata from jsonb_array_elements(rowsdata); end if;
  insert into private.academic_imports(school_id,actor_id,kind,rows) values(school,actor,p->>'kind',rowsdata) returning * into ticket;
  return jsonb_build_object('ticket',ticket.id,'count',n,'errors','[]'::jsonb,'expires_at',ticket.expires_at);
 elsif cmd in ('import','claim','commit-users','abort') then
  select * into ticket from private.academic_imports where id=(p->>'ticket')::uuid and school_id=school and actor_id=actor for update;
  if not found then raise exception 'Pratinjau impor tidak ditemukan.'; end if;
  if ticket.status='committed' then return jsonb_build_object('committed',true,'count',ticket.result->'count'); end if;
  if ticket.expires_at<clock_timestamp() then raise exception 'Pratinjau kedaluwarsa. Unggah dan periksa ulang.'; end if;
  if cmd='claim' then
   if ticket.kind<>'users' or ticket.status<>'ready' then raise exception 'Impor sedang diproses atau telah gagal. Buat pratinjau baru.'; end if;
   v_lease:=gen_random_uuid();update private.academic_imports set status='processing',lease=v_lease,lease_until=clock_timestamp()+interval '5 minutes' where id=ticket.id;
   return jsonb_build_object('rows',ticket.rows,'lease',v_lease);
  elsif cmd='abort' then
   update private.academic_imports i set status='failed' where i.id=ticket.id and i.status='processing' and i.lease=(p->>'lease')::uuid; return '{}';
  elsif cmd='commit-users' then
   if ticket.kind<>'users' or ticket.status<>'processing' or ticket.lease is distinct from (p->>'lease')::uuid or ticket.lease_until<clock_timestamp() then raise exception 'Proses impor tidak valid atau kedaluwarsa.'; end if;
   for r in select value from jsonb_array_elements(ticket.rows) loop
    perform private.academic_import_row(school,'users',r);
    uid:=(r->>'_id')::uuid;
    insert into public.profiles(id,username_normalized,full_name,contact_email) values(uid,r->>'username',r->>'name',nullif(r->>'email',''));
    insert into public.school_memberships(school_id,user_id) values(school,uid) returning id into mid;
    insert into public.membership_roles(school_id,membership_id,role_code) select school,mid,v from (select distinct jsonb_array_elements_text(r->'roles') v) x;
   end loop;
  else
   if ticket.kind='users' or ticket.status<>'ready' then raise exception 'Impor tidak dapat dijalankan.'; end if;
   for r in select value from jsonb_array_elements(ticket.rows) loop perform private.academic_import_row(school,ticket.kind,r); end loop;
  end if;
  update private.academic_imports set status='committed',rows='[]',result=jsonb_build_object('count',jsonb_array_length(ticket.rows)) where id=ticket.id;
  insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(school,actor,'academic_import',ticket.kind,ticket.id::text,jsonb_build_object('count',jsonb_array_length(ticket.rows)));
  return jsonb_build_object('committed',true,'count',jsonb_array_length(ticket.rows));
 else raise exception 'Tindakan tidak dikenal.';
 end if;
end; $$;
revoke all on function private.academic_command(text,jsonb) from public,anon;
grant execute on function private.academic_command(text,jsonb) to authenticated,service_role;
create function public.academic_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.academic_command(cmd,p); $$;
revoke all on function public.academic_command(text,jsonb) from public,anon;
grant execute on function public.academic_command(text,jsonb) to authenticated,service_role;
commit;
