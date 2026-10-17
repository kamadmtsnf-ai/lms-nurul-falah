begin;
create table private.material_rules(material_id uuid primary key references public.learning_materials(id) on delete cascade,prerequisite_id uuid references public.learning_materials(id),enabled boolean not null default false,check(material_id<>prerequisite_id));
create index material_rules_prerequisite on private.material_rules(prerequisite_id);
create table private.material_progress(material_id uuid not null references public.learning_materials(id) on delete cascade,student_id uuid not null references public.profiles(id),completed_at timestamptz not null default now(),primary key(material_id,student_id));
create index material_progress_student on private.material_progress(student_id);
create table private.course_discussions(id uuid primary key default gen_random_uuid(),course_id uuid not null references public.teaching_classes(id),material_id uuid not null references public.learning_materials(id),author_id uuid not null references public.profiles(id),body text not null check(length(trim(body)) between 1 and 3000),hidden boolean not null default false,created_at timestamptz not null default now());
create index discussions_course on private.course_discussions(course_id,created_at desc,id);create index discussions_material on private.course_discussions(material_id);create index discussions_author on private.course_discussions(author_id);
create table private.assignment_rules(assignment_id uuid primary key references public.learning_assignments(id) on delete cascade,revision_limit int not null default 20 check(revision_limit between 1 and 100),late_minutes int not null default 0 check(late_minutes between 0 and 43200),rubric jsonb not null default '[]',group_mode boolean not null default false);
create table private.assignment_groups(id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.learning_assignments(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 100),revision int not null default 0);
create index assignment_groups_task on private.assignment_groups(assignment_id);
create table private.assignment_group_members(group_id uuid not null references private.assignment_groups(id) on delete cascade,assignment_id uuid not null references public.learning_assignments(id) on delete cascade,student_id uuid not null references public.profiles(id),primary key(group_id,student_id),unique(assignment_id,student_id));
create index assignment_group_student on private.assignment_group_members(student_id);
create table private.course_weights(course_id uuid primary key references public.teaching_classes(id),assignment_weight numeric not null check(assignment_weight between 0 and 100),quiz_weight numeric not null check(quiz_weight between 0 and 100),visible boolean not null default false,check(assignment_weight+quiz_weight=100));
create table private.bank_questions(id uuid primary key default gen_random_uuid(),course_id uuid not null references public.teaching_classes(id),question jsonb not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create index bank_course on private.bank_questions(course_id,created_at desc,id);create index bank_author on private.bank_questions(created_by);
do $$ declare t text;begin foreach t in array array['material_rules','material_progress','course_discussions','assignment_rules','assignment_groups','assignment_group_members','course_weights','bank_questions'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);execute format('grant all on private.%I to service_role',t);end loop;end;$$;
create table private.rubric_marks(version_id uuid primary key references public.learning_submission_versions(id) on delete cascade,scores jsonb not null);
alter table private.rubric_marks enable row level security;revoke all on private.rubric_marks from public,anon,authenticated;grant all on private.rubric_marks to service_role;
create function private.material_access(mid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare m public.learning_materials;c jsonb;blocked boolean;
begin
 if not private.account_ready() then return false;end if;select * into m from public.learning_materials where id=mid;c:=private.learning_context(m.teaching_class_id);if c is null then return false;end if;
 if (c->>'manager')::boolean then return true;end if;
 if not private.learning_published(m.status,m.publish_at) then return false;end if;
 if not (c->>'student')::boolean then return true;end if;
 with recursive chain as (select r.prerequisite_id as id,array[mid,r.prerequisite_id] as path from private.material_rules r where r.material_id=mid and r.enabled and r.prerequisite_id is not null union all select r.prerequisite_id,path||r.prerequisite_id from chain ch join private.material_rules r on r.material_id=ch.id where r.enabled and r.prerequisite_id is not null and not r.prerequisite_id=any(path) and cardinality(path)<101)
 select exists(select 1 from chain where not exists(select 1 from private.material_progress p where p.material_id=chain.id and p.student_id=auth.uid())) into blocked;return not blocked;
end;$$;
alter function private.learning_asset_read(uuid) rename to learning_asset_read_v1;
create function private.learning_asset_read(asset uuid) returns boolean language plpgsql stable security definer set search_path='' as $$ declare a public.learning_assets;begin select * into a from public.learning_assets where id=asset;
 if a.target_type='material' and not private.material_access(a.target_id) then return false;end if;
 if private.learning_asset_read_v1(asset) then return true;end if;
 return a.status='ready' and a.target_type='submission' and private.account_ready() and exists(select 1 from private.assignment_group_members mine join private.assignment_group_members peer on peer.group_id=mine.group_id join public.learning_submission_versions v on a.id=any(v.asset_ids) join public.learning_submissions s on s.id=v.submission_id and s.student_id=peer.student_id where mine.student_id=auth.uid() and mine.assignment_id=a.target_id and private.learning_context(a.teaching_class_id) is not null);
end;$$;
alter function private.learning_browse(text,jsonb) rename to learning_browse_v1;
create function private.learning_browse(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb;begin result:=private.learning_browse_v1(cmd,p);
 if cmd='course' then
 result:=jsonb_set(result,'{materials}',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(result->'materials') x where private.material_access((x->>'id')::uuid)));
 result:=jsonb_set(result,'{assets}',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(result->'assets') x where x->>'target_type'<>'material' or private.material_access((x->>'target_id')::uuid)));
 end if;return result;end;$$;
create function private.weighted_report(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;ctx jsonb;w private.course_weights;rows jsonb;begin
 r:=private.learning_report(p);ctx:=private.learning_context((p->>'course')::uuid);
 select jsonb_set(r,'{rows}',coalesce(jsonb_agg(x||jsonb_build_object('quiz_average',(select round(avg(best),2) from (select max(a.score/a.max_score*100) best from public.learning_quiz_attempts a join public.learning_quizzes q on q.id=a.quiz_id where q.teaching_class_id=(p->>'course')::uuid and a.student_id=(x->>'id')::uuid and a.status<>'working' and ((ctx->>'reviewer')::boolean or q.grades_visible) group by q.id) scores))),'[]')) into r from jsonb_array_elements(r->'rows') x;
 select * into w from private.course_weights where course_id=(p->>'course')::uuid;
 select coalesce(jsonb_agg(x||jsonb_build_object('weighted_final',case when w.course_id is not null and ((ctx->>'reviewer')::boolean or w.visible) and (w.assignment_weight=0 or x->>'assignment_average' is not null) and (w.quiz_weight=0 or x->>'quiz_average' is not null) and (w.assignment_weight=0 or not exists(select 1 from public.learning_assignments a where a.teaching_class_id=w.course_id and private.learning_published(a.status,a.publish_at) and not exists(select 1 from public.learning_submissions s join public.learning_grades g on g.version_id=s.latest_version_id where s.assignment_id=a.id and s.student_id=(x->>'id')::uuid)))
 and (w.quiz_weight=0 or not exists(select 1 from public.learning_quizzes q where q.teaching_class_id=w.course_id and q.status='published' and not exists(select 1 from public.learning_quiz_attempts a where a.quiz_id=q.id and a.student_id=(x->>'id')::uuid and a.status<>'working' and a.score is not null)))
 and ((ctx->>'reviewer')::boolean or (not exists(select 1 from public.learning_assignments a where a.teaching_class_id=w.course_id and private.learning_published(a.status,a.publish_at) and not a.grades_visible) and not exists(select 1 from public.learning_quizzes q where q.teaching_class_id=w.course_id and q.status='published' and not q.grades_visible))) then round(coalesce((x->>'assignment_average')::numeric,0)*w.assignment_weight/100+coalesce((x->>'quiz_average')::numeric,0)*w.quiz_weight/100,2) else null end)),'[]') into rows from jsonb_array_elements(r->'rows') x;
 return r||jsonb_build_object('rows',rows,'weights',case when w.course_id is null then null else to_jsonb(w) end);end;$$;
alter function private.learning_mutate(text,jsonb) rename to learning_mutate_v1;
create function private.learning_mutate(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.learning_assignments;r private.assignment_rules;s public.learning_submissions;result jsonb;g uuid;item record;v public.learning_submission_versions;new_id uuid;
begin
 if not private.account_ready() or private.learning_context((p->>'course')::uuid) is null then raise exception 'Kelas tidak dapat diakses.' using errcode='42501';end if;
 if cmd='submit' then
 select * into task from public.learning_assignments where id=(p->>'target')::uuid and teaching_class_id=(p->>'course')::uuid for update;select * into r from private.assignment_rules where assignment_id=task.id;
 if r.group_mode then raise exception 'Gunakan pengumpulan kelompok pada tab Lanjutan.';end if;
 select * into s from public.learning_submissions where assignment_id=task.id and student_id=auth.uid();
 if not exists(select 1 from public.learning_submission_versions where id=(p->'data'->>'request_id')::uuid and submission_id=s.id) then
 if s.revision>=r.revision_limit then raise exception 'Batas revisi pengumpulan tercapai.';end if;
 if task.accept_late and r.late_minutes>0 and clock_timestamp()>task.due_at+make_interval(mins=>r.late_minutes) then raise exception 'Toleransi keterlambatan sudah lewat.';end if;end if;
 end if;
 if cmd='grade' then
 select a.* into task from public.learning_assignments a join public.learning_submissions su on su.assignment_id=a.id where su.latest_version_id=(p->>'target')::uuid and a.teaching_class_id=(p->>'course')::uuid;
 select * into r from private.assignment_rules where assignment_id=task.id;
 if r.assignment_id is not null and jsonb_array_length(r.rubric)>0 then
 if jsonb_typeof(p->'data'->'rubric_scores') is distinct from 'array' then raise exception 'Nilai tugas ini wajib menggunakan rubrik pada tab Lanjutan.';end if;
 if jsonb_array_length(p->'data'->'rubric_scores')<>jsonb_array_length(r.rubric) or exists(select 1 from jsonb_array_elements(p->'data'->'rubric_scores') with ordinality x(value,n) where jsonb_typeof(value)<>'number' or (value#>>'{}')::numeric not between 0 and (r.rubric->(n::int-1)->>'points')::numeric) then raise exception 'Skor kriteria rubrik tidak valid.';end if;
 if (select sum((x#>>'{}')::numeric) from jsonb_array_elements(p->'data'->'rubric_scores') x) is distinct from (p->'data'->>'score')::numeric then raise exception 'Total nilai harus sama dengan jumlah skor rubrik.';end if;
 end if;end if;
 result:=private.learning_mutate_v1(cmd,p);
 if cmd='grade' and p->'data'?'rubric_scores' then insert into private.rubric_marks values((p->>'target')::uuid,p->'data'->'rubric_scores') on conflict(version_id) do update set scores=excluded.scores;end if;
 if cmd='grade' then
 select sx.* into s from public.learning_submissions sx where latest_version_id=(p->>'target')::uuid;
 select gm.group_id into g from private.assignment_group_members gm where gm.assignment_id=s.assignment_id and gm.student_id=s.student_id;
 if g is not null then
 for item in select sub.latest_version_id from private.assignment_group_members gm join public.learning_submissions sub on sub.assignment_id=gm.assignment_id and sub.student_id=gm.student_id where gm.group_id=g and sub.id<>s.id loop
 perform private.learning_mutate_v1('grade',jsonb_build_object('course',p->'course','target',item.latest_version_id,'data',(p->'data')||jsonb_build_object('expected_updated_at',(select updated_at from public.learning_grades where version_id=item.latest_version_id))));
 if p->'data'?'rubric_scores' then insert into private.rubric_marks values(item.latest_version_id,p->'data'->'rubric_scores') on conflict(version_id) do update set scores=excluded.scores;end if;
 end loop;end if;end if;
 return result;end;$$;
-- Existing dispatcher continues to call the authorized wrappers by name.
revoke all on function private.material_access(uuid),private.learning_asset_read(uuid),private.learning_asset_read_v1(uuid),private.learning_browse_v1(text,jsonb),private.learning_mutate_v1(text,jsonb),private.weighted_report(jsonb) from public,anon,authenticated;
grant execute on function private.material_access(uuid),private.learning_asset_read(uuid),private.weighted_report(jsonb) to service_role;
revoke all on function private.learning_browse(text,jsonb),private.learning_mutate(text,jsonb) from public,anon;grant execute on function private.learning_browse(text,jsonb),private.learning_mutate(text,jsonb) to authenticated,service_role;
commit;
