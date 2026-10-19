begin;
alter function private.identity_command(text,jsonb) rename to identity_command_pre_admin_reset;
create function private.identity_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := (p->>'actor')::uuid;
 v_target uuid := (p->>'target')::uuid;
 v_school uuid := (p->>'school')::uuid;
 v_nonce uuid;
begin
 if cmd not in ('admin_reset_begin','admin_reset_finish') then
  return private.identity_command_pre_admin_reset(cmd,p);
 end if;
 -- Reuse live-session, activation, school-admin and MFA checks, including the school lock.
 perform private.identity_command_pre_admin_reset('admin_list',p);
 if v_target=v_actor or v_target is null then raise exception 'Use personal password change' using errcode='42501';end if;
 if not exists(select 1 from public.school_memberships where school_id=v_school and user_id=v_target and status='active') then raise exception 'Target outside school' using errcode='42501';end if;
 if exists(select 1 from public.school_memberships where user_id=v_target and school_id<>v_school)
 or exists(select 1 from public.membership_roles r join public.school_memberships m on m.id=r.membership_id where m.user_id=v_target and r.role_code='central_admin') then raise exception 'Shared account requires platform administrator' using errcode='42501';end if;
 if cmd='admin_reset_begin' then
  delete from private.password_locks where user_id=v_target and expires_at<=clock_timestamp();
  v_nonce:=gen_random_uuid();
  insert into private.password_locks(user_id,nonce,expires_at) values(v_target,v_nonce,clock_timestamp()+interval '5 minutes');
  update public.profiles set must_change_password=true,credentials_changed_at=clock_timestamp(),session_version=session_version+1 where id=v_target;
  update private.email_tokens set consumed_at=clock_timestamp() where user_id=v_target and consumed_at is null;
 else
  perform 1 from private.password_locks where user_id=v_target and nonce=(p->>'nonce')::uuid and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Invalid reset operation';end if;
  -- Keep the mandatory change flag. Do not clear email verification, roles or disabled status.
  update public.profiles set must_change_password=true,credentials_changed_at=clock_timestamp(),session_version=session_version+1 where id=v_target;
  update private.email_tokens set consumed_at=clock_timestamp() where user_id=v_target and consumed_at is null;
  delete from private.password_locks where user_id=v_target;
 end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id) values(v_school,v_actor,cmd,'profiles',v_target::text);
 return jsonb_build_object('target',v_target,'nonce',v_nonce);
end;$$;
revoke all on function private.identity_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.identity_command(text,jsonb) to service_role;
create or replace function public.identity_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.identity_command(cmd,p);$$;
revoke all on function public.identity_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.identity_command(text,jsonb) to service_role;
commit;
