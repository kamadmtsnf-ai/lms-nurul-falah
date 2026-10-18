begin;
create table private.profile_details (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 phone text not null default '', nip text not null default '', npk text not null default '', nik text not null default '',
 photo_path text, name_changed_at timestamptz, identity_changed_at timestamptz,
 username_changed_at timestamptz, email_changed_at timestamptz, photo_changed_at timestamptz,
 revision bigint not null default 0,
 check(phone='' or phone ~ '^\+?[0-9]{8,15}$'),
 check(nip='' or nip ~ '^[0-9]{18}$'),check(npk='' or npk ~ '^[0-9]{13}$'),check(nik='' or nik ~ '^[0-9]{16}$')
);
create table private.profile_audit (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 field text not null, created_at timestamptz not null default clock_timestamp()
);
alter table private.profile_details enable row level security;
alter table private.profile_audit enable row level security;
revoke all on private.profile_details,private.profile_audit from public,anon,authenticated;
grant all on private.profile_details,private.profile_audit to service_role;
create index profile_audit_user_idx on private.profile_audit(user_id,created_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('profile-photos','profile-photos',false,3145728,array['image/webp']) on conflict(id) do nothing;

create function private.profile_command(cmd text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(p->>'actor')::uuid; sid uuid:=(p->>'session')::uuid;
 school uuid:=nullif(p->>'school','')::uuid; pr public.profiles; pd private.profile_details;
 d jsonb:=coalesce(p->'data','{}'); student boolean; teacher boolean; old_path text;
 changed boolean:=false; stamp timestamptz:=clock_timestamp(); v_roles jsonb;
begin
 select x.* into pr from public.profiles x join auth.sessions s on s.user_id=x.id
 where x.id=actor and s.id=sid and s.created_at>x.credentials_changed_at and (s.not_after is null or s.not_after>stamp)
 and x.status='active' and not x.must_change_password and (x.email_verified_at is not null or cmd='email-state') for update of x;
 if not found then raise exception 'Sesi atau aktivasi tidak valid.' using errcode='42501';end if;
 if school is not null and not exists(select 1 from public.school_memberships m where m.school_id=school and m.user_id=actor and m.status='active') then raise exception 'Sekolah di luar akun Anda.' using errcode='42501';end if;
 if school is null then select m.school_id into school from public.school_memberships m where m.user_id=actor and m.status='active' order by m.created_at,m.school_id limit 1;end if;
 insert into private.profile_details(user_id) values(actor) on conflict do nothing;
 select * into pd from private.profile_details where user_id=actor;
 select exists(select 1 from public.school_memberships m join public.membership_roles r on r.membership_id=m.id where m.user_id=actor and m.status='active' and r.role_code='student'),
 exists(select 1 from public.school_memberships m join public.membership_roles r on r.membership_id=m.id where m.user_id=actor and m.status='active' and r.role_code in ('teacher','principal','homeroom_teacher','duty_teacher')) into student,teacher;
 select coalesce(jsonb_agg(code order by code),'[]') into v_roles from (
  select distinct r.role_code code from public.school_memberships m join public.membership_roles r on r.membership_id=m.id where m.user_id=actor and m.school_id=school and m.status='active'
  union select 'central_admin' where exists(select 1 from private.platform_admins where user_id=actor)
 ) x;
 if cmd='email-state' then return jsonb_build_object('next',pd.email_changed_at+interval '60 days');end if;
 if cmd='photo-read' then return jsonb_build_object('path',pd.photo_path);end if;
 if cmd='read' then
  return jsonb_build_object('id',actor,'name',pr.full_name,'username',pr.username_normalized,'email',pr.contact_email,'email_verified_at',pr.email_verified_at,'status',pr.status,'created_at',pr.created_at,
   'school',school,'school_name',(select name from public.schools where id=school),'roles',v_roles,'is_student',student,'is_teacher',teacher,
   'phone',pd.phone,'nip',pd.nip,'npk',pd.npk,'nik',pd.nik,'has_photo',pd.photo_path is not null,'revision',pd.revision,'server_now',stamp,
   'next',jsonb_build_object('name',pd.name_changed_at+interval '45 days','identity',pd.identity_changed_at+interval '45 days','username',pd.username_changed_at+interval '40 days','email',pd.email_changed_at+interval '60 days','photo',pd.photo_changed_at+interval '90 days'),
   'student_number',(select student_number from public.student_details where school_id=school and student_id=actor),
   'staff_code',(select staff_code from public.staff_details where school_id=school and teacher_id=actor),
   'classrooms',(select coalesce(jsonb_agg(x order by x.name),'[]') from (select cl.id,cl.name,y.name as year,se.number as semester from public.student_enrollments e join public.classrooms cl on cl.id=e.classroom_id join public.semesters se on se.id=e.semester_id join public.academic_years y on y.id=se.academic_year_id where e.school_id=school and e.student_id=actor and e.status='active' and se.status='active') x),
   'guardians',(select coalesce(jsonb_agg(x order by x.full_name,x.id),'[]') from (select g.guardian_id id,u.full_name,g.relationship,coalesce(z.phone,'') phone from public.guardian_students g join public.profiles u on u.id=g.guardian_id left join private.profile_details z on z.user_id=u.id where g.school_id=school and g.student_id=actor and g.active and u.status='active') x),
   'children',(select coalesce(jsonb_agg(x order by x.full_name,x.id),'[]') from (select g.student_id id,u.full_name,g.relationship from public.guardian_students g join public.profiles u on u.id=g.student_id where g.school_id=school and g.guardian_id=actor and g.active and u.status='active') x),
   'duties',(select coalesce(jsonb_agg(x),'[]') from (
     select 'Wali Kelas' kind,cl.name detail,null::integer[] weekdays from public.homeroom_assignments h join public.classrooms cl on cl.id=h.classroom_id join public.semesters se on se.id=cl.semester_id where h.school_id=school and h.teacher_id=actor and h.active and se.status='active'
     union all select 'Guru Piket','Jadwal mingguan semester aktif',a.weekdays from public.duty_assignments a join public.semesters se on se.id=a.semester_id where a.school_id=school and a.teacher_id=actor and a.active and se.status='active'
     union all select 'Kepala Madrasah',s.name,null::integer[] from public.schools s where s.id=school and v_roles @> '["principal"]'::jsonb
     union all select 'Mengajar',su.name||' · '||cl.name,null::integer[] from public.teaching_classes t join public.classrooms cl on cl.id=t.classroom_id join public.semesters se on se.id=cl.semester_id join public.subjects su on su.id=t.subject_id where t.school_id=school and t.teacher_id=actor and t.active and se.status='active'
   ) x));
 end if;
 if cmd not in ('name','phone','identity','username','photo') then raise exception 'Tindakan profil tidak dikenal.';end if;
 if (p->>'revision') is null or (p->>'revision')::bigint<>pd.revision then raise exception 'Profil berubah. Muat ulang sebelum menyimpan.';end if;
 if cmd='name' then
  if length(trim(d->>'name')) not between 2 and 100 then raise exception 'Nama lengkap harus 2–100 karakter.';end if;
  changed:=pr.full_name is distinct from trim(d->>'name');
  if changed and stamp<pd.name_changed_at+interval '45 days' then raise exception 'Nama lengkap hanya dapat diubah setiap 45 hari.';end if;
  if changed then update public.profiles set full_name=trim(d->>'name') where id=actor;update private.profile_details set name_changed_at=stamp where user_id=actor;end if;
 elsif cmd='phone' then
  if not (d ? 'phone') or not (d->>'phone'='' or d->>'phone' ~ '^\+?[0-9]{8,15}$') then raise exception 'Nomor HP/WA tidak valid.';end if;
  changed:=pd.phone is distinct from d->>'phone';
  if changed then update private.profile_details set phone=d->>'phone' where user_id=actor;end if;
 elsif cmd='identity' then
  if student and not teacher then raise exception 'Nomor induk siswa dikelola admin.' using errcode='42501';end if;
  if not teacher and (coalesce(d->>'nip','')<>'' or coalesce(d->>'npk','')<>'') then raise exception 'NIP/NPK hanya untuk tenaga pendidik.';end if;
  if not (coalesce(d->>'nik','')='' or d->>'nik' ~ '^[0-9]{16}$') or not (coalesce(d->>'nip','')='' or d->>'nip' ~ '^[0-9]{18}$') or not (coalesce(d->>'npk','')='' or d->>'npk' ~ '^[0-9]{13}$') then raise exception 'Format NIK, NIP atau NPK tidak valid.';end if;
  changed:=pd.nik is distinct from coalesce(d->>'nik','') or (teacher and (pd.nip is distinct from coalesce(d->>'nip','') or pd.npk is distinct from coalesce(d->>'npk','')));
  if changed and stamp<pd.identity_changed_at+interval '45 days' then raise exception 'Identitas hanya dapat diubah setiap 45 hari.';end if;
  if changed then update private.profile_details set nik=coalesce(d->>'nik',''),nip=case when teacher then coalesce(d->>'nip','') else pd.nip end,npk=case when teacher then coalesce(d->>'npk','') else pd.npk end,identity_changed_at=stamp where user_id=actor;end if;
 elsif cmd='username' then
  if student then raise exception 'Username siswa hanya dapat dikelola admin.' using errcode='42501';end if;
  if coalesce(d->>'username','') !~ '^[a-z0-9][a-z0-9._-]{2,49}$' then raise exception 'Username tidak valid.';end if;
  changed:=pr.username_normalized is distinct from d->>'username';
  if changed and stamp<pd.username_changed_at+interval '40 days' then raise exception 'Username hanya dapat diubah setiap 40 hari.';end if;
  if changed then update public.profiles set username_normalized=d->>'username' where id=actor;update private.profile_details set username_changed_at=stamp where user_id=actor;end if;
 elsif cmd='photo' then
  old_path:=pd.photo_path;
  if nullif(d->>'path','') is not null and (d->>'path' !~ ('^'||actor::text||'/[a-f0-9-]{36}\.webp$')) then raise exception 'Lokasi foto tidak valid.';end if;
  changed:=pd.photo_path is distinct from nullif(d->>'path','');
  if changed and stamp<pd.photo_changed_at+interval '90 days' then raise exception 'Foto profil hanya dapat diubah setiap 90 hari.';end if;
  if changed then update private.profile_details set photo_path=nullif(d->>'path',''),photo_changed_at=stamp where user_id=actor;end if;
 end if;
 if changed then
  update private.profile_details set revision=revision+1 where user_id=actor;
  insert into private.profile_audit(user_id,field) values(actor,cmd);
 end if;
 return jsonb_build_object('changed',changed,'old_path',old_path);
end;$$;
revoke all on function private.profile_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.profile_command(text,jsonb) to service_role;
create function public.profile_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.profile_command(cmd,p);$$;
revoke all on function public.profile_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.profile_command(text,jsonb) to service_role;

-- All email issuance paths enforce the same cooldown, including activation resend.
alter function private.identity_command(text,jsonb) rename to identity_command_profile_base;
create function private.identity_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pr public.profiles;pd private.profile_details; result jsonb; change_email boolean:=false; stamp timestamptz:=clock_timestamp();
begin
 if cmd='email_issue' then
  select x.* into pr from public.profiles x join auth.sessions s on s.user_id=x.id where x.id=(p->>'actor')::uuid and s.id=(p->>'session')::uuid and s.created_at>x.credentials_changed_at and (s.not_after is null or s.not_after>stamp) and x.status='active' for update of x;
  if not found then raise exception 'Invalid session';end if;
  insert into private.profile_details(user_id) values(pr.id) on conflict do nothing;
  select * into pd from private.profile_details where user_id=pr.id;
  if lower(coalesce(pr.contact_email,'')) is distinct from lower(coalesce(p->>'email','')) then
   if stamp<pd.email_changed_at+interval '60 days' then raise exception 'Email hanya dapat diubah setiap 60 hari. Kirim ulang ke alamat yang sama.';end if;
   change_email:=pd.email_changed_at is not null;
   if pr.email_verified_at is not null then
    if not coalesce((p->>'profile_change')::boolean,false) then raise exception 'Ubah email melalui Halaman Profil.';end if;
    if (p->>'revision') is null or (p->>'revision')::bigint<>pd.revision then raise exception 'Profil berubah. Muat ulang sebelum menyimpan.';end if;
    change_email:=true;
   end if;
  end if;
 end if;
 result:=private.identity_command_profile_base(cmd,p);
 if change_email then
  update private.profile_details set email_changed_at=stamp,revision=revision+1 where user_id=pr.id;
  insert into private.profile_audit(user_id,field) values(pr.id,'email');
 end if;
 return result;
end;$$;
revoke all on function private.identity_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.identity_command(text,jsonb) to service_role;
create or replace function public.identity_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.identity_command(cmd,p);$$;
revoke all on function public.identity_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.identity_command(text,jsonb) to service_role;
commit;
