begin;
create table public.learning_quizzes(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 teaching_class_id uuid not null references public.teaching_classes(id), title text not null check(length(title) between 2 and 150), instructions text not null default '' check(length(instructions)<=10000),
 status text not null default 'draft' check(status in ('draft','published','archived')), opens_at timestamptz not null, closes_at timestamptz not null,
 duration_minutes int not null check(duration_minutes between 1 and 240), grades_visible boolean not null default false, explanations_visible boolean not null default false,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(closes_at>opens_at), check(not explanations_visible or grades_visible)
);
create table private.quiz_questions(
 quiz_id uuid not null references public.learning_quizzes(id) on delete cascade, position int not null check(position between 1 and 100),
 kind text not null check(kind in ('choice','boolean')), prompt text not null check(length(prompt) between 1 and 4000), options jsonb not null,
 correct int not null, explanation text not null default '' check(length(explanation)<=4000), points numeric not null check(points>0 and points<=100),primary key(quiz_id,position)
);
create table public.learning_quiz_attempts(
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.learning_quizzes(id), student_id uuid not null references public.profiles(id),
 started_at timestamptz not null default clock_timestamp(), deadline timestamptz not null, finished_at timestamptz, status text not null default 'working' check(status in ('working','submitted','expired')),
 score numeric, max_score numeric not null, revision int not null default 0, unique(quiz_id,student_id)
);
create table private.quiz_snapshots(attempt_id uuid primary key references public.learning_quiz_attempts(id) on delete cascade,questions jsonb not null);
create table private.quiz_answers(attempt_id uuid not null references public.learning_quiz_attempts(id) on delete cascade,position int not null,choice int not null,updated_at timestamptz not null default clock_timestamp(),primary key(attempt_id,position));
alter table public.learning_quizzes enable row level security;alter table public.learning_quiz_attempts enable row level security;
alter table private.quiz_questions enable row level security;alter table private.quiz_snapshots enable row level security;alter table private.quiz_answers enable row level security;
revoke all on public.learning_quizzes,public.learning_quiz_attempts,private.quiz_questions,private.quiz_snapshots,private.quiz_answers from public,anon,authenticated;
grant all on public.learning_quizzes,public.learning_quiz_attempts,private.quiz_questions,private.quiz_snapshots,private.quiz_answers to service_role;
create index quiz_course on public.learning_quizzes(teaching_class_id,created_at desc,id);
create index quiz_school on public.learning_quizzes(school_id);create index quiz_author on public.learning_quizzes(created_by);
create index quiz_attempt_student on public.learning_quiz_attempts(student_id);
create trigger quiz_updated before update on public.learning_quizzes for each row execute function private.touch_updated_at();
-- Internal finalizer: called only after dispatcher authorization and while attempt row is locked.
create function private.quiz_finish(v_id uuid,v_expired boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_score numeric;
begin
 select coalesce(sum(case when a.choice=(q->>'correct')::int then (q->>'points')::numeric else 0 end),0) into v_score
 from private.quiz_snapshots s cross join lateral jsonb_array_elements(s.questions) with ordinality x(q,n)
 left join private.quiz_answers a on a.attempt_id=s.attempt_id and a.position=x.n where s.attempt_id=v_id;
 update public.learning_quiz_attempts set score=v_score,status=case when v_expired then 'expired' else 'submitted' end,finished_at=case when v_expired then deadline else clock_timestamp() end where id=v_id and status='working';
end;$$;
revoke all on function private.quiz_finish(uuid,boolean) from public,anon,authenticated;grant execute on function private.quiz_finish(uuid,boolean) to service_role;
commit;
