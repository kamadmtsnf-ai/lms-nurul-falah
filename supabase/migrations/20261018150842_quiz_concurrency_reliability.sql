begin;
create or replace function private.quiz_attempt(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_course uuid:=(p->>'course')::uuid;v_target uuid:=(p->>'target')::uuid;v_c jsonb;v_q public.learning_quizzes;v_a public.learning_quiz_attempts;v_s private.quiz_snapshots;v_item jsonb;v_questions jsonb;v_result jsonb;v_own boolean;v_key boolean;v_request uuid:=(p->>'request_id')::uuid;v_now timestamptz;v_number int:=1;v_marks jsonb;
begin
 if not private.account_ready() then raise exception 'Selesaikan aktivasi akun.' using errcode='42501';end if;
 v_c:=private.learning_context(v_course);if v_c is null then raise exception 'Kelas tidak dapat diakses.' using errcode='42501';end if;
 -- Stable quiz metadata may be shared across students; each attempt still has its own exclusive lock.
 if cmd='start' then select * into v_q from public.learning_quizzes where id=v_target and teaching_class_id=v_course for share;
 perform pg_advisory_xact_lock(hashtextextended(v_target::text||auth.uid()::text,2402));
 else select q.* into v_q from public.learning_quizzes q join public.learning_quiz_attempts a on a.quiz_id=q.id where a.id=v_target and q.teaching_class_id=v_course for share of q;end if;
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
 if cmd in ('answers','attempt') and coalesce((p->>'compact')::boolean,false) and v_a.status='working' then return jsonb_build_object('id',v_a.id,'status',v_a.status,'revision',v_a.revision,'server_now',clock_timestamp(),'deadline',v_a.deadline,'can_answer',v_own and (v_c->>'student_writable')::boolean,'compact',true);end if;
 v_key:=v_a.status<>'working' and ((v_c->>'manager')::boolean or (v_own and v_q.explanations_visible and clock_timestamp()>=v_q.closes_at));
 select jsonb_agg(case when v_key then x else x-'correct'-'explanation'-'answer_key'-'key' end order by n) into v_questions from jsonb_array_elements(v_s.questions) with ordinality e(x,n);
 v_result:=jsonb_build_object('id',v_a.id,'quiz_id',v_a.quiz_id,'student_id',v_a.student_id,'title',v_q.title,'instructions',v_q.instructions,'deadline',v_a.deadline,'server_now',clock_timestamp(),'started_at',v_a.started_at,'finished_at',v_a.finished_at,'status',v_a.status,'revision',v_a.revision,'max_score',v_a.max_score,'score',case when v_a.status<>'working' and (v_q.grades_visible or (v_c->>'manager')::boolean) then v_a.score else null end,'questions',v_questions,'answers',(select coalesce(jsonb_agg(jsonb_build_object('position',a.position,'choice',coalesce(a.value,to_jsonb(a.choice))) order by a.position),'[]') from private.quiz_answers a where a.attempt_id=v_a.id),'can_answer',v_own and (v_c->>'student_writable')::boolean,'review_visible',v_key,'attempt_no',v_a.attempt_no,'grading_pending',v_a.grading_pending,'monitor_tabs',v_q.monitor_tabs,'tab_events',case when (v_c->>'manager')::boolean then (select count(*) from private.quiz_tab_events where attempt_id=v_a.id and kind='hidden') else null end,'essay_marks',case when (v_c->>'manager')::boolean or (v_q.grades_visible and v_a.status<>'working') then (select coalesce(jsonb_agg(to_jsonb(m)-'graded_by'-'attempt_id'),'[]') from private.quiz_essay_marks m where m.attempt_id=v_a.id) else '[]'::jsonb end);
 return v_result;
end;$$;
commit;
