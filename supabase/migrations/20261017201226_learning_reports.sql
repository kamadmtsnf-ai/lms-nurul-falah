begin;
create function private.learning_report(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_course uuid:=(p->>'course')::uuid;v_c jsonb;v_room uuid;v_a record;v_students uuid[];v_rows jsonb;v_offset int:=greatest(0,least(coalesce((p->>'offset')::int,0),100000));
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi akun.' using errcode='42501';end if;
 v_c:=private.learning_context(v_course);if v_c is null then raise exception 'Laporan tidak dapat diakses.' using errcode='42501';end if;v_room:=(v_c->>'classroom')::uuid;
 select coalesce(array_agg(id),'{}') into v_students from (select distinct pr.id,pr.full_name from public.profiles pr join public.student_enrollments e on e.student_id=pr.id where e.classroom_id=v_room and ((v_c->>'reviewer')::boolean or pr.id=auth.uid() or (v_c->'children')@>to_jsonb(array[pr.id])) order by pr.full_name,pr.id limit 100 offset v_offset) x;
 -- Lazy expiry also works for teacher reports; deterministic lock order shared with attempts.
 for v_a in select q.id from public.learning_quizzes q where q.teaching_class_id=v_course order by q.id for update loop
  perform 1 from public.learning_quiz_attempts a where a.quiz_id=v_a.id and a.student_id=any(v_students) and a.status='working' and a.deadline<=clock_timestamp() order by a.id for update;
  perform private.quiz_finish(a.id,true) from public.learning_quiz_attempts a where a.quiz_id=v_a.id and a.student_id=any(v_students) and a.status='working' and a.deadline<=clock_timestamp();
 end loop;
 select coalesce(jsonb_agg(x order by x.full_name,x.id),'[]') into v_rows from (
  select pr.id,pr.full_name,
   (select count(*) from public.learning_meeting_attendance a join public.learning_meetings m on m.id=a.meeting_id where m.teaching_class_id=v_course and a.student_id=pr.id and a.status='present') as present,
   (select count(*) from public.learning_meeting_attendance a join public.learning_meetings m on m.id=a.meeting_id where m.teaching_class_id=v_course and a.student_id=pr.id) as attendance_recorded,
   (select count(*) from public.learning_assignments a where a.teaching_class_id=v_course and private.learning_published(a.status,a.publish_at) and a.due_at<clock_timestamp() and not exists(select 1 from public.learning_submissions s where s.assignment_id=a.id and s.student_id=pr.id)) as overdue_missing,
   (select count(*) from public.learning_submissions s join public.learning_assignments a on a.id=s.assignment_id where a.teaching_class_id=v_course and s.student_id=pr.id) as submissions,
   (select round(avg(g.score/a.max_score*100),2) from public.learning_grades g join public.learning_submissions s on s.latest_version_id=g.version_id join public.learning_assignments a on a.id=s.assignment_id where a.teaching_class_id=v_course and s.student_id=pr.id and ((v_c->>'reviewer')::boolean or (a.grades_visible and private.learning_published(a.status,a.publish_at)))) as assignment_average,
   (select round(avg(a.score/a.max_score*100),2) from public.learning_quiz_attempts a join public.learning_quizzes q on q.id=a.quiz_id where q.teaching_class_id=v_course and a.student_id=pr.id and a.status<>'working' and ((v_c->>'reviewer')::boolean or q.grades_visible)) as quiz_average
  from public.profiles pr where pr.id=any(v_students)
 ) x;
 return jsonb_build_object('offset',v_offset,'has_more',exists(select 1 from public.student_enrollments e join public.profiles pr on pr.id=e.student_id where e.classroom_id=v_room and ((v_c->>'reviewer')::boolean or pr.id=auth.uid() or (v_c->'children')@>to_jsonb(array[pr.id])) group by pr.id,pr.full_name order by pr.full_name,pr.id offset v_offset+100),'generated_at',clock_timestamp(),'course',(select jsonb_build_object('classroom',cl.name,'subject',su.name,'teacher',pr.full_name) from public.teaching_classes t join public.classrooms cl on cl.id=t.classroom_id join public.subjects su on su.id=t.subject_id join public.profiles pr on pr.id=t.teacher_id where t.id=v_course),'rows',v_rows,
 'quizzes',(select coalesce(jsonb_agg(x order by x.title,x.student_name),'[]') from (
 select q.id as quiz_id,q.title,pr.full_name as student_name,a.student_id,a.id as attempt_id,a.status,a.started_at,a.deadline,a.finished_at,case when (v_c->>'reviewer')::boolean or q.grades_visible then a.score else null end as score,a.max_score,q.grades_visible,((v_c->>'manager')::boolean or a.student_id=auth.uid()) as can_open from public.learning_quizzes q join public.learning_quiz_attempts a on a.quiz_id=q.id join public.profiles pr on pr.id=a.student_id where q.teaching_class_id=v_course and a.student_id=any(v_students)
 ) x),
 'activity',case when (v_c->>'reviewer')::boolean then jsonb_build_object('meetings',(select count(*) from public.learning_meetings where teaching_class_id=v_course),'materials',(select count(*) from public.learning_materials where teaching_class_id=v_course),'assignments',(select count(*) from public.learning_assignments where teaching_class_id=v_course),'quizzes',(select count(*) from public.learning_quizzes where teaching_class_id=v_course)) else null end);
end;$$;
revoke all on function private.learning_report(jsonb) from public,anon;grant execute on function private.learning_report(jsonb) to authenticated,service_role;
commit;
