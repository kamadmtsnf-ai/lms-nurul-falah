begin;
create function private.learning_mutate(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if not (c->>'writable')::boolean then raise exception 'Semester arsip hanya dapat dibaca.'; end if;
 if cmd='submit' then
  if not (c->>'student_writable')::boolean then raise exception 'Anda bukan siswa aktif pada kelas ini.' using errcode='42501'; end if;
  select * into task from public.learning_assignments where id=target and teaching_class_id=course for update;
  if not found or not private.learning_published(task.status,task.publish_at) then raise exception 'Tugas belum dibuka.'; end if;
  rid:=(obj->>'request_id')::uuid;
  select v.* into ver from public.learning_submission_versions v join public.learning_submissions s on s.id=v.submission_id where v.id=rid and s.assignment_id=target and s.student_id=actor;
  if found then return jsonb_build_object('id',ver.id,'version',ver.version,'repeated',true); end if;
  if clock_timestamp()>task.due_at and not task.accept_late then raise exception 'Batas waktu pengumpulan sudah lewat.'; end if;
  if not private.learning_links(coalesce(obj->'links','[]')) then raise exception 'Tautan harus menggunakan HTTPS dan maksimal 10.'; end if;
  if (length(trim(coalesce(obj->>'body','')))>0 and not 'text'=any(task.formats)) or (jsonb_array_length(coalesce(obj->'links','[]'))>0 and not 'link'=any(task.formats)) or (jsonb_array_length(coalesce(obj->'asset_ids','[]'))>0 and not 'file'=any(task.formats)) then raise exception 'Cara pengumpulan tidak sesuai pilihan guru.'; end if;
  if length(trim(coalesce(obj->>'body','')))=0 and jsonb_array_length(coalesce(obj->'links','[]'))=0 and jsonb_array_length(coalesce(obj->'asset_ids','[]'))=0 then raise exception 'Isi jawaban, tautan atau berkas sebelum mengumpulkan.'; end if;
  if jsonb_array_length(coalesce(obj->'asset_ids','[]'))>5 or exists(select 1 from jsonb_array_elements_text(coalesce(obj->'asset_ids','[]')) a where not exists(select 1 from public.learning_assets f where f.id=a::uuid and f.teaching_class_id=course and f.owner_id=actor and f.target_type='submission' and f.target_id=target and f.status='ready')) then raise exception 'Lampiran tidak valid atau bukan milik Anda.'; end if;
  insert into public.learning_submissions(school_id,assignment_id,student_id) values(school,target,actor) on conflict(assignment_id,student_id) do nothing;
  select * into sub from public.learning_submissions where assignment_id=target and student_id=actor for update;
  if sub.revision<>coalesce((obj->>'revision')::int,0) then raise exception 'Kiriman berubah di tab lain. Muat ulang sebelum mengirim.'; end if;
  insert into public.learning_submission_versions(id,school_id,submission_id,version,body,links,asset_ids,is_late) values(rid,school,sub.id,sub.revision+1,coalesce(obj->>'body',''),coalesce(obj->'links','[]'),array(select a::uuid from jsonb_array_elements_text(coalesce(obj->'asset_ids','[]')) a),clock_timestamp()>task.due_at);
  update public.learning_submissions set latest_version_id=rid,revision=revision+1 where id=sub.id;
  return jsonb_build_object('id',rid,'version',sub.revision+1);
 end if;
 if not (c->>'manager')::boolean then raise exception 'Hanya guru pengampu atau admin yang dapat mengubah pembelajaran.' using errcode='42501'; end if;
 if cmd='meeting-save' then
  if target is not null then
   select * into m from public.learning_meetings where id=target and teaching_class_id=course for update;
   if not found or (m.updated_at is distinct from (obj->>'expected_updated_at')::timestamptz) then raise exception 'Pertemuan berubah. Muat ulang.'; end if;
   if exists(select 1 from public.learning_meeting_attendance where meeting_id=target) and m.starts_at is distinct from (obj->>'starts_at')::timestamptz then raise exception 'Jadwal pertemuan yang sudah diabsen tidak dapat dipindah.'; end if;
   update public.learning_meetings set title=obj->>'title',starts_at=(obj->>'starts_at')::timestamptz where id=target;
  else
   insert into public.learning_meetings(school_id,teaching_class_id,title,starts_at,created_by) values(school,course,obj->>'title',(obj->>'starts_at')::timestamptz,actor) returning id into target;
  end if;
  if not exists(select 1 from public.semesters s where s.id=(c->>'semester')::uuid and (obj->>'starts_at')::timestamptz at time zone 'Asia/Jakarta'>=s.starts_on::timestamp and (obj->>'starts_at')::timestamptz at time zone 'Asia/Jakarta'<(s.ends_on+1)::timestamp) then raise exception 'Tanggal pertemuan di luar semester.'; end if;
  insert into public.learning_roster(school_id,meeting_id,student_id) select school,target,e.student_id from public.student_enrollments e where e.school_id=school and e.classroom_id=room and e.status='active' on conflict do nothing;
 elsif cmd='meeting-sync' then
  if not exists(select 1 from public.learning_meetings where id=target and teaching_class_id=course) then raise exception 'Pertemuan tidak ditemukan.'; end if;
  insert into public.learning_roster(school_id,meeting_id,student_id) select school,target,e.student_id from public.student_enrollments e where e.school_id=school and e.classroom_id=room and e.status='active' on conflict do nothing;
 elsif cmd='meeting-attendance' then
  select * into m from public.learning_meetings where id=target and teaching_class_id=course for update;
  if not found or m.starts_at>clock_timestamp() then raise exception 'Pertemuan belum dimulai atau tidak ditemukan.'; end if;
  if jsonb_typeof(p->'entries') is distinct from 'array' or jsonb_array_length(p->'entries') not between 1 and 300 then raise exception 'Daftar absensi tidak valid.'; end if;
  if (select count(distinct v->>'student') from jsonb_array_elements(p->'entries') v)<>jsonb_array_length(p->'entries') then raise exception 'Siswa ganda dalam absensi.'; end if;
  for r in select value from jsonb_array_elements(p->'entries') loop
   usr:=(r->>'student')::uuid;reason:=coalesce(r->>'reason','');
   if not exists(select 1 from public.learning_roster where meeting_id=target and student_id=usr) then raise exception 'Siswa tidak ada dalam daftar pertemuan.'; end if;
   select * into att from public.learning_meeting_attendance where meeting_id=target and student_id=usr for update;
   if coalesce(att.revision,0)<>coalesce((r->>'revision')::int,0) then raise exception 'Absensi berubah. Muat ulang sebelum menyimpan.'; end if;
   if att.status is not null and att.status=r->>'status' then continue; end if;
   if att.status is not null and length(trim(reason))<5 then raise exception 'Perubahan absensi memerlukan alasan minimal 5 karakter.'; end if;
   insert into public.learning_meeting_attendance(school_id,meeting_id,student_id,status,revision,reason,recorded_by) values(school,target,usr,r->>'status',coalesce(att.revision,0)+1,reason,actor)
   on conflict(meeting_id,student_id) do update set status=excluded.status,revision=excluded.revision,reason=excluded.reason,recorded_by=excluded.recorded_by;
   insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(school,actor,'meeting_attendance','learning_meeting_attendance',target::text,jsonb_build_object('student',usr,'before',att.status,'after',r->>'status','reason',reason));
  end loop;
 elsif cmd='material-save' then
  if not private.learning_links(coalesce(obj->'links','[]')) then raise exception 'Tautan harus menggunakan HTTPS.'; end if;
  if not exists(select 1 from public.learning_meetings where id=(obj->>'meeting_id')::uuid and teaching_class_id=course) then raise exception 'Pertemuan tidak ditemukan.'; end if;
  if target is null then
   insert into public.learning_materials(school_id,teaching_class_id,meeting_id,title,body,links,status,publish_at,created_by) values(school,course,(obj->>'meeting_id')::uuid,obj->>'title',coalesce(obj->>'body',''),coalesce(obj->'links','[]'),obj->>'status',nullif(obj->>'publish_at','')::timestamptz,actor) returning id into target;
  else
   update public.learning_materials set meeting_id=(obj->>'meeting_id')::uuid,title=obj->>'title',body=coalesce(obj->>'body',''),links=coalesce(obj->'links','[]'),status=obj->>'status',publish_at=nullif(obj->>'publish_at','')::timestamptz where id=target and teaching_class_id=course and updated_at=(obj->>'expected_updated_at')::timestamptz;
   if not found then raise exception 'Materi berubah. Muat ulang.'; end if;
  end if;
 elsif cmd='assignment-save' then
  if target is not null then
   select * into task from public.learning_assignments where id=target and teaching_class_id=course for update;
   if not found or task.updated_at is distinct from (obj->>'expected_updated_at')::timestamptz then raise exception 'Tugas berubah. Muat ulang.'; end if;
   if exists(select 1 from public.learning_submissions where assignment_id=target) and (task.max_score<>(obj->>'max_score')::numeric or to_jsonb(task.formats) is distinct from obj->'formats') then raise exception 'Skor maksimum dan cara pengumpulan sudah dipakai. Buat tugas baru untuk aturan berbeda.'; end if;
   update public.learning_assignments set title=obj->>'title',instructions=coalesce(obj->>'instructions',''),formats=array(select x from jsonb_array_elements_text(obj->'formats') x),due_at=(obj->>'due_at')::timestamptz,accept_late=(obj->>'accept_late')::boolean,max_score=(obj->>'max_score')::numeric,status=obj->>'status',publish_at=nullif(obj->>'publish_at','')::timestamptz where id=target;
  else
   insert into public.learning_assignments(school_id,teaching_class_id,title,instructions,formats,due_at,accept_late,max_score,status,publish_at,created_by) values(school,course,obj->>'title',coalesce(obj->>'instructions',''),array(select x from jsonb_array_elements_text(obj->'formats') x),(obj->>'due_at')::timestamptz,(obj->>'accept_late')::boolean,(obj->>'max_score')::numeric,obj->>'status',nullif(obj->>'publish_at','')::timestamptz,actor) returning id into target;
  end if;
 elsif cmd='grade' then
  select a.* into task from public.learning_assignments a join public.learning_submissions s on s.assignment_id=a.id where s.latest_version_id=target and a.teaching_class_id=course for update of a;
  if not found or not exists(select 1 from public.learning_submissions where latest_version_id=target and assignment_id=task.id) then raise exception 'Kiriman bukan versi terbaru. Muat ulang sebelum menilai.'; end if;
  if not (c->>'teacher')::boolean and length(trim(coalesce(obj->>'reason','')))<5 then raise exception 'Penilaian oleh admin memerlukan alasan minimal 5 karakter.'; end if;
  if (obj->>'score')::numeric>task.max_score then raise exception 'Nilai melebihi skor maksimum tugas.'; end if;
  select * into old_grade from public.learning_grades where version_id=target;
  if found and old_grade.updated_at is distinct from (obj->>'expected_updated_at')::timestamptz then raise exception 'Nilai berubah. Muat ulang sebelum menyimpan.'; end if;
  insert into public.learning_grades(version_id,school_id,score,feedback,graded_by,reason) values(target,school,(obj->>'score')::numeric,coalesce(obj->>'feedback',''),actor,coalesce(obj->>'reason','')) on conflict(version_id) do update set score=excluded.score,feedback=excluded.feedback,graded_by=excluded.graded_by,reason=excluded.reason;
  insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(school,actor,'grade','learning_grades',target::text,jsonb_build_object('before',old_grade.score,'after',obj->>'score','reason',obj->>'reason'));
 elsif cmd='release-grades' then
  update public.learning_assignments set grades_visible=(obj->>'visible')::boolean where id=target and teaching_class_id=course and updated_at=(obj->>'expected_updated_at')::timestamptz;
  if not found then raise exception 'Tugas berubah. Muat ulang.'; end if;
 else raise exception 'Tindakan pembelajaran tidak dikenal.';
 end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id) values(school,actor,cmd,'learning',coalesce(target,course)::text);
 return jsonb_build_object('id',target);
end; $$;
revoke all on function private.learning_mutate(text,jsonb) from public,anon,authenticated;
grant execute on function private.learning_mutate(text,jsonb) to service_role;
create function private.learning_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi dan login kembali.' using errcode='42501'; end if;
 if cmd in ('catalog','daily-meta','daily','daily-save','daily-report','course','history','submission-detail') then return private.learning_browse(cmd,p);
 elsif cmd in ('asset-reserve','asset-complete','asset-info','asset-fail','asset-cleanup') then return private.learning_uploads(cmd,p);
 else return private.learning_mutate(cmd,p); end if;
end; $$;
revoke all on function private.learning_command(text,jsonb) from public,anon;
grant execute on function private.learning_command(text,jsonb) to authenticated,service_role;
create function public.learning_command(cmd text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.learning_command(cmd,p); $$;
revoke all on function public.learning_command(text,jsonb) from public,anon;
grant execute on function public.learning_command(text,jsonb) to authenticated,service_role;
commit;
