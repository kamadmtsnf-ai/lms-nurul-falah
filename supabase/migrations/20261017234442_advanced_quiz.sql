begin;
alter table private.quiz_questions drop constraint quiz_questions_kind_check;
alter table private.quiz_questions add constraint quiz_questions_kind_check check(kind in ('choice','boolean','agree','complex','matching','short','essay'));
alter table private.quiz_questions add column answer_key jsonb,add column matches jsonb;
alter table private.quiz_answers add column value jsonb;
alter table public.learning_quizzes add column max_attempts int not null default 1 check(max_attempts between 1 and 5),add column shuffle_questions boolean not null default false,add column shuffle_options boolean not null default false,add column monitor_tabs boolean not null default false;
alter table public.learning_quiz_attempts drop constraint learning_quiz_attempts_quiz_id_student_id_key;
alter table public.learning_quiz_attempts add column attempt_no int not null default 1,add column grading_pending boolean not null default false,add constraint quiz_attempt_number unique(quiz_id,student_id,attempt_no);
create table private.quiz_essay_marks(attempt_id uuid not null references public.learning_quiz_attempts(id) on delete cascade,position int not null,score numeric not null check(score>=0),feedback text not null default '' check(length(feedback)<=4000),graded_by uuid not null references public.profiles(id),revision int not null default 1,primary key(attempt_id,position));
create table private.quiz_tab_events(attempt_id uuid not null references public.learning_quiz_attempts(id) on delete cascade,event_id uuid not null,kind text not null check(kind in ('hidden','visible')),received_at timestamptz not null default clock_timestamp(),primary key(attempt_id,event_id));
alter table private.quiz_essay_marks enable row level security;alter table private.quiz_tab_events enable row level security;
revoke all on private.quiz_essay_marks,private.quiz_tab_events from public,anon,authenticated;grant all on private.quiz_essay_marks,private.quiz_tab_events to service_role;
create index quiz_essay_grader on private.quiz_essay_marks(graded_by);
create function private.valid_question(q jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text:=q->>'kind';n int; key jsonb:=coalesce(q->'key',q->'answer_key');
begin
 if k is null or k not in ('choice','boolean','agree','complex','matching','short','essay') or length(trim(coalesce(q->>'prompt',''))) not between 1 and 4000 or coalesce((q->>'points')::numeric,0)<=0 or (q->>'points')::numeric>100 or length(coalesce(q->>'explanation',''))>4000 then return false;end if;
 if jsonb_typeof(q->'options') is distinct from 'array' then return false;end if;n:=jsonb_array_length(q->'options');
 if n>10 or exists(select 1 from jsonb_array_elements(q->'options') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 1000) then return false;end if;
 if k in ('choice','boolean','agree','complex','matching') and n<2 then return false;end if;
 if k in ('choice','boolean','agree') and (coalesce((q->>'correct')::int,-1)<0 or (q->>'correct')::int>=n) then return false;end if;
 if k='boolean' and q->'options'<>'["Benar","Salah"]' then return false;end if;
 if k='agree' and q->'options'<>'["Setuju","Tidak Setuju"]' then return false;end if;
 if k in ('complex','matching','short') then
  if jsonb_typeof(key) is distinct from 'array' then return false;end if;
  if jsonb_array_length(key) not between 1 and 10 then return false;end if;
  if k='short' then return not exists(select 1 from jsonb_array_elements(key) x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 1000);end if;
  if exists(select 1 from jsonb_array_elements(key) x where jsonb_typeof(x)<>'number' or (x#>>'{}')::numeric<>trunc((x#>>'{}')::numeric) or (x#>>'{}')::int not between 0 and n-1) then return false;end if;
  if (select count(distinct x) from jsonb_array_elements(key) x)<>jsonb_array_length(key) then return false;end if;
  if k='matching' then
   if jsonb_typeof(q->'matches') is distinct from 'array' then return false;end if;
   if jsonb_array_length(q->'matches')<>n or jsonb_array_length(key)<>n or exists(select 1 from jsonb_array_elements(q->'matches') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 1000) then return false;end if;
  end if;
 end if;return true;
exception when others then return false;end;$$;
create function private.valid_answer(q jsonb,v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text:=q->>'kind';n int:=jsonb_array_length(q->'options');
begin
 if v is null then return false;end if;
 if k in ('short','essay') then return jsonb_typeof(v)='string' and length(v#>>'{}')<=case when k='short' then 1000 else 10000 end;end if;
 if k in ('complex','matching') then
  if jsonb_typeof(v)<>'array' then return false;end if;
  if jsonb_array_length(v)>n or (k='matching' and jsonb_array_length(v)<>n) then return false;end if;
  if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'number' or (x#>>'{}')::numeric<>trunc((x#>>'{}')::numeric) or (x#>>'{}')::int not between case when k='matching' then -1 else 0 end and n-1) then return false;end if;
  return k='matching' or (select count(distinct x) from jsonb_array_elements(v) x)=jsonb_array_length(v);
 end if;
 return jsonb_typeof(v)='number' and (v#>>'{}')::numeric=trunc((v#>>'{}')::numeric) and (v#>>'{}')::int between 0 and n-1;
exception when others then return false;end;$$;
create function private.question_score(q jsonb,v jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare k text:=q->>'kind';ok boolean:=false;key jsonb:=coalesce(q->'answer_key',q->'key');
begin
 if not private.valid_answer(q,v) then return 0;end if;
 if k='essay' then return 0;
 elsif k='short' then select exists(select 1 from jsonb_array_elements_text(key) x where lower(trim(x))=lower(trim(v#>>'{}'))) into ok;
 elsif k='complex' then ok:=key @> v and v @> key;
 elsif k='matching' then ok:=key=v;
 else ok:=(v#>>'{}')::int=(q->>'correct')::int;end if;
 return case when ok then (q->>'points')::numeric else 0 end;
end;$$;
create or replace function private.quiz_finish(v_id uuid,v_expired boolean) returns void language plpgsql security definer set search_path='' as $$
declare total numeric;pending boolean;
begin
 select coalesce(sum(case when q->>'kind'='essay' then coalesce(m.score,0) else private.question_score(q,coalesce(a.value,to_jsonb(a.choice))) end),0),coalesce(bool_or(q->>'kind'='essay' and m.attempt_id is null),false) into total,pending
 from private.quiz_snapshots s cross join lateral jsonb_array_elements(s.questions) with ordinality x(q,n)
 left join private.quiz_answers a on a.attempt_id=s.attempt_id and a.position=x.n
 left join private.quiz_essay_marks m on m.attempt_id=s.attempt_id and m.position=x.n where s.attempt_id=v_id;
 update public.learning_quiz_attempts set score=case when pending then null else total end,grading_pending=pending,status=case when status='working' then case when v_expired then 'expired' else 'submitted' end else status end,finished_at=coalesce(finished_at,case when v_expired then deadline else clock_timestamp() end) where id=v_id;
end;$$;
create function private.shuffle_question(q jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare result jsonb:=q;order_ids int[];opts jsonb;key jsonb;correct int;
begin
 if q->>'kind' not in ('choice','complex') then return q;end if;
 select array_agg(n order by random()) into order_ids from generate_series(0,jsonb_array_length(q->'options')-1) n;
 select jsonb_agg(q->'options'->n order by i) into opts from unnest(order_ids) with ordinality t(n,i);
 if q->>'kind'='choice' then correct:=array_position(order_ids,(q->>'correct')::int)-1;result:=result||jsonb_build_object('correct',correct);
 else select jsonb_agg(i-1 order by i) into key from unnest(order_ids) with ordinality t(n,i) where (q->'answer_key')@>to_jsonb(array[n]);result:=result||jsonb_build_object('answer_key',key);end if;
 return result||jsonb_build_object('options',opts);
end;$$;
create or replace function private.quiz_manage(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_course uuid:=(p->>'course')::uuid;v_target uuid:=(p->>'target')::uuid;v_c jsonb;v_q public.learning_quizzes;v_d jsonb:=p->'data';v_item jsonb;v_i int:=0;v_offset int:=greatest(0,least(coalesce((p->>'offset')::int,0),100000));v_result jsonb;
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi akun.' using errcode='42501';end if;
 v_c:=private.learning_context(v_course);if v_c is null then raise exception 'Kelas tidak dapat diakses.' using errcode='42501';end if;
 if cmd='list' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into v_result from (select * from public.learning_quizzes where teaching_class_id=v_course and ((v_c->>'manager')::boolean or status='published' or exists(select 1 from public.learning_quiz_attempts a where a.quiz_id=learning_quizzes.id and a.student_id=auth.uid())) order by created_at desc,id limit 20 offset v_offset) q;
  return jsonb_build_object('quizzes',v_result,'offset',v_offset,'has_more',exists(select 1 from public.learning_quizzes where teaching_class_id=v_course and ((v_c->>'manager')::boolean or status='published' or exists(select 1 from public.learning_quiz_attempts a where a.quiz_id=learning_quizzes.id and a.student_id=auth.uid())) offset v_offset+20),'context',v_c);
 end if;
 if not (v_c->>'manager')::boolean then raise exception 'Hanya pengampu atau admin.' using errcode='42501';end if;
 if v_target is not null then select * into v_q from public.learning_quizzes where id=v_target and teaching_class_id=v_course for update;if not found then raise exception 'Kuis tidak ditemukan.' using errcode='42501';end if;end if;
 if cmd='edit' then return to_jsonb(v_q)||jsonb_build_object('questions',(select coalesce(jsonb_agg((to_jsonb(q)-'quiz_id'-'position'-'answer_key')||jsonb_build_object('key',q.answer_key) order by position),'[]') from private.quiz_questions q where quiz_id=v_target));end if;
 if not (v_c->>'writable')::boolean then raise exception 'Semester sudah diarsipkan.';end if;
 if v_target is not null and (v_d->>'expected_updated_at')::timestamptz is distinct from v_q.updated_at then raise exception 'Kuis berubah. Muat ulang.';end if;
 if cmd='release' then
  update public.learning_quizzes set grades_visible=(v_d->>'grades_visible')::boolean,explanations_visible=(v_d->>'explanations_visible')::boolean where id=v_target;
 elsif cmd='save' then
  if v_target is not null and exists(select 1 from public.learning_quiz_attempts where quiz_id=v_target) then raise exception 'Kuis sudah dimulai siswa. Soal dan waktu dikunci; gunakan kuis baru.';end if;
  if not exists(select 1 from public.semesters s where s.id=(v_c->>'semester')::uuid and ((v_d->>'opens_at')::timestamptz at time zone 'Asia/Jakarta')::date between s.starts_on and s.ends_on and ((v_d->>'closes_at')::timestamptz at time zone 'Asia/Jakarta')::date between s.starts_on and s.ends_on) then raise exception 'Jadwal kuis harus berada dalam semester kelas.';end if;
  if jsonb_typeof(v_d->'questions') is distinct from 'array' or jsonb_array_length(v_d->'questions') not between 1 and 100 then raise exception 'Isi 1 sampai 100 soal.';end if;
  if v_target is null then
   insert into public.learning_quizzes(school_id,teaching_class_id,title,instructions,status,opens_at,closes_at,duration_minutes,created_by,max_attempts,shuffle_questions,shuffle_options,monitor_tabs) values((v_c->>'school')::uuid,v_course,v_d->>'title',coalesce(v_d->>'instructions',''),v_d->>'status',(v_d->>'opens_at')::timestamptz,(v_d->>'closes_at')::timestamptz,(v_d->>'duration_minutes')::int,auth.uid(),coalesce((v_d->>'max_attempts')::int,1),coalesce((v_d->>'shuffle_questions')::boolean,false),coalesce((v_d->>'shuffle_options')::boolean,false),coalesce((v_d->>'monitor_tabs')::boolean,false)) returning * into v_q;v_target:=v_q.id;
  else
   update public.learning_quizzes set title=v_d->>'title',instructions=coalesce(v_d->>'instructions',''),status=v_d->>'status',opens_at=(v_d->>'opens_at')::timestamptz,closes_at=(v_d->>'closes_at')::timestamptz,duration_minutes=(v_d->>'duration_minutes')::int,max_attempts=coalesce((v_d->>'max_attempts')::int,1),shuffle_questions=coalesce((v_d->>'shuffle_questions')::boolean,false),shuffle_options=coalesce((v_d->>'shuffle_options')::boolean,false),monitor_tabs=coalesce((v_d->>'monitor_tabs')::boolean,false) where id=v_target;delete from private.quiz_questions where quiz_id=v_target;
  end if;
  for v_item in select * from jsonb_array_elements(v_d->'questions') loop
   v_i:=v_i+1;
   if not private.valid_question(v_item) then raise exception 'Opsi atau kunci soal tidak valid.';end if;
   insert into private.quiz_questions(quiz_id,position,kind,prompt,options,correct,explanation,points,answer_key,matches) values(v_target,v_i,v_item->>'kind',v_item->>'prompt',v_item->'options',coalesce((v_item->>'correct')::int,0),coalesce(v_item->>'explanation',''),(v_item->>'points')::numeric,v_item->'key',v_item->'matches');
  end loop;
 else raise exception 'Tindakan tidak dikenal.';end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values((v_c->>'school')::uuid,auth.uid(),'quiz.'||cmd,'learning_quizzes',v_target::text,jsonb_build_object('question_count',v_i,'release',case when cmd='release' then v_d-'expected_updated_at' else null end));
 return jsonb_build_object('id',v_target);
end;$$;
revoke all on function private.quiz_manage(text,jsonb) from public,anon,authenticated;grant execute on function private.quiz_manage(text,jsonb) to service_role;
create or replace function private.quiz_attempt(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_course uuid:=(p->>'course')::uuid;v_target uuid:=(p->>'target')::uuid;v_c jsonb;v_q public.learning_quizzes;v_a public.learning_quiz_attempts;v_s private.quiz_snapshots;v_item jsonb;v_questions jsonb;v_result jsonb;v_own boolean;v_key boolean;v_request uuid:=(p->>'request_id')::uuid;v_now timestamptz;v_number int:=1;v_marks jsonb;
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi akun.' using errcode='42501';end if;
 v_c:=private.learning_context(v_course);if v_c is null then raise exception 'Kelas tidak dapat diakses.' using errcode='42501';end if;
 -- All commands take quiz then attempt lock in the same order. No shared course lock.
 if cmd='start' then select * into v_q from public.learning_quizzes where id=v_target and teaching_class_id=v_course for update;
 else select q.* into v_q from public.learning_quizzes q join public.learning_quiz_attempts a on a.quiz_id=q.id where a.id=v_target and q.teaching_class_id=v_course for update of q;end if;
 if v_q.id is null then raise exception 'Kuis tidak dapat diakses.' using errcode='42501';end if;
 if cmd='start' then
  if not (v_c->>'student_writable')::boolean then raise exception 'Hanya siswa aktif dapat memulai kuis.' using errcode='42501';end if;
  select * into v_a from public.learning_quiz_attempts where quiz_id=v_q.id and student_id=auth.uid() order by attempt_no desc limit 1 for update;
  if coalesce((p->>'new_attempt')::boolean,false) and v_a.id is not null then
   if v_a.status='working' then raise exception 'Selesaikan percobaan aktif dahulu.';end if;
   v_number:=v_a.attempt_no+1;if v_number>v_q.max_attempts then raise exception 'Kesempatan mengulang habis.';end if;v_a:=null;
  end if;
  if v_a.id is null then
   v_now:=clock_timestamp();if v_q.status<>'published' or v_now<v_q.opens_at or v_now>=v_q.closes_at then raise exception 'Kuis belum dibuka atau sudah ditutup.';end if;
   select jsonb_agg(case when v_q.shuffle_options then private.shuffle_question(to_jsonb(q)-'quiz_id') else to_jsonb(q)-'quiz_id' end order by case when v_q.shuffle_questions then random() else position::float end) into v_questions from private.quiz_questions q where quiz_id=v_q.id;
   if v_questions is null then raise exception 'Soal belum tersedia.';end if;
   insert into public.learning_quiz_attempts(quiz_id,student_id,started_at,deadline,max_score,attempt_no) values(v_q.id,auth.uid(),v_now,least(v_q.closes_at,v_now+make_interval(mins=>v_q.duration_minutes)),(select sum((x->>'points')::numeric) from jsonb_array_elements(v_questions) x),v_number) returning * into v_a;
   insert into private.quiz_snapshots(attempt_id,questions) values(v_a.id,v_questions);
  end if;
 else select * into v_a from public.learning_quiz_attempts where id=v_target for update;end if;
 v_own:=v_a.student_id=auth.uid();
 if not v_own and not (v_c->>'manager')::boolean then raise exception 'Jawaban siswa tidak dapat diakses.' using errcode='42501';end if;
 select * into v_s from private.quiz_snapshots where attempt_id=v_a.id;
 v_now:=clock_timestamp();
 if v_a.status='working' and v_now>=v_a.deadline then perform private.quiz_finish(v_a.id,true);select * into v_a from public.learning_quiz_attempts where id=v_a.id;end if;
 if cmd in ('answers','finish') then
  if not v_own then raise exception 'Hanya pemilik percobaan.' using errcode='42501';end if;
  if v_a.status='working' then
   if not (v_c->>'student_writable')::boolean then raise exception 'Semester atau keanggotaan sudah ditutup.';end if;
   if cmd='answers' then
    if v_request is null or jsonb_typeof(p->'answers') is distinct from 'array' or jsonb_array_length(p->'answers') not between 1 and 100 then raise exception 'Jawaban tidak valid.';end if;
    if v_request=v_s.last_request then
     if v_s.last_payload is distinct from p->'answers' then raise exception 'Identitas simpan dipakai ulang.';end if;
    else
     if (p->>'revision')::int is distinct from v_a.revision then raise exception 'Jawaban berubah di perangkat lain. Muat ulang percobaan.';end if;
     if (select count(distinct (x->>'position')::int) from jsonb_array_elements(p->'answers') x)<>jsonb_array_length(p->'answers') then raise exception 'Nomor soal ganda.';end if;
     for v_item in select * from jsonb_array_elements(p->'answers') loop
      if (v_item->>'position') is null or (v_item->>'position')::int not between 1 and jsonb_array_length(v_s.questions) or not private.valid_answer(v_s.questions->((v_item->>'position')::int-1),v_item->'choice') then raise exception 'Pilihan jawaban tidak valid.';end if;
      insert into private.quiz_answers(attempt_id,position,choice,value) values(v_a.id,(v_item->>'position')::int,case when jsonb_typeof(v_item->'choice')='number' then (v_item->>'choice')::int else 0 end,v_item->'choice') on conflict(attempt_id,position) do update set choice=excluded.choice,value=excluded.value,updated_at=clock_timestamp();
     end loop;
     update public.learning_quiz_attempts set revision=revision+1 where id=v_a.id;
     update private.quiz_snapshots set last_request=v_request,last_payload=p->'answers' where attempt_id=v_a.id;
    end if;
   else
    if (p->>'revision')::int is distinct from v_a.revision then raise exception 'Simpan semua jawaban sebelum menyelesaikan.';end if;
    perform private.quiz_finish(v_a.id,false);
   end if;
  end if;
 elsif cmd='tab-event' then
  if not v_own or not v_q.monitor_tabs or v_a.status<>'working' then raise exception 'Pencatatan tidak tersedia.' using errcode='42501';end if;
  if (select count(*) from private.quiz_tab_events where attempt_id=v_a.id)<500 then insert into private.quiz_tab_events(attempt_id,event_id,kind) values(v_a.id,(p->'data'->>'event_id')::uuid,p->'data'->>'kind') on conflict do nothing;end if;
 elsif cmd='essay-grade' then
  if not (v_c->>'manager')::boolean or not (v_c->>'writable')::boolean or v_a.status='working' then raise exception 'Penilaian tidak diizinkan.' using errcode='42501';end if;
  if not (v_c->>'teacher')::boolean and length(trim(coalesce(p->'data'->>'reason','')))<5 then raise exception 'Admin wajib memberi alasan.';end if;
  v_item:=v_s.questions->((p->'data'->>'position')::int-1);
  if v_item is null or v_item->>'kind'<>'essay' or coalesce((p->'data'->>'score')::numeric,-1) not between 0 and (v_item->>'points')::numeric then raise exception 'Skor esai tidak valid.';end if;
  if coalesce((select revision from private.quiz_essay_marks where attempt_id=v_a.id and position=(p->'data'->>'position')::int),0) is distinct from (p->'data'->>'expected_revision')::int then raise exception 'Nilai berubah. Muat ulang.';end if;
  insert into private.quiz_essay_marks(attempt_id,position,score,feedback,graded_by) values(v_a.id,(p->'data'->>'position')::int,(p->'data'->>'score')::numeric,coalesce(p->'data'->>'feedback',''),auth.uid()) on conflict(attempt_id,position) do update set score=excluded.score,feedback=excluded.feedback,graded_by=excluded.graded_by,revision=quiz_essay_marks.revision+1;
  perform private.quiz_finish(v_a.id,v_a.status='expired');
  insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values((v_c->>'school')::uuid,auth.uid(),'quiz.essay-grade','learning_quiz_attempts',v_a.id::text,jsonb_build_object('position',p->'data'->'position','reason',p->'data'->>'reason'));
 elsif cmd not in ('start','attempt') then raise exception 'Tindakan tidak dikenal.';end if;
 select * into v_a from public.learning_quiz_attempts where id=v_a.id;
 v_key:=v_a.status<>'working' and ((v_c->>'manager')::boolean or (v_own and v_q.explanations_visible and clock_timestamp()>=v_q.closes_at));
 select jsonb_agg(case when v_key then x else x-'correct'-'explanation'-'answer_key'-'key' end order by n) into v_questions from jsonb_array_elements(v_s.questions) with ordinality e(x,n);
 v_result:=jsonb_build_object('id',v_a.id,'quiz_id',v_a.quiz_id,'student_id',v_a.student_id,'title',v_q.title,'instructions',v_q.instructions,'deadline',v_a.deadline,'server_now',clock_timestamp(),'started_at',v_a.started_at,'finished_at',v_a.finished_at,'status',v_a.status,'revision',v_a.revision,'max_score',v_a.max_score,'score',case when v_a.status<>'working' and (v_q.grades_visible or (v_c->>'manager')::boolean) then v_a.score else null end,'questions',v_questions,'answers',(select coalesce(jsonb_agg(jsonb_build_object('position',a.position,'choice',coalesce(a.value,to_jsonb(a.choice))) order by a.position),'[]') from private.quiz_answers a where a.attempt_id=v_a.id),'can_answer',v_own and (v_c->>'student_writable')::boolean,'review_visible',v_key,'attempt_no',v_a.attempt_no,'grading_pending',v_a.grading_pending,'monitor_tabs',v_q.monitor_tabs,'tab_events',case when (v_c->>'manager')::boolean then (select count(*) from private.quiz_tab_events where attempt_id=v_a.id and kind='hidden') else null end,'essay_marks',case when (v_c->>'manager')::boolean or (v_q.grades_visible and v_a.status<>'working') then (select coalesce(jsonb_agg(to_jsonb(m)-'graded_by'-'attempt_id'),'[]') from private.quiz_essay_marks m where m.attempt_id=v_a.id) else '[]'::jsonb end);
 return v_result;
end;$$;
revoke all on function private.quiz_attempt(text,jsonb) from public,anon,authenticated;grant execute on function private.quiz_attempt(text,jsonb) to service_role;
create or replace function public.quiz_command(cmd text,p jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$ begin
if cmd in ('list','edit','save','release') then return private.quiz_manage(cmd,p);
elsif cmd in ('start','attempt','answers','finish','tab-event','essay-grade') then return private.quiz_attempt(cmd,p);
elsif cmd='report' then return private.learning_report(p);else raise exception 'Tindakan tidak dikenal.';end if;end;$$;
revoke all on function private.valid_question(jsonb),private.valid_answer(jsonb,jsonb),private.question_score(jsonb,jsonb),private.shuffle_question(jsonb) from public,anon,authenticated;
grant execute on function private.valid_question(jsonb),private.valid_answer(jsonb,jsonb),private.question_score(jsonb,jsonb),private.shuffle_question(jsonb) to service_role;
grant execute on function private.quiz_manage(text,jsonb),private.quiz_attempt(text,jsonb) to authenticated;
commit;
