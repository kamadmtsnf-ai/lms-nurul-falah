begin;
create function private.learning_browse(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); course uuid:=nullif(p->>'course','')::uuid; school uuid; room uuid; c jsonb; result jsonb; obj jsonb:=coalesce(p->'data','{}'); target uuid:=nullif(p->>'target','')::uuid;
 m public.learning_meetings; mat public.learning_materials; task public.learning_assignments; sub public.learning_submissions; ver public.learning_submission_versions; asset public.learning_assets;
 old_grade public.learning_grades; att public.learning_meeting_attendance; dayatt public.learning_daily_attendance;
 r jsonb; usr uuid; rid uuid; day date; reason text; n int; path text; dates_from date; dates_to date; page_offset int:=greatest(0,least(coalesce((p->>'offset')::int,0),100000));
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi dan login kembali.' using errcode='42501'; end if;
 if cmd='catalog' then
  select coalesce(jsonb_agg(x),'[]') into result from (
   select t.id,t.school_id,s.name as school_name,cl.name as classroom,su.name as subject,pr.full_name as teacher,y.name as year,se.number as semester,se.status as semester_status
   from public.teaching_classes t join public.classrooms cl on cl.id=t.classroom_id join public.subjects su on su.id=t.subject_id join public.profiles pr on pr.id=t.teacher_id join public.schools s on s.id=t.school_id join public.semesters se on se.id=cl.semester_id join public.academic_years y on y.id=se.academic_year_id
   where private.learning_context(t.id) is not null order by se.starts_on desc,cl.name,su.name limit 1000
  ) x;return result;
 elsif cmd='daily-meta' then
  school:=(p->>'school')::uuid;
  if not private.is_member(school) then raise exception 'Akses ditolak.' using errcode='42501'; end if;
  select jsonb_build_object('classrooms',coalesce(jsonb_agg(x),'[]'),'today',(now() at time zone 'Asia/Jakarta')::date) into result from (
   select cl.id,cl.name,cl.semester_id,s.starts_on,s.ends_on,s.status as semester_status,y.name as year,s.number as semester
   from public.classrooms cl join public.semesters s on s.id=cl.semester_id join public.academic_years y on y.id=s.academic_year_id where cl.school_id=school and (
   private.has_school_role(school,'admin') or private.has_school_role(school,'principal') or
   (private.has_school_role(school,'homeroom_teacher') and exists(select 1 from public.homeroom_assignments h where h.school_id=school and h.classroom_id=cl.id and h.teacher_id=actor and h.active)) or
   (private.has_school_role(school,'teacher') and exists(select 1 from public.teaching_classes t where t.school_id=school and t.classroom_id=cl.id and t.teacher_id=actor and t.active)) or
   (private.has_school_role(school,'duty_teacher') and exists(select 1 from public.duty_assignments d where d.school_id=school and d.semester_id=s.id and d.teacher_id=actor and d.active))) order by s.starts_on desc,cl.name
  ) x;return result;
 elsif cmd in ('daily','daily-save','daily-report') then
  school:=(p->>'school')::uuid;room:=(p->>'classroom')::uuid;day:=(p->>'date')::date;
  if cmd='daily-report' then
   dates_from:=(p->>'from')::date;dates_to:=(p->>'to')::date;
   if dates_to<dates_from or dates_to-dates_from>366 then raise exception 'Rentang rekap maksimal 366 hari.'; end if;
   if not exists(select 1 from generate_series(dates_from,dates_to,'1 day') d where private.daily_access(school,room,d::date,false)) then raise exception 'Rekap di luar penugasan.' using errcode='42501'; end if;
   select coalesce(jsonb_agg(x),'[]') into result from (
    select a.student_id,pr.full_name,a.status,count(*)::int as count from public.learning_daily_attendance a join public.profiles pr on pr.id=a.student_id where a.school_id=school and a.classroom_id=room and a.local_date between dates_from and dates_to and private.daily_access(school,room,a.local_date,false) group by a.student_id,pr.full_name,a.status order by pr.full_name
   ) x;return jsonb_build_object('records',result);
  end if;
  if not private.daily_access(school,room,day,false) then raise exception 'Tanggal atau kelas di luar penugasan Anda.' using errcode='42501'; end if;
  if cmd='daily-save' then
   if not private.daily_access(school,room,day,true) then raise exception 'Anda tidak sedang bertugas piket pada hari ini atau semester sudah ditutup.' using errcode='42501'; end if;
   perform 1 from public.classrooms where school_id=school and id=room for update;
   if jsonb_typeof(p->'entries') is distinct from 'array' or jsonb_array_length(p->'entries') not between 1 and 300 then raise exception 'Daftar absensi tidak valid.'; end if;
   if (select count(distinct v->>'student') from jsonb_array_elements(p->'entries') v)<>jsonb_array_length(p->'entries') then raise exception 'Siswa ganda dalam absensi.'; end if;
   for r in select value from jsonb_array_elements(p->'entries') loop
    usr:=(r->>'student')::uuid;reason:=coalesce(r->>'reason','');
    if not exists(select 1 from public.student_enrollments e join public.classrooms cl on cl.school_id=e.school_id and cl.id=e.classroom_id where e.school_id=school and e.classroom_id=room and e.student_id=usr and (e.status='active' or exists(select 1 from public.learning_daily_attendance a where a.school_id=school and a.classroom_id=room and a.student_id=usr and a.local_date=day))) then raise exception 'Siswa bukan anggota rombel.'; end if;
    select * into dayatt from public.learning_daily_attendance where school_id=school and student_id=usr and local_date=day for update;
    if found and dayatt.classroom_id<>room then raise exception 'Absensi siswa sudah dicatat pada rombel lain.'; end if;
    if coalesce(dayatt.revision,0)<>coalesce((r->>'revision')::int,0) then raise exception 'Absensi berubah. Muat ulang sebelum menyimpan.'; end if;
    if dayatt.status is not null and dayatt.status=r->>'status' then continue; end if;
    if (dayatt.status is not null or day<(now() at time zone 'Asia/Jakarta')::date) and length(trim(reason))<5 then raise exception 'Perubahan atau pencatatan mundur memerlukan alasan minimal 5 karakter.'; end if;
    insert into public.learning_daily_attendance(school_id,classroom_id,student_id,local_date,status,revision,reason,recorded_by) values(school,room,usr,day,r->>'status',coalesce(dayatt.revision,0)+1,reason,actor)
    on conflict(school_id,student_id,local_date) do update set status=excluded.status,revision=excluded.revision,reason=excluded.reason,recorded_by=excluded.recorded_by where learning_daily_attendance.revision=coalesce(dayatt.revision,0) and learning_daily_attendance.classroom_id=room;
    if not found then raise exception 'Absensi berubah. Muat ulang sebelum menyimpan.'; end if;
    insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values(school,actor,'daily_attendance','learning_daily_attendance',usr::text,jsonb_build_object('date',day,'before',dayatt.status,'after',r->>'status','reason',reason));
   end loop;
  end if;
  return jsonb_build_object('can_write',private.daily_access(school,room,day,true),'date',day,'roster',(select coalesce(jsonb_agg(x order by x.full_name),'[]') from (
   select distinct pr.id,pr.full_name from public.profiles pr join public.student_enrollments e on e.student_id=pr.id where e.school_id=school and e.classroom_id=room and (e.status='active' or exists(select 1 from public.learning_daily_attendance a where a.school_id=school and a.classroom_id=room and a.student_id=pr.id and a.local_date=day))
  ) x),'attendance',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.learning_daily_attendance a where a.school_id=school and a.classroom_id=room and a.local_date=day));
 end if;
 c:=private.learning_context(course);
 if c is null then raise exception 'Kelas mata pelajaran tidak dapat diakses.' using errcode='42501'; end if;
 school:=(c->>'school')::uuid;room:=(c->>'classroom')::uuid;
 if cmd='course' then
  result:=jsonb_build_object('offset',page_offset,'has_more',exists(select 1 from public.learning_materials where teaching_class_id=course and ((c->>'manager')::boolean or private.learning_published(status,publish_at)) offset page_offset+20) or exists(select 1 from public.learning_assignments where teaching_class_id=course and ((c->>'manager')::boolean or private.learning_published(status,publish_at)) offset page_offset+20) or exists(select 1 from public.learning_meetings where teaching_class_id=course offset page_offset+20),'context',c||jsonb_build_object('actor',actor),'course',(select jsonb_build_object('id',t.id,'subject',su.name,'classroom',cl.name,'teacher',pr.full_name) from public.teaching_classes t join public.subjects su on su.id=t.subject_id join public.classrooms cl on cl.id=t.classroom_id join public.profiles pr on pr.id=t.teacher_id where t.id=course));
  result:=result||jsonb_build_object('meetings',(select coalesce(jsonb_agg(to_jsonb(m) order by m.starts_at desc),'[]') from (select * from public.learning_meetings where teaching_class_id=course order by starts_at desc,id limit 20 offset page_offset) m));
  result:=result||jsonb_build_object('materials',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]') from (select * from public.learning_materials where teaching_class_id=course and ((c->>'manager')::boolean or private.learning_published(status,publish_at)) order by created_at desc,id limit 20 offset page_offset) m));
  result:=result||jsonb_build_object('assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by a.due_at),'[]') from (select * from public.learning_assignments where teaching_class_id=course and ((c->>'manager')::boolean or private.learning_published(status,publish_at)) order by due_at,id limit 20 offset page_offset) a));
  result:=result||jsonb_build_object('roster',(select coalesce(jsonb_agg(x order by x.full_name),'[]') from (
   select distinct pr.id,pr.full_name from public.profiles pr where exists(select 1 from public.student_enrollments e where e.school_id=school and e.classroom_id=room and e.student_id=pr.id) and ((c->>'reviewer')::boolean or pr.id=actor or (c->'children') @> to_jsonb(array[pr.id]))
  ) x));
  result:=result||jsonb_build_object('attendance',(select coalesce(jsonb_agg(jsonb_build_object('meeting_id',a.meeting_id,'student_id',a.student_id,'status',a.status,'revision',a.revision)),'[]') from public.learning_meeting_attendance a join public.learning_meetings m on m.id=a.meeting_id where (result->'meetings') @> jsonb_build_array(jsonb_build_object('id',m.id)) and ((c->>'reviewer')::boolean or a.student_id=actor or (c->'children') @> to_jsonb(array[a.student_id]))));
  result:=result||jsonb_build_object('meeting_roster',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.learning_roster r join public.learning_meetings m on m.id=r.meeting_id where (result->'meetings') @> jsonb_build_array(jsonb_build_object('id',m.id)) and ((c->>'reviewer')::boolean or r.student_id=actor or (c->'children') @> to_jsonb(array[r.student_id]))));
  result:=result||jsonb_build_object('daily',(select coalesce(jsonb_agg(x),'[]') from (select a.student_id,a.status,count(*)::int as count from public.learning_daily_attendance a where a.school_id=school and a.classroom_id=room and ((c->>'reviewer')::boolean or a.student_id=actor or (c->'children') @> to_jsonb(array[a.student_id])) group by a.student_id,a.status) x));
  result:=result||jsonb_build_object('submissions',(select coalesce(jsonb_agg(x),'[]') from (
   select s.id,s.assignment_id,s.student_id,s.revision,v.id as version_id,v.version,case when s.student_id=actor then v.body else '' end as body,case when s.student_id=actor then v.links else '[]'::jsonb end as links,case when s.student_id=actor then v.asset_ids else '{}'::uuid[] end as asset_ids,v.is_late,v.submitted_at from public.learning_submissions s join public.learning_assignments a on a.id=s.assignment_id join public.learning_submission_versions v on v.id=s.latest_version_id where (result->'assignments') @> jsonb_build_array(jsonb_build_object('id',a.id)) and ((c->>'manager')::boolean or (s.student_id=actor and private.learning_published(a.status,a.publish_at)))
  ) x));
  result:=result||jsonb_build_object('grades',(select coalesce(jsonb_agg(x),'[]') from (
   select g.version_id,s.assignment_id,s.student_id,g.score,case when s.student_id=actor then g.feedback else '' end as feedback,g.updated_at,a.max_score,a.grades_visible from public.learning_grades g join public.learning_submissions s on s.latest_version_id=g.version_id join public.learning_assignments a on a.id=s.assignment_id where (result->'assignments') @> jsonb_build_array(jsonb_build_object('id',a.id)) and ((c->>'reviewer')::boolean or (a.grades_visible and private.learning_published(a.status,a.publish_at) and (s.student_id=actor or (c->'children') @> to_jsonb(array[s.student_id]))))
  ) x));
  result:=result||jsonb_build_object('assets',(select coalesce(jsonb_agg(to_jsonb(a)-'object_path'-'expires_at'),'[]') from public.learning_assets a where a.teaching_class_id=course and private.learning_asset_read(a.id) and ((a.target_type='material' and (result->'materials') @> jsonb_build_array(jsonb_build_object('id',a.target_id))) or (a.target_type='assignment' and (result->'assignments') @> jsonb_build_array(jsonb_build_object('id',a.target_id))) or (a.target_type='submission' and a.owner_id=actor and (result->'assignments') @> jsonb_build_array(jsonb_build_object('id',a.target_id))))));
  return result;
 elsif cmd='submission-detail' then
  select * into sub from public.learning_submissions where id=target;select * into task from public.learning_assignments where id=sub.assignment_id and teaching_class_id=course;
  if task.id is null or not ((c->>'manager')::boolean or (sub.student_id=actor and private.learning_published(task.status,task.publish_at))) then raise exception 'Kiriman tidak dapat diakses.' using errcode='42501'; end if;
  select * into ver from public.learning_submission_versions where id=sub.latest_version_id;
  return jsonb_build_object('body',ver.body,'links',ver.links,'assets',(select coalesce(jsonb_agg(to_jsonb(a)-'object_path'-'expires_at'),'[]') from public.learning_assets a where a.id=any(ver.asset_ids) and private.learning_asset_read(a.id)),'grade',(select to_jsonb(g) from public.learning_grades g where g.version_id=ver.id and ((c->>'manager')::boolean or task.grades_visible)));
 elsif cmd='history' then
  select * into sub from public.learning_submissions where id=target;select * into task from public.learning_assignments where id=sub.assignment_id and teaching_class_id=course;
  if task.id is null or not ((c->>'manager')::boolean or (sub.student_id=actor and private.learning_published(task.status,task.publish_at))) then raise exception 'Riwayat tidak dapat diakses.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.version desc),'[]') into result from (select * from public.learning_submission_versions where submission_id=sub.id order by version desc limit 20 offset page_offset) v;return result;
 else raise exception 'Tindakan pembacaan tidak dikenal.'; end if;
end; $$;
revoke all on function private.learning_browse(text,jsonb) from public,anon,authenticated;
grant execute on function private.learning_browse(text,jsonb) to service_role;
commit;
