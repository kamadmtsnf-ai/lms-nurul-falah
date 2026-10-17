begin;
create table private.auth_rate_limits(key text primary key, hits integer not null, resets_at timestamptz not null);
create table private.password_locks(user_id uuid primary key references public.profiles(id) on delete cascade, nonce uuid not null, expires_at timestamptz not null);
create table private.bootstrap_state(id boolean primary key default true check(id), nonce uuid, expires_at timestamptz, completed boolean not null default false);
insert into private.bootstrap_state(id) values(true);
alter table private.auth_rate_limits enable row level security;
alter table private.password_locks enable row level security;
alter table private.bootstrap_state enable row level security;
revoke all on private.auth_rate_limits,private.password_locks,private.bootstrap_state from public,anon,authenticated;
grant all on private.auth_rate_limits,private.password_locks,private.bootstrap_state to service_role;
create index auth_rate_expiry_idx on private.auth_rate_limits(resets_at);
create index password_lock_expiry_idx on private.password_locks(expires_at);

create function private.identity_command(cmd text, p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid := nullif(p->>'actor','')::uuid;
 sid uuid := nullif(p->>'session','')::uuid;
 school uuid := nullif(p->>'school','')::uuid;
 target uuid := nullif(p->>'target','')::uuid;
 rowp public.profiles;
 tok private.email_tokens;
 bid uuid; mid uuid; v_nonce uuid; n integer; roles text[]; result jsonb;
begin
 if cmd='rate' then
  if length(p->>'key')>150 or (p->>'limit')::int not between 1 and 500 or (p->>'seconds')::int not between 1 and 86400 then raise exception 'Invalid rate settings'; end if;
  insert into private.auth_rate_limits(key,hits,resets_at) values(p->>'key',1,clock_timestamp()+make_interval(secs=>(p->>'seconds')::int))
  on conflict(key) do update set hits=case when auth_rate_limits.resets_at <= clock_timestamp() then 1 else auth_rate_limits.hits+1 end,
  resets_at=case when auth_rate_limits.resets_at<=clock_timestamp() then excluded.resets_at else auth_rate_limits.resets_at end returning hits into n;
  return jsonb_build_object('allowed',n<=(p->>'limit')::int);
 elsif cmd='lookup' then
  select * into rowp from public.profiles where username_normalized=p->>'username' and status='active';
  if not found then return null; end if;
  return jsonb_build_object('id',rowp.id,'email',rowp.contact_email,'verified',rowp.email_verified_at is not null);
 elsif cmd='bootstrap_claim' then
  perform 1 from public.schools where id=school for update;
  if not found then raise exception 'School missing'; end if;
  if exists(select 1 from public.membership_roles where role_code='admin') then raise exception 'Already initialized'; end if;
  v_nonce:=gen_random_uuid();
  update private.bootstrap_state set nonce=v_nonce,expires_at=clock_timestamp()+interval '5 minutes' where id and not completed and (bootstrap_state.nonce is null or expires_at<clock_timestamp());
  -- Variabel PL/pgSQL diberi alias untuk menghindari benturan kolom.
  if not found then raise exception 'Setup busy or completed'; end if;
  return jsonb_build_object('nonce',v_nonce);
 elsif cmd='bootstrap_abort' then
  update private.bootstrap_state set nonce=null,expires_at=null where id and not completed and bootstrap_state.nonce=(p->>'nonce')::uuid;
  return '{}'::jsonb;
 elsif cmd='bootstrap_finish' then
  perform 1 from private.bootstrap_state b where b.id and not b.completed and b.nonce=(p->>'nonce')::uuid and b.expires_at>clock_timestamp() for update;
  if not found or exists(select 1 from public.membership_roles where role_code='admin') then raise exception 'Setup invalid'; end if;
  insert into public.profiles(id,username_normalized,full_name) values(target,p->>'username',p->>'name');
  insert into public.school_memberships(school_id,user_id) values(school,target) returning id into mid;
  insert into public.membership_roles(school_id,membership_id,role_code) values(school,mid,'admin');
  update private.bootstrap_state set completed=true,nonce=null,expires_at=null where id;
  insert into public.audit_logs(school_id,actor_id,action,entity,entity_id) values(school,target,'bootstrap_admin','profiles',target::text);
  return '{}'::jsonb;
 elsif cmd='reset_issue' then
  select * into rowp from public.profiles where id=target and status='active' and email_verified_at is not null for update;
  if not found then return null; end if;
 elsif cmd='reset_claim' then
  select * into tok from private.email_tokens where token_hash=p->>'hash' and purpose='reset_password' and consumed_at is null and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Invalid token'; end if;
  select * into rowp from public.profiles where id=tok.user_id and status='active' and contact_email=tok.email_target and email_verified_at is not null for update;
  if not found or not exists(select 1 from private.email_outbox where dedupe_key=tok.id::text and status='sent') then raise exception 'Invalid token'; end if;
  target:=rowp.id;
 elsif cmd in ('mail_sent','mail_failed') then
  update private.email_outbox set status=case when cmd='mail_sent' then 'sent' else 'failed' end,attempts=attempts+1 where dedupe_key=p->>'token_id' and status='pending';
  if cmd='mail_failed' then update private.email_tokens set consumed_at=clock_timestamp() where id=(p->>'token_id')::uuid; end if;
  return '{}'::jsonb;
 elsif cmd='password_finish' then
  perform 1 from private.password_locks l where l.user_id=target and l.nonce=(p->>'nonce')::uuid and l.expires_at>clock_timestamp() for update;
  if not found then raise exception 'Invalid password operation'; end if;
  update public.profiles set must_change_password=false, credentials_changed_at=clock_timestamp(),session_version=session_version+1 where id=target and status='active';
  if not found then raise exception 'Disabled account'; end if;
  update private.email_tokens set consumed_at=clock_timestamp() where user_id=target and consumed_at is null;
  delete from private.password_locks where user_id=target;
  return '{}'::jsonb;
 else
  select pr.* into rowp from public.profiles pr join auth.sessions s on s.user_id=pr.id
  where pr.id=actor and s.id=sid and pr.status='active' and s.created_at>pr.credentials_changed_at and (s.not_after is null or s.not_after>clock_timestamp());
  if not found then raise exception 'Invalid session'; end if;
  if cmd in ('email_issue','email_confirm') and rowp.must_change_password then raise exception 'Password change required'; end if;
  if cmd='force_default' then
   update public.profiles set must_change_password=true where id=actor;return '{}'::jsonb;
  elsif cmd='email_issue' then
   perform 1 from public.profiles where id=actor for update;
   update public.profiles set contact_email=p->>'email',email_verified_at=null where id=actor;
   rowp.contact_email:=p->>'email'; target:=actor;
  elsif cmd='email_confirm' then
   select * into tok from private.email_tokens where user_id=actor and token_hash=p->>'hash' and purpose='verify_email' and email_target=rowp.contact_email and consumed_at is null and expires_at>clock_timestamp() for update;
   if not found or not exists(select 1 from private.email_outbox where dedupe_key=tok.id::text and status='sent') then raise exception 'Invalid token'; end if;
   update public.profiles set email_verified_at=clock_timestamp() where id=actor;
   update private.email_tokens set consumed_at=clock_timestamp() where user_id=actor and purpose='verify_email' and consumed_at is null;
   return '{}'::jsonb;
  elsif cmd='password_begin' then target:=actor;
  elsif cmd like 'admin_%' then
   if rowp.must_change_password or rowp.email_verified_at is null then raise exception 'Activation required'; end if;
   perform 1 from public.schools where id=school for update;
   if not exists(select 1 from public.school_memberships m join public.membership_roles r on r.membership_id=m.id and r.school_id=m.school_id where m.school_id=school and m.user_id=actor and m.status='active' and r.role_code='admin') then raise exception 'Forbidden'; end if;
   if cmd='admin_list' then
    select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
     select pr.id,pr.username_normalized,pr.full_name,pr.contact_email,pr.email_verified_at,pr.must_change_password,pr.status,
     (select jsonb_agg(r.role_code order by r.role_code) from public.membership_roles r where r.membership_id=m.id) as roles
     from public.school_memberships m join public.profiles pr on pr.id=m.user_id where m.school_id=school order by pr.username_normalized limit 50 offset greatest(0,least(coalesce((p->>'offset')::int,0),100000))
    ) x;
    return result;
   end if;
   select array_agg(v) into roles from jsonb_array_elements_text(p->'roles') v;
   if roles is null or cardinality(roles)=0 or exists(select 1 from unnest(roles) v where v='central_admin' or not exists(select 1 from public.roles where code=v)) then raise exception 'Invalid roles'; end if;
   if cmd='admin_attach' then
    insert into public.profiles(id,username_normalized,full_name,contact_email) values(target,p->>'username',p->>'name',nullif(p->>'email',''));
    insert into public.school_memberships(school_id,user_id) values(school,target) returning id into mid;
   elsif cmd='admin_update' then
    select id into mid from public.school_memberships where school_id=school and user_id=target and status='active' for update;
    if not found then raise exception 'Target outside school'; end if;
    if exists(select 1 from public.membership_roles where membership_id=mid and role_code='admin') and (not 'admin'=any(roles) or p->>'status'='disabled') and not exists(
     select 1 from public.school_memberships m join public.membership_roles r on r.membership_id=m.id join public.profiles pr on pr.id=m.user_id
     where m.school_id=school and m.user_id<>target and m.status='active' and r.role_code='admin' and pr.status='active' and not pr.must_change_password and pr.email_verified_at is not null
    ) then raise exception 'Cannot remove last admin'; end if;
    if exists(select 1 from public.school_memberships where user_id=target and school_id<>school) and exists(select 1 from public.profiles where id=target and status<>p->>'status') then raise exception 'Shared account status requires platform administrator'; end if;
    update public.profiles set status=p->>'status' where id=target;
    delete from public.membership_roles where membership_id=mid;
   else raise exception 'Unknown admin operation'; end if;
   insert into public.membership_roles(school_id,membership_id,role_code) select school,mid,v from (select distinct unnest(roles) v) t;
   insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(school,actor,cmd,'profiles',target::text,jsonb_build_object('roles',roles));
   return '{}'::jsonb;
  else raise exception 'Unknown command'; end if;
 end if;
 if cmd in ('email_issue','reset_issue') then
  update private.email_tokens set consumed_at=clock_timestamp() where user_id=rowp.id and purpose=case when cmd='email_issue' then 'verify_email' else 'reset_password' end and consumed_at is null;
  insert into private.email_tokens(user_id,email_target,purpose,token_hash,expires_at) values(rowp.id,rowp.contact_email,case when cmd='email_issue' then 'verify_email' else 'reset_password' end,p->>'hash',clock_timestamp()+interval '15 minutes') returning id into bid;
  insert into private.email_outbox(dedupe_key,recipient,template,payload) values(bid::text,rowp.contact_email,case when cmd='email_issue' then 'verify_email' else 'reset_password' end,jsonb_build_object('token_id',bid));
  return jsonb_build_object('id',bid,'email',rowp.contact_email);
 elsif cmd in ('password_begin','reset_claim') then
  delete from private.password_locks where user_id=target and expires_at<=clock_timestamp();
  v_nonce:=gen_random_uuid();
  insert into private.password_locks values(target,v_nonce,clock_timestamp()+interval '5 minutes');
  update public.profiles set must_change_password=true,credentials_changed_at=clock_timestamp() where id=target;
  if cmd='reset_claim' then update private.email_tokens set consumed_at=clock_timestamp() where id=tok.id; end if;
  return jsonb_build_object('target',target,'nonce',v_nonce);
 end if;
 raise exception 'Unknown identity operation';
end $$;
-- Privileged implementation is private; public wrapper is invoker and callable ONLY by service_role.
create function public.identity_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.identity_command(cmd,p); $$;
revoke all on function private.identity_command(text,jsonb),public.identity_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.identity_command(text,jsonb),public.identity_command(text,jsonb) to service_role;
commit;
