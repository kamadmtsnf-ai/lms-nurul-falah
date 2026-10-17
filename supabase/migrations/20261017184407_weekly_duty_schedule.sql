begin;
-- Belum ada penugasan lama pada saat revisi. Tolak migrasi bila kondisi ini berubah,
-- agar tanggal lama tidak ditafsirkan sebagai hari mingguan tanpa pilihan admin.
do $$ begin if exists(select 1 from public.duty_assignments) then raise exception 'Existing duty assignments require an explicit weekly schedule migration.'; end if; end $$;
alter table public.duty_assignments
 add column semester_id uuid not null,
 add column weekdays smallint[] not null,
 add constraint duty_semester_fk foreign key(school_id,semester_id) references public.semesters(school_id,id),
 add constraint duty_weekdays_valid check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and array_position(weekdays,null) is null),
 add constraint duty_teacher_semester_unique unique(school_id,semester_id,teacher_id);
-- starts_on/ends_on tetap disimpan sebagai snapshot kompatibilitas, bukan input pengguna.

create function private.duty_scheduled(school uuid,on_date date default (now() at time zone 'Asia/Jakarta')::date) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_school_role(school,'duty_teacher') and exists(
 select 1 from public.duty_assignments d join public.semesters s on s.school_id=d.school_id and s.id=d.semester_id
 where d.school_id=school and d.teacher_id=auth.uid() and d.active and s.status='active'
 and on_date between s.starts_on and s.ends_on and extract(isodow from on_date)::smallint=any(d.weekdays));
$$;
revoke all on function private.duty_scheduled(uuid,date) from public,anon;
grant execute on function private.duty_scheduled(uuid,date) to authenticated,service_role;
create or replace function private.academic_apply(school uuid,entity text,d jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()); room uuid; sem uuid; oldrow jsonb; saved uuid; st text;
begin
 if entity not in ('curriculum_versions','grade_levels','classrooms','subjects','teaching_classes','student_enrollments','homeroom_assignments','duty_assignments','guardian_students','student_details','staff_details','academic_years','semesters') then raise exception 'Jenis data tidak dikenal.'; end if;
 execute format('select to_jsonb(t) from public.%I t where school_id=$1 and id=$2',entity) into oldrow using school,rid;
 if d ? 'id' and oldrow is null then raise exception 'Data tidak ditemukan di sekolah ini.'; end if;
 if oldrow is not null and nullif(d->>'expected_updated_at','')::timestamptz is distinct from (oldrow->>'updated_at')::timestamptz then raise exception 'Data berubah. Muat ulang sebelum menyimpan.'; end if;
 if entity in ('classrooms','student_enrollments','duty_assignments') then sem:=(d->>'semester_id')::uuid;
 elsif entity in ('teaching_classes','homeroom_assignments') then
  room:=(d->>'classroom_id')::uuid;
  select semester_id into sem from public.classrooms where school_id=school and id=room;
  if sem is null then raise exception 'Kelas tidak ditemukan.'; end if;
 end if;
 if oldrow is not null and entity='duty_assignments' and oldrow->>'semester_id' is distinct from d->>'semester_id' then raise exception 'Semester piket tidak dapat dipindah. Buat penugasan baru untuk semester lain.'; end if;
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
  if jsonb_typeof(d->'weekdays') is distinct from 'array' or jsonb_array_length(d->'weekdays') not between 1 and 7 then raise exception 'Pilih minimal satu hari piket.'; end if;
  if exists(select 1 from jsonb_array_elements_text(d->'weekdays') x where x !~ '^[1-7]$') then raise exception 'Hari piket tidak valid.'; end if;
  if (select count(distinct x) from jsonb_array_elements_text(d->'weekdays') x)<>jsonb_array_length(d->'weekdays') then raise exception 'Hari piket tidak boleh ganda.'; end if;
  insert into public.duty_assignments(id,school_id,active,teacher_id,semester_id,weekdays,starts_on,ends_on)
  select rid,school,coalesce((d->>'active')::boolean,true),(d->>'teacher_id')::uuid,sem,
   array(select x::smallint from jsonb_array_elements_text(d->'weekdays') x order by x::smallint),s.starts_on,s.ends_on
  from public.semesters s where s.school_id=school and s.id=sem
  on conflict(id) do update set active=excluded.active,teacher_id=excluded.teacher_id,semester_id=excluded.semester_id,weekdays=excluded.weekdays,starts_on=excluded.starts_on,ends_on=excluded.ends_on where duty_assignments.school_id=school returning id into saved;
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
create or replace function private.classroom_access(school uuid,room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(school) and (
 private.has_school_role(school,'admin') or private.has_school_role(school,'principal') or
 (private.duty_scheduled(school)) or
 (private.has_school_role(school,'teacher') and exists(select 1 from public.teaching_classes t where t.school_id=school and t.classroom_id=room and t.teacher_id=auth.uid() and t.active)) or
 (private.has_school_role(school,'homeroom_teacher') and exists(select 1 from public.homeroom_assignments h where h.school_id=school and h.classroom_id=room and h.teacher_id=auth.uid() and h.active)) or
 (private.has_school_role(school,'student') and exists(select 1 from public.student_enrollments e where e.school_id=school and e.classroom_id=room and e.student_id=auth.uid())) or
 (private.has_school_role(school,'guardian') and exists(select 1 from public.student_enrollments e join public.guardian_students g on g.school_id=e.school_id and g.student_id=e.student_id where e.school_id=school and e.classroom_id=room and g.guardian_id=auth.uid() and g.active)));
$$;
create or replace function private.academic_scope(school uuid,room uuid,student uuid default null,teacher uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(school) and (
 private.has_school_role(school,'admin') or private.has_school_role(school,'principal') or
 (private.has_school_role(school,'teacher') and (teacher=auth.uid() or (student is not null and exists(select 1 from public.teaching_classes t where t.school_id=school and t.classroom_id=room and t.teacher_id=auth.uid() and t.active)))) or
 (private.has_school_role(school,'homeroom_teacher') and exists(select 1 from public.homeroom_assignments h where h.school_id=school and h.classroom_id=room and h.teacher_id=auth.uid() and h.active)) or
 (student is not null and student=auth.uid() and private.has_school_role(school,'student')) or
 (student is null and private.has_school_role(school,'student') and exists(select 1 from public.student_enrollments e where e.school_id=school and e.classroom_id=room and e.student_id=auth.uid())) or
 (private.has_school_role(school,'guardian') and exists(select 1 from public.guardian_students g join public.student_enrollments e on e.school_id=g.school_id and e.student_id=g.student_id where g.school_id=school and g.guardian_id=auth.uid() and g.active and e.classroom_id=room and (student is null or g.student_id=student))) or
 (student is not null and private.duty_scheduled(school)));
$$;
commit;
