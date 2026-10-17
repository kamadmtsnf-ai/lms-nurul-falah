begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.schools (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) > 0),
 education_level text not null default 'MTs/SMP', timezone text not null default 'Asia/Jakarta',
 logo_url text check (logo_url is null or logo_url ~ '^https://'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username_normalized text not null unique check(username_normalized ~ '^[a-z0-9][a-z0-9._-]{2,49}$'),
 full_name text not null check(length(trim(full_name)) > 0),
 contact_email text, email_verified_at timestamptz,
 must_change_password boolean not null default true,
 credentials_changed_at timestamptz not null default '-infinity',
 session_version integer not null default 1 check(session_version > 0),
 status text not null default 'active' check(status in ('active','disabled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(email_verified_at is null or contact_email is not null)
);
create table public.roles (
 code text primary key check(code in ('central_admin','admin','principal','teacher','homeroom_teacher','duty_teacher','student','guardian')),
 label text not null
);
insert into public.roles(code,label) values
 ('central_admin','Admin Pusat'),('admin','Admin / Operator'),('principal','Kepala Sekolah'),
 ('teacher','Guru'),('homeroom_teacher','Wali Kelas'),('duty_teacher','Guru Piket'),('student','Siswa'),('guardian','Orang Tua / Wali');
create table private.platform_admins (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now()
);
-- Peran pusat dipisah: tidak dapat diberikan melalui membership sekolah.
create table public.school_memberships (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 user_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), unique(school_id,user_id), unique(school_id,id)
);
create table public.membership_roles (
 school_id uuid not null, membership_id uuid not null,
 role_code text not null references public.roles(code) check(role_code <> 'central_admin'),
 primary key(membership_id,role_code),
 foreign key(school_id,membership_id) references public.school_memberships(school_id,id) on delete cascade
);
create table public.school_settings (
 school_id uuid not null references public.schools(id), key text not null,
 value jsonb not null, version integer not null default 1 check(version > 0),
 updated_at timestamptz not null default now(), primary key(school_id,key)
);
create table public.academic_years (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 name text not null, starts_on date not null, ends_on date not null,
 status text not null default 'draft' check(status in ('draft','active','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_on >= starts_on), unique(school_id,name), unique(school_id,id)
);
create unique index one_active_year_per_school on public.academic_years(school_id) where status='active';
create table public.semesters (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 academic_year_id uuid not null, number smallint not null check(number in (1,2)),
 starts_on date not null, ends_on date not null,
 status text not null default 'draft' check(status in ('draft','active','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_on >= starts_on), unique(academic_year_id,number), unique(school_id,id),
 foreign key(school_id,academic_year_id) references public.academic_years(school_id,id)
);
create unique index one_active_semester_per_school on public.semesters(school_id) where status='active';
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 actor_id uuid references public.profiles(id) on delete set null,
 action text not null, entity text not null, entity_id text,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.email_tokens (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 email_target text not null, purpose text not null check(purpose in ('verify_email','reset_password')),
 token_hash text not null unique check(length(token_hash)=64),
 expires_at timestamptz not null, consumed_at timestamptz,
 created_at timestamptz not null default now(), check(expires_at > created_at)
);
create table private.email_outbox (
 id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id),
 dedupe_key text not null unique, recipient text not null, template text not null,
 payload jsonb not null default '{}', status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
 attempts integer not null default 0 check(attempts>=0), next_retry_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index memberships_user_idx on public.school_memberships(user_id,status);
create index membership_roles_school_idx on public.membership_roles(school_id,role_code);
create index semesters_year_idx on public.semesters(school_id,academic_year_id);
create index audit_school_date_idx on public.audit_logs(school_id,created_at desc);
create index audit_actor_idx on public.audit_logs(actor_id);
create index email_tokens_user_idx on private.email_tokens(user_id,purpose,expires_at);
create index outbox_pending_idx on private.email_outbox(status,next_retry_at);

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end; $$;
create trigger schools_updated before update on public.schools for each row execute function private.touch_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger settings_updated before update on public.school_settings for each row execute function private.touch_updated_at();
create trigger years_updated before update on public.academic_years for each row execute function private.touch_updated_at();
create trigger semesters_updated before update on public.semesters for each row execute function private.touch_updated_at();

-- Periksa sesi Auth agar JWT lama tidak tetap mendapat akses setelah sesi dicabut.
-- Penanda JWT saja tidak cukup untuk mencabut akses secara langsung.
create function private.live_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
  where s.id = nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid()
   and p.status='active' and s.created_at > p.credentials_changed_at
   and (s.not_after is null or s.not_after > now())
 );
$$;
create function private.account_ready() returns boolean language sql stable security definer set search_path='' as $$
 select private.live_session() and exists(select 1 from public.profiles p where p.id=auth.uid()
  and not p.must_change_password and p.email_verified_at is not null);
$$;
create function private.is_member(target_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_ready() and exists(select 1 from public.school_memberships m
 where m.school_id=target_school and m.user_id=auth.uid() and m.status='active');
$$;
create function private.has_school_role(target_school uuid, target_role text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_ready() and exists(select 1 from public.school_memberships m
 join public.membership_roles r on r.membership_id=m.id and r.school_id=m.school_id
 where m.school_id=target_school and m.user_id=auth.uid() and m.status='active' and r.role_code=target_role);
$$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.school_memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.school_settings enable row level security;
alter table public.academic_years enable row level security;
alter table public.semesters enable row level security;
alter table public.audit_logs enable row level security;
alter table private.platform_admins enable row level security;
alter table private.email_tokens enable row level security;
alter table private.email_outbox enable row level security;

-- Foundation: read-only lewat user SDK. Mutasi disiapkan bertahap lewat server/RPC yang diaudit.
revoke all on public.schools, public.profiles, public.roles, public.school_memberships,
 public.membership_roles, public.school_settings, public.academic_years, public.semesters, public.audit_logs from anon, authenticated;
grant select on public.schools, public.profiles, public.roles, public.school_memberships,
 public.membership_roles, public.school_settings, public.academic_years, public.semesters, public.audit_logs to authenticated;
grant all on public.schools, public.profiles, public.roles, public.school_memberships,
 public.membership_roles, public.school_settings, public.academic_years, public.semesters, public.audit_logs to service_role;
revoke all on private.platform_admins, private.email_tokens, private.email_outbox from public, anon, authenticated;
grant all on private.platform_admins, private.email_tokens, private.email_outbox to service_role;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.live_session(), private.account_ready(), private.is_member(uuid), private.has_school_role(uuid,text) to authenticated;
grant execute on all functions in schema private to service_role;

create policy profiles_self_read on public.profiles for select to authenticated
 using (id=auth.uid() and private.live_session());
create policy schools_member_read on public.schools for select to authenticated using(private.is_member(id));
create policy roles_ready_read on public.roles for select to authenticated using(private.account_ready());
create policy membership_self_or_admin on public.school_memberships for select to authenticated
 using(private.account_ready() and (user_id=auth.uid() or private.has_school_role(school_id,'admin')));
create policy membership_roles_self_or_admin on public.membership_roles for select to authenticated
 using(private.account_ready() and exists(select 1 from public.school_memberships m where m.id=membership_id and m.school_id=membership_roles.school_id
 and (m.user_id=auth.uid() or private.has_school_role(m.school_id,'admin'))));
create policy settings_member_read on public.school_settings for select to authenticated using(private.is_member(school_id));
create policy years_member_read on public.academic_years for select to authenticated using(private.is_member(school_id));
create policy semesters_member_read on public.semesters for select to authenticated using(private.is_member(school_id));
create policy audit_admin_read on public.audit_logs for select to authenticated using(private.has_school_role(school_id,'admin'));

create function public.foundation_status() returns text language sql stable security definer set search_path='' as $$ select '202610170001'; $$;
revoke all on function public.foundation_status() from public, anon, authenticated;
grant execute on function public.foundation_status() to service_role;
commit;
