begin;
alter table public.learning_assets add column retention_hold boolean not null default false,add column retention_deleted_at timestamptz;
create table private.attachment_policies(school_id uuid primary key references public.schools(id),enabled boolean not null default false,pending_days int not null default 2 check(pending_days between 1 and 3650),material_days int not null default 365 check(material_days between 1 and 3650),submission_days int not null default 365 check(submission_days between 1 and 3650),grace_days int not null default 14 check(grace_days between 1 and 90),backup_required boolean not null default true,revision int not null default 0,updated_at timestamptz not null default clock_timestamp());
create table private.attachment_queue(asset_id uuid primary key references public.learning_assets(id) on delete cascade,school_id uuid not null references public.schools(id),category text not null check(category in ('pending','material','submission')),anchor timestamptz not null,queued_at timestamptz not null default clock_timestamp(),delete_after timestamptz not null,policy_revision int not null,state text not null default 'queued' check(state in ('queued','cancelled','processing','failed','deleted')),backup_reference text not null default '' check(length(backup_reference)<=500),backup_verified_by uuid references public.profiles(id) on delete set null,backup_verified_at timestamptz,lease_token uuid,lease_until timestamptz,attempts int not null default 0,error_code text not null default '',finished_at timestamptz);
create index attachment_queue_school on private.attachment_queue(school_id,state,delete_after);create index attachment_queue_backup_actor on private.attachment_queue(backup_verified_by);
alter table private.attachment_policies enable row level security;alter table private.attachment_queue enable row level security;
revoke all on private.attachment_policies,private.attachment_queue from public,anon,authenticated;grant all on private.attachment_policies,private.attachment_queue to service_role;
create function private.attachment_candidate(aid uuid) returns table(asset_id uuid,category text,anchor timestamptz) language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare a public.learning_assets;p private.attachment_policies;s public.semesters;t timestamptz;begin
 select * into a from public.learning_assets where id=aid;if not found or a.retention_hold or a.retention_deleted_at is not null then return;end if;
 select * into p from private.attachment_policies where school_id=a.school_id;if not found then return;end if;
 if (a.status='pending' or (a.status='removed' and exists(select 1 from storage.objects o where o.bucket_id='lms-private' and o.name=a.object_path) and not exists(select 1 from private.attachment_queue q where q.asset_id=a.id and q.state in ('processing','failed','deleted')))) or (a.status='ready' and a.target_type='submission' and not exists(select 1 from public.learning_submission_versions v where v.asset_ids @> array[a.id])) then
  if a.created_at+make_interval(days=>p.pending_days)<=clock_timestamp() and a.expires_at<clock_timestamp() then return query select a.id,'pending'::text,a.created_at;end if;return;
 end if;
 if a.status<>'ready' then return;end if;
 select se.* into s from public.teaching_classes c join public.classrooms r on r.id=c.classroom_id join public.semesters se on se.id=r.semester_id where c.id=a.teaching_class_id;
 if s.status<>'archived' then return;end if;t:=greatest(s.ends_on::timestamptz,s.updated_at);
 if a.target_type='material' then
  if not exists(select 1 from public.learning_materials m where m.id=a.target_id and m.teaching_class_id=a.teaching_class_id) then return;end if;
  select greatest(t,m.updated_at) into t from public.learning_materials m where m.id=a.target_id;
  if t+make_interval(days=>p.material_days)<=clock_timestamp() then return query select a.id,'material'::text,t;end if;
 else
  if not exists(select 1 from public.learning_assignments x where x.id=a.target_id and x.teaching_class_id=a.teaching_class_id) or not exists(select 1 from private.course_grade_state g where g.course_id=a.teaching_class_id and g.locked) or exists(select 1 from private.study_followups f where f.course_id=a.teaching_class_id and f.status='planned') then return;end if;
  if exists(select 1 from public.learning_submission_versions v join public.learning_submissions u on u.id=v.submission_id join public.learning_assignments x on x.id=u.assignment_id join public.teaching_classes c on c.id=x.teaching_class_id join public.classrooms r on r.id=c.classroom_id join public.semesters se on se.id=r.semester_id where v.asset_ids @> array[a.id] and (se.status<>'archived' or not exists(select 1 from private.course_grade_state g where g.course_id=c.id and g.locked))) then return;end if;
  select greatest(t,x.updated_at) into t from public.learning_assignments x where x.id=a.target_id;
  if t+make_interval(days=>p.submission_days)<=clock_timestamp() then return query select a.id,'submission'::text,t;end if;
 end if;end;$$;
create function private.attachment_scan(sid uuid) returns int language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare n int;p private.attachment_policies;begin
 select * into p from private.attachment_policies where school_id=sid for update;
 insert into private.attachment_queue(asset_id,school_id,category,anchor,delete_after,policy_revision)
 select c.asset_id,sid,c.category,c.anchor,clock_timestamp()+make_interval(days=>p.grace_days),p.revision from public.learning_assets a cross join lateral private.attachment_candidate(a.id)c where a.school_id=sid and not exists(select 1 from private.attachment_queue q where q.asset_id=a.id) order by a.created_at,a.id limit 200;
 get diagnostics n=row_count;
 update private.attachment_queue q set delete_after=greatest(q.delete_after,clock_timestamp()+make_interval(days=>p.grace_days)),policy_revision=p.revision where q.school_id=sid and q.state='queued' and q.policy_revision<>p.revision;
 return n;end;$$;
create function private.attachment_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare sid uuid:=(p->>'school')::uuid;aid uuid:=nullif(p->>'target','')::uuid;d jsonb:=coalesce(p->'data','{}');pol private.attachment_policies;q private.attachment_queue;rows jsonb;off int:=greatest(0,least(coalesce((p->>'offset')::int,0),100000));begin
 perform private.require_mfa();if not private.account_ready() or not private.has_school_role(sid,'admin') then raise exception 'Hanya admin sekolah aktif.' using errcode='42501';end if;
 perform 1 from public.schools where id=sid for key share;insert into private.attachment_policies(school_id) values(sid) on conflict do nothing;
 select * into pol from private.attachment_policies where school_id=sid for update;
 if cmd='settings' then
  if (d->>'revision')::int is distinct from pol.revision then raise exception 'Pengaturan berubah. Muat ulang.';end if;
  if (d->>'enabled')::boolean and d->>'confirmation' is distinct from 'AKTIFKAN RETENSI' then raise exception 'Konfirmasi pengaktifan diperlukan.';end if;
  update private.attachment_policies set enabled=(d->>'enabled')::boolean,pending_days=(d->>'pending_days')::int,material_days=(d->>'material_days')::int,submission_days=(d->>'submission_days')::int,grace_days=(d->>'grace_days')::int,backup_required=(d->>'backup_required')::boolean,revision=revision+1,updated_at=clock_timestamp() where school_id=sid;
 elsif cmd='scan' then perform private.attachment_scan(sid);
 elsif cmd in ('hold','cancel','requeue','backup','retry') then
  select * into q from private.attachment_queue where asset_id=aid and school_id=sid for update;
  perform 1 from public.learning_assets where id=aid and school_id=sid for update;if not found then raise exception 'Lampiran di luar sekolah.' using errcode='42501';end if;
  if q.state in ('processing','failed','deleted') and cmd<>'retry' then raise exception 'Penghapusan sudah dimulai; hanya penyelesaian ulang yang tersedia.';end if;
  if cmd='hold' then update public.learning_assets set retention_hold=(d->>'hold')::boolean where id=aid;if (d->>'hold')::boolean then update private.attachment_queue set state='cancelled' where asset_id=aid and state='queued';end if;
  elsif cmd='cancel' then update private.attachment_queue set state='cancelled' where asset_id=aid and state='queued';
  elsif cmd='requeue' then
   if not exists(select 1 from private.attachment_candidate(aid)) then raise exception 'Lampiran belum memenuhi aturan atau sedang dipertahankan.';end if;
   delete from private.attachment_queue where asset_id=aid and state in ('queued','cancelled');
   insert into private.attachment_queue(asset_id,school_id,category,anchor,delete_after,policy_revision) select aid,sid,c.category,c.anchor,clock_timestamp()+make_interval(days=>pol.grace_days),pol.revision from private.attachment_candidate(aid)c;
  elsif cmd='backup' then
   if q.state is distinct from 'queued' or d->>'confirmation' is distinct from 'BACKUP SUDAH DIVERIFIKASI' or length(trim(coalesce(d->>'reference','')))<10 then raise exception 'Antrean dan pernyataan verifikasi backup diperlukan.';end if;
   update private.attachment_queue set backup_reference=d->>'reference',backup_verified_by=auth.uid(),backup_verified_at=clock_timestamp() where asset_id=aid;
  elsif cmd='retry' then
   if q.state is distinct from 'failed' then raise exception 'Hanya pekerjaan gagal dapat dijadwalkan ulang.';end if;
   update private.attachment_queue set attempts=0,lease_until=clock_timestamp(),error_code='' where asset_id=aid;
  end if;
 elsif cmd not in ('state','run') then raise exception 'Tindakan tidak dikenal.';end if;
 if cmd<>'state' then insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(sid,auth.uid(),'attachment-retention.'||cmd,'attachment_retention',coalesce(aid::text,sid::text),jsonb_build_object('before_policy_revision',pol.revision,'enabled',case when cmd='settings' then d->'enabled' else null end,'backup_required',case when cmd='settings' then d->'backup_required' else null end,'hold',case when cmd='hold' then d->'hold' else null end));end if;
 select * into pol from private.attachment_policies where school_id=sid;
 select coalesce(jsonb_agg(x),'[]') into rows from (select a.id,a.name,a.bytes,a.target_type,a.status,a.retention_hold,a.retention_deleted_at,c.category as eligible_category,q.category,q.state,q.queued_at,q.delete_after,q.backup_reference,q.backup_verified_at,q.attempts,q.error_code from public.learning_assets a left join lateral private.attachment_candidate(a.id)c on true left join private.attachment_queue q on q.asset_id=a.id where a.school_id=sid and (a.status<>'removed' or q.asset_id is not null or c.asset_id is not null) order by a.created_at desc,a.id limit 51 offset off)x;
 return jsonb_build_object('policy',to_jsonb(pol),'rows',rows,'offset',off,'has_more',jsonb_array_length(rows)>50,'summary',(select jsonb_build_object('queued',count(*) filter(where state='queued'),'processing',count(*) filter(where state='processing'),'failed',count(*) filter(where state='failed'),'deleted',count(*) filter(where state='deleted'),'estimated_queued_bytes',coalesce(sum(a.bytes) filter(where q.state='queued'),0)) from private.attachment_queue q join public.learning_assets a on a.id=q.asset_id where q.school_id=sid));end;$$;
create function public.attachment_retention_command(cmd text,p jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.attachment_command(cmd,p);$$;
revoke all on function public.attachment_retention_command(text,jsonb),private.attachment_command(text,jsonb),private.attachment_scan(uuid),private.attachment_candidate(uuid) from public,anon,authenticated;
grant execute on function public.attachment_retention_command(text,jsonb),private.attachment_command(text,jsonb) to authenticated,service_role;grant execute on function private.attachment_scan(uuid),private.attachment_candidate(uuid) to service_role;

create index learning_submission_assets_gin on public.learning_submission_versions using gin(asset_ids);
create function private.attachment_worker(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare sid uuid:=nullif(p->>'school','')::uuid;aid uuid:=nullif(p->>'target','')::uuid;pol private.attachment_policies;q private.attachment_queue;a public.learning_assets;c record;token uuid;begin
 if cmd='schools' then return (select coalesce(jsonb_agg(school_id),'[]') from (select x.school_id from private.attachment_policies x where x.enabled or exists(select 1 from private.attachment_queue y where y.school_id=x.school_id and y.state in ('processing','failed')) order by x.updated_at,x.school_id limit 20)x);end if;
 if cmd in ('ack','fail') then
  select * into q from private.attachment_queue where asset_id=aid for update;if q.state is distinct from 'processing' or q.lease_token is distinct from (p->>'token')::uuid then raise exception 'Lease pekerjaan tidak sesuai.';end if;
  if cmd='ack' then update public.learning_assets set retention_deleted_at=case when q.category='pending' then retention_deleted_at else clock_timestamp() end where id=aid;update private.attachment_queue set state='deleted',finished_at=clock_timestamp(),lease_token=null,lease_until=null,error_code='' where asset_id=aid;
  else update private.attachment_queue set state='failed',lease_until=clock_timestamp()+interval '15 minutes',error_code='storage_remove_failed' where asset_id=aid;end if;
  insert into public.audit_logs(school_id,action,entity,entity_id) values(q.school_id,'attachment-retention.'||cmd,'learning_assets',aid::text);return '{}';end if;
 perform 1 from public.schools where id=sid for key share;select * into pol from private.attachment_policies where school_id=sid for update;if not found then return '{}';end if;
 if cmd='scan' then if pol.enabled then perform private.attachment_scan(sid);end if;return '{}';end if;
 if cmd<>'claim' then raise exception 'Tindakan worker tidak dikenal.';end if;
 -- One object per transaction. Shared school lock precedes course/asset locks, matching academic operations.
 for q in select * from private.attachment_queue x where x.school_id=sid and x.attempts<5 and ((pol.enabled and x.state='queued' and x.delete_after<=clock_timestamp() and x.policy_revision=pol.revision and (x.category='pending' or not pol.backup_required or (length(x.backup_reference)>=10 and x.backup_verified_at is not null))) or (x.state in ('processing','failed') and x.lease_until<clock_timestamp())) order by x.queued_at,x.asset_id for update skip locked loop
  select * into a from public.learning_assets where id=q.asset_id;
  perform pg_advisory_xact_lock(hashtextextended(a.teaching_class_id::text,2401));
  select * into a from public.learning_assets where id=q.asset_id for update;
  if q.state='queued' then
   select * into c from private.attachment_candidate(a.id);
   if c.asset_id is null or c.category<>q.category or c.anchor<>q.anchor then update private.attachment_queue set state='cancelled',error_code='eligibility_changed' where asset_id=a.id;continue;end if;
  end if;
  token:=gen_random_uuid();update private.attachment_queue set state='processing',lease_token=token,lease_until=clock_timestamp()+interval '20 minutes',attempts=attempts+1,error_code='' where asset_id=a.id;
  update public.learning_assets set status='removed' where id=a.id;
  insert into public.audit_logs(school_id,action,entity,entity_id,details) values(sid,'attachment-retention.claim','learning_assets',a.id::text,jsonb_build_object('category',q.category));
  return jsonb_build_object('id',a.id,'path',a.object_path,'token',token);
 end loop;return '{}';end;$$;
create function public.attachment_retention_worker(cmd text,p jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.attachment_worker(cmd,p);$$;
revoke all on function private.attachment_worker(text,jsonb),public.attachment_retention_worker(text,jsonb) from public,anon,authenticated;grant execute on function private.attachment_worker(text,jsonb),public.attachment_retention_worker(text,jsonb) to service_role;
create function private.attachment_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='learning_assets' then
  if old.retention_hold and new.status='removed' and old.status<>'removed' then raise exception 'Lampiran sedang dipertahankan admin.';end if;
  if exists(select 1 from private.attachment_queue q where q.asset_id=old.id and q.state in ('processing','failed')) and (new.status<>'removed' or new.retention_hold or new.object_path<>old.object_path or new.target_id<>old.target_id or new.teaching_class_id<>old.teaching_class_id) then raise exception 'Lampiran sedang diselesaikan penghapusannya.';end if;
 elsif tg_table_name='semesters' then
  if old.status='archived' and new.status<>'archived' and exists(select 1 from private.attachment_queue q join public.learning_assets a on a.id=q.asset_id join public.teaching_classes c on c.id=a.teaching_class_id join public.classrooms r on r.id=c.classroom_id where r.semester_id=old.id and q.state in ('processing','failed')) then raise exception 'Selesaikan pekerjaan penghapusan lampiran sebelum membuka semester.';end if;
 elsif tg_table_name='course_grade_state' then
  if old.locked and not new.locked and exists(select 1 from private.attachment_queue q join public.learning_assets a on a.id=q.asset_id where a.teaching_class_id=old.course_id and q.state in ('processing','failed')) then raise exception 'Selesaikan pekerjaan penghapusan lampiran sebelum membuka nilai.';end if;
 end if;return new;end;$$;
create trigger attachment_asset_guard before update on public.learning_assets for each row execute function private.attachment_guard();create trigger attachment_semester_guard before update on public.semesters for each row execute function private.attachment_guard();create trigger attachment_grade_guard before update on private.course_grade_state for each row execute function private.attachment_guard();
create function private.attachment_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare a public.learning_assets;begin
 for a in select * from public.learning_assets where id=any(new.asset_ids) order by id for share loop
  if a.status<>'ready' or a.retention_deleted_at is not null then raise exception 'Lampiran tidak tersedia; pilih berkas yang masih aktif.';end if;
 end loop;return new;end;$$;
create trigger attachment_reference_guard before insert or update of asset_ids on public.learning_submission_versions for each row execute function private.attachment_reference_guard();
-- Existing browsing authorization runs first; append only tombstones for already authorized visible targets/versions.
alter function private.learning_browse(text,jsonb) rename to learning_browse_pre_retention;
create function private.learning_browse(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare r jsonb;gone jsonb;begin
 r:=private.learning_browse_pre_retention(cmd,p);
 if cmd='history' then
 select coalesce(jsonb_agg(x||jsonb_build_object('retention_deleted_asset_ids',(select coalesce(jsonb_agg(a.id),'[]') from public.learning_assets a where a.retention_deleted_at is not null and (x->'asset_ids') @> jsonb_build_array(a.id)))),'[]') into r from jsonb_array_elements(r)x;
 end if;
 if cmd in ('course','submission-detail') then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'bytes',a.bytes,'mime',a.mime,'status','removed','target_type',a.target_type,'target_id',a.target_id,'owner_id',a.owner_id,'retention_deleted_at',a.retention_deleted_at)),'[]') into gone from public.learning_assets a where a.teaching_class_id=(p->>'course')::uuid and a.retention_deleted_at is not null and (
   (cmd='course' and ((a.target_type='material' and (r->'materials') @> jsonb_build_array(jsonb_build_object('id',a.target_id)) and private.material_access(a.target_id)) or (a.target_type='assignment' and (r->'assignments') @> jsonb_build_array(jsonb_build_object('id',a.target_id))) or (a.target_type='submission' and a.owner_id=auth.uid() and (r->'assignments') @> jsonb_build_array(jsonb_build_object('id',a.target_id)))))
   or (cmd='submission-detail' and exists(select 1 from public.learning_submission_versions v join public.learning_submissions u on u.id=v.submission_id and u.latest_version_id=v.id where u.id=(p->>'target')::uuid and a.id=any(v.asset_ids))));
  r:=jsonb_set(r,'{assets}',coalesce(r->'assets','[]')||gone);
 end if;return r;end;$$;
revoke all on function private.attachment_guard(),private.attachment_reference_guard(),private.learning_browse_pre_retention(text,jsonb),private.learning_browse(text,jsonb) from public,anon,authenticated;grant execute on function private.learning_browse(text,jsonb) to service_role;
-- Retire ad hoc cleanup while retaining compatibility with older deployed callers.
create or replace function public.learning_command(cmd text,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$begin perform private.require_mfa();perform private.flow_share((p->>'course')::uuid);if cmd='asset-cleanup' then perform private.learning_command('course',p);return '[]'::jsonb;end if;return private.learning_command(cmd,p);end;$$;
commit;
