create index academic_imports_school_idx on private.academic_imports(school_id);
create index enrollments_class_semester_idx on public.student_enrollments(school_id,classroom_id,semester_id);
