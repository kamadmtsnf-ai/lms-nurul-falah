begin;
-- Same OR semantics as the individual permissive policies, evaluated in one policy.
alter policy classrooms_read on public.classrooms using(private.classroom_access(school_id,id) or (private.is_member(school_id) and exists(select 1 from public.teaching_classes t where t.classroom_id=classrooms.id and private.team_teacher(t.id))));
alter policy teaching_classes_read on public.teaching_classes using(private.academic_scope(school_id,classroom_id,null,case when active then teacher_id else null end) or private.team_teacher(id));
alter policy enrollments_read on public.student_enrollments using(private.academic_scope(school_id,classroom_id,student_id,null) or (private.is_member(school_id) and exists(select 1 from public.teaching_classes t where t.classroom_id=student_enrollments.classroom_id and private.team_teacher(t.id))));
drop policy team_classroom_read on public.classrooms;
drop policy team_teaching_read on public.teaching_classes;
drop policy team_enrollment_read on public.student_enrollments;
commit;
