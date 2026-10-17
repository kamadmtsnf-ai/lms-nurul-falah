begin;
create function private.learning_uploads(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); course uuid:=nullif(p->>'course','')::uuid; school uuid; room uuid; c jsonb; result jsonb; obj jsonb:=coalesce(p->'data','{}'); target uuid:=nullif(p->>'target','')::uuid;
 m public.learning_meetings; mat public.learning_materials; task public.learning_assignments; sub public.learning_submissions; ver public.learning_submission_versions; asset public.learning_assets;
 old_grade public.learning_grades; att public.learning_meeting_attendance; dayatt public.learning_daily_attendance;
 r jsonb; usr uuid; rid uuid; day date; reason text; n int; path text; dates_from date; dates_to date; page_offset int:=greatest(0,least(coalesce((p->>'offset')::int,0),100000));
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi dan login kembali.' using errcode='42501'; end if;
 c:=private.learning_context(course);
 if c is null then raise exception 'Kelas mata pelajaran tidak dapat diakses.' using errcode='42501'; end if;
 school:=(c->>'school')::uuid;room:=(c->>'classroom')::uuid;
 if cmd in ('asset-reserve','asset-complete','asset-info','asset-fail','asset-cleanup') then
  if cmd='asset-cleanup' then
   with expired as(update public.learning_assets set status='removed' where teaching_class_id=course and owner_id=actor and status='pending' and expires_at<now() returning object_path) select coalesce(jsonb_agg(object_path),'[]') into result from expired;return result;
  elsif cmd='asset-reserve' then
   if not (c->>'writable')::boolean then raise exception 'Semester arsip hanya dapat dibaca.'; end if;
   if obj->>'target_type'='material' then
    if not (c->>'manager')::boolean or not exists(select 1 from public.learning_materials where id=(obj->>'target_id')::uuid and teaching_class_id=course) then raise exception 'Materi di luar penugasan.' using errcode='42501'; end if;
   elsif obj->>'target_type'='assignment' then
    if not (c->>'manager')::boolean or not exists(select 1 from public.learning_assignments where id=(obj->>'target_id')::uuid and teaching_class_id=course) then raise exception 'Tugas di luar penugasan.' using errcode='42501'; end if;
   elsif obj->>'target_type'='submission' then
    select * into task from public.learning_assignments where id=(obj->>'target_id')::uuid and teaching_class_id=course;
    if not (c->>'student_writable')::boolean or task.id is null or not private.learning_published(task.status,task.publish_at) or (clock_timestamp()>task.due_at and not task.accept_late) or not 'file'=any(task.formats) then raise exception 'Unggahan tugas tidak diperbolehkan.' using errcode='42501'; end if;
   else raise exception 'Tujuan unggahan tidak valid.'; end if;
   if (select count(*) from public.learning_assets where teaching_class_id=course and owner_id=actor and status='pending' and expires_at>now())>=10 then raise exception 'Selesaikan unggahan sebelumnya terlebih dahulu.'; end if;
   rid:=gen_random_uuid();path:=school::text||'/'||course::text||'/'||rid::text;
   insert into public.learning_assets(id,school_id,teaching_class_id,owner_id,target_type,target_id,name,kind,mime,bytes,object_path) values(rid,school,course,actor,obj->>'target_type',(obj->>'target_id')::uuid,obj->>'name',obj->>'kind',obj->>'mime',(obj->>'bytes')::int,path);
   return jsonb_build_object('id',rid,'path',path);
  end if;
  select * into asset from public.learning_assets where id=target and teaching_class_id=course for update;
  if not found then raise exception 'Berkas tidak ditemukan.'; end if;
  if cmd='asset-info' then
   if not private.learning_asset_read(target) then raise exception 'Berkas tidak dapat diakses.' using errcode='42501'; end if;
   return to_jsonb(asset);
  elsif asset.owner_id<>actor then raise exception 'Berkas bukan milik Anda.' using errcode='42501'; end if;
  if cmd='asset-fail' then
   if asset.status='pending' then update public.learning_assets set status='removed' where id=target;end if;return to_jsonb(asset);
  elsif asset.status='ready' then return to_jsonb(asset);
  elsif asset.status<>'pending' or asset.expires_at<now() or not (c->>'writable')::boolean then raise exception 'Izin unggahan telah berakhir.'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='lms-private' and o.name=asset.object_path and (o.metadata->>'size')::bigint=asset.bytes and o.metadata->>'mimetype'=asset.mime) then raise exception 'Berkas belum diunggah atau ukuran/format tidak sesuai.'; end if;
  -- Hanya server layanan dapat menyatakan signature sudah terverifikasi.
  if not exists(select 1 from private.learning_asset_checks k where k.asset_id=asset.id and k.nonce=(p->>'check')::uuid and k.expires_at>now()) then raise exception 'Berkas belum diverifikasi server.'; end if;
  update public.learning_assets set status='ready' where id=target;
  delete from private.learning_asset_checks where asset_id=target;
  return to_jsonb(asset)||jsonb_build_object('status','ready');
 end if;
 raise exception 'Tindakan berkas tidak dikenal.';
end; $$;
revoke all on function private.learning_uploads(text,jsonb) from public,anon,authenticated;
grant execute on function private.learning_uploads(text,jsonb) to service_role;
commit;
