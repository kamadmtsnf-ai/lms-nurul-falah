begin;
create function private.mfa_required(usr uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.mfa_factors f where f.user_id=usr and f.status='verified' and f.factor_type='totp');$$;
create function private.session_mfa_ok(usr uuid,sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not private.mfa_required(usr) or exists(select 1 from auth.sessions s where s.id=sid and s.user_id=usr and s.aal::text='aal2');$$;
create function private.jwt_mfa_ok() returns boolean language sql stable security definer set search_path='' as $$
 select not private.mfa_required(auth.uid()) or (coalesce(auth.jwt()->>'aal','aal1')='aal2' and private.session_mfa_ok(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid));$$;
create function private.require_mfa() returns void language plpgsql security definer set search_path='' as $$begin
 if not private.live_session() then raise exception 'Sesi tidak valid.' using errcode='42501';end if;
 if not private.jwt_mfa_ok() then raise exception 'Verifikasi dua langkah diperlukan.' using errcode='42501';end if;
end;$$;
revoke all on function private.mfa_required(uuid),private.session_mfa_ok(uuid,uuid),private.jwt_mfa_ok(),private.require_mfa() from public,anon,authenticated;
grant execute on function private.mfa_required(uuid),private.session_mfa_ok(uuid,uuid) to service_role;
grant execute on function private.jwt_mfa_ok(),private.require_mfa() to authenticated,service_role;
create or replace function private.account_ready() returns boolean language sql stable security definer set search_path='' as $$
 select private.live_session() and private.jwt_mfa_ok() and exists(select 1 from public.profiles p where p.id=auth.uid() and not p.must_change_password and p.email_verified_at is not null);$$;
-- Protect public RPCs, including academic paths that have their own admin checks.
create or replace function public.academic_command(cmd text,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$begin perform private.require_mfa();return private.academic_command(cmd,p);end;$$;
create or replace function public.learning_command(cmd text,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$begin perform private.require_mfa();return private.learning_command(cmd,p);end;$$;
create or replace function public.advanced_command(cmd text,p jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$begin perform private.require_mfa();return private.advanced_command(cmd,p);end;$$;
create or replace function public.development_command(cmd text,p jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$begin perform private.require_mfa();return private.development_command(cmd,p);end;$$;
create or replace function public.quiz_command(cmd text,p jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform private.require_mfa();
 if cmd in ('list','edit','save','release') then return private.quiz_manage(cmd,p);
 elsif cmd in ('start','attempt','answers','finish','tab-event','essay-grade') then return private.quiz_attempt(cmd,p);
 elsif cmd='report' then return private.learning_report(p);else raise exception 'Tindakan tidak dikenal.';end if;
end;$$;

alter function private.identity_command(text,jsonb) rename to identity_command_pre_security;
create function private.identity_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if (cmd like 'admin_%' or cmd in ('email_issue','email_confirm','password_begin')) and not private.session_mfa_ok((p->>'actor')::uuid,(p->>'session')::uuid) then raise exception 'Verifikasi dua langkah diperlukan.' using errcode='42501';end if;
 return private.identity_command_pre_security(cmd,p);
end;$$;
revoke all on function private.identity_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.identity_command(text,jsonb) to service_role;
create or replace function public.identity_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.identity_command(cmd,p);$$;
revoke all on function public.identity_command(text,jsonb) from public,anon,authenticated;grant execute on function public.identity_command(text,jsonb) to service_role;

alter function private.profile_command(text,jsonb) rename to profile_command_pre_security;
create function private.profile_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;nik text;d jsonb;
begin
 if not private.session_mfa_ok((p->>'actor')::uuid,(p->>'session')::uuid) then raise exception 'Verifikasi dua langkah diperlukan.' using errcode='42501';end if;
 if cmd='identity' then
  d:=p->'data';
  if coalesce((d->>'clear_nik')::boolean,false) then nik:='';
  elsif coalesce(d->>'nik','')='' then select pd.nik into nik from private.profile_details pd where pd.user_id=(p->>'actor')::uuid;
  else nik:=d->>'nik';end if;
  p:=jsonb_set(p,'{data}',(d-'clear_nik')||jsonb_build_object('nik',coalesce(nik,'')));
 end if;
 result:=private.profile_command_pre_security(cmd,p);
 if cmd='read' then
  nik:=coalesce(result->>'nik','');
  result:=result||jsonb_build_object('nik','','has_nik',nik<>'','nik_masked',case when nik='' then '' else repeat('•',greatest(length(nik)-4,0))||right(nik,4) end);
 end if;
 return result;
end;$$;
revoke all on function private.profile_command(text,jsonb) from public,anon,authenticated;grant execute on function private.profile_command(text,jsonb) to service_role;
create or replace function public.profile_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.profile_command(cmd,p);$$;
revoke all on function public.profile_command(text,jsonb) from public,anon,authenticated;grant execute on function public.profile_command(text,jsonb) to service_role;

create function private.security_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(p->>'actor')::uuid;sid uuid:=(p->>'session')::uuid;pr public.profiles;result jsonb;affected int;
begin
 select x.* into pr from public.profiles x join auth.sessions s on s.user_id=x.id where x.id=actor and s.id=sid and s.created_at>x.credentials_changed_at and x.status='active' and (s.not_after is null or s.not_after>clock_timestamp());
 if not found then raise exception 'Sesi tidak valid.' using errcode='42501';end if;
 if not private.session_mfa_ok(actor,sid) then raise exception 'Verifikasi dua langkah diperlukan.' using errcode='42501';end if;
 if cmd<>'event' and (pr.must_change_password or pr.email_verified_at is null) then raise exception 'Selesaikan aktivasi akun.' using errcode='42501';end if;
 if cmd='state' then return jsonb_build_object('sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'current',s.id=sid,'created_at',s.created_at,'updated_at',to_jsonb(s)->>'updated_at','user_agent',left(coalesce(to_jsonb(s)->>'user_agent','Perangkat tidak diketahui'),200)) order by s.created_at desc),'[]') from auth.sessions s where s.user_id=actor and s.created_at>pr.credentials_changed_at and (s.not_after is null or s.not_after>clock_timestamp())),
 'events',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from (select id,field,created_at from private.profile_audit where user_id=actor order by created_at desc,id desc limit 20) x));
 elsif cmd='reveal-nik' then
  insert into private.profile_audit(user_id,field) values(actor,'security.nik_revealed');
  return jsonb_build_object('nik',coalesce((select nik from private.profile_details where user_id=actor),''));
 elsif cmd='revoke-others' then
  delete from auth.sessions where user_id=actor and id<>sid;get diagnostics affected=row_count;
  insert into private.profile_audit(user_id,field) values(actor,'security.sessions_revoked');return jsonb_build_object('revoked',affected);
 elsif cmd='event' and p->>'event' in ('mfa_enrolled','mfa_verified','mfa_disable_requested') then
  insert into private.profile_audit(user_id,field) values(actor,'security.'||(p->>'event'));return '{}';
 end if;
 raise exception 'Tindakan keamanan tidak dikenal.';
end;$$;
revoke all on function private.security_command(text,jsonb) from public,anon,authenticated;grant execute on function private.security_command(text,jsonb) to service_role;
create function public.security_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.security_command(cmd,p);$$;
revoke all on function public.security_command(text,jsonb) from public,anon,authenticated;grant execute on function public.security_command(text,jsonb) to service_role;
-- Trusted server completion after Auth has already unenrolled/revoked a session.
create function private.security_invalidate_user(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$begin
 if reason not in ('mfa_disabled','logout_all','operator_mfa_recovery') then raise exception 'Alasan tidak valid.';end if;
 update public.profiles set credentials_changed_at=clock_timestamp(),session_version=session_version+1,must_change_password=case when reason='operator_mfa_recovery' then true else must_change_password end where id=target;
 if not found then raise exception 'Akun tidak ditemukan.';end if;
 update private.email_tokens set consumed_at=clock_timestamp() where user_id=target and consumed_at is null;
 delete from private.password_locks where user_id=target;
 delete from auth.sessions where user_id=target;
 insert into private.profile_audit(user_id,field) values(target,'security.'||reason);
end;$$;
revoke all on function private.security_invalidate_user(uuid,text) from public,anon,authenticated;grant execute on function private.security_invalidate_user(uuid,text) to service_role;
create function public.security_invalidate_user(target uuid,reason text) returns void language sql security invoker set search_path='' as $$select private.security_invalidate_user(target,reason);$$;
revoke all on function public.security_invalidate_user(uuid,text) from public,anon,authenticated;grant execute on function public.security_invalidate_user(uuid,text) to service_role;
commit;
