begin;
create function private.quiz_manage(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if cmd='edit' then return to_jsonb(v_q)||jsonb_build_object('questions',(select coalesce(jsonb_agg(to_jsonb(q)-'quiz_id'-'position' order by position),'[]') from private.quiz_questions q where quiz_id=v_target));end if;
 if not (v_c->>'writable')::boolean then raise exception 'Semester sudah diarsipkan.';end if;
 if v_target is not null and (v_d->>'expected_updated_at')::timestamptz is distinct from v_q.updated_at then raise exception 'Kuis berubah. Muat ulang.';end if;
 if cmd='release' then
  update public.learning_quizzes set grades_visible=(v_d->>'grades_visible')::boolean,explanations_visible=(v_d->>'explanations_visible')::boolean where id=v_target;
 elsif cmd='save' then
  if v_target is not null and exists(select 1 from public.learning_quiz_attempts where quiz_id=v_target) then raise exception 'Kuis sudah dimulai siswa. Soal dan waktu dikunci; gunakan kuis baru.';end if;
  if not exists(select 1 from public.semesters s where s.id=(v_c->>'semester')::uuid and ((v_d->>'opens_at')::timestamptz at time zone 'Asia/Jakarta')::date between s.starts_on and s.ends_on and ((v_d->>'closes_at')::timestamptz at time zone 'Asia/Jakarta')::date between s.starts_on and s.ends_on) then raise exception 'Jadwal kuis harus berada dalam semester kelas.';end if;
  if jsonb_typeof(v_d->'questions') is distinct from 'array' or jsonb_array_length(v_d->'questions') not between 1 and 100 then raise exception 'Isi 1 sampai 100 soal.';end if;
  if v_target is null then
   insert into public.learning_quizzes(school_id,teaching_class_id,title,instructions,status,opens_at,closes_at,duration_minutes,created_by) values((v_c->>'school')::uuid,v_course,v_d->>'title',coalesce(v_d->>'instructions',''),v_d->>'status',(v_d->>'opens_at')::timestamptz,(v_d->>'closes_at')::timestamptz,(v_d->>'duration_minutes')::int,auth.uid()) returning * into v_q;v_target:=v_q.id;
  else
   update public.learning_quizzes set title=v_d->>'title',instructions=coalesce(v_d->>'instructions',''),status=v_d->>'status',opens_at=(v_d->>'opens_at')::timestamptz,closes_at=(v_d->>'closes_at')::timestamptz,duration_minutes=(v_d->>'duration_minutes')::int where id=v_target;delete from private.quiz_questions where quiz_id=v_target;
  end if;
  for v_item in select * from jsonb_array_elements(v_d->'questions') loop
   v_i:=v_i+1;
   if jsonb_typeof(v_item->'options') is distinct from 'array' or jsonb_array_length(v_item->'options') not between 2 and 6 or (v_item->>'correct')::int not between 0 and jsonb_array_length(v_item->'options')-1 or v_item->>'correct' is null or exists(select 1 from jsonb_array_elements(v_item->'options') x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 1000) or (v_item->>'kind'='boolean' and v_item->'options'<>'["Benar","Salah"]'::jsonb) then raise exception 'Opsi atau kunci soal tidak valid.';end if;
   insert into private.quiz_questions values(v_target,v_i,v_item->>'kind',v_item->>'prompt',v_item->'options',(v_item->>'correct')::int,coalesce(v_item->>'explanation',''),(v_item->>'points')::numeric);
  end loop;
 else raise exception 'Tindakan tidak dikenal.';end if;
 insert into public.audit_logs(school_id,actor_id,action,entity,entity_id,details) values((v_c->>'school')::uuid,auth.uid(),'quiz.'||cmd,'learning_quizzes',v_target::text,jsonb_build_object('question_count',v_i,'release',case when cmd='release' then v_d-'expected_updated_at' else null end));
 return jsonb_build_object('id',v_target);
end;$$;
revoke all on function private.quiz_manage(text,jsonb) from public,anon,authenticated;grant execute on function private.quiz_manage(text,jsonb) to service_role;
commit;
