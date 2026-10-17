begin;
-- Keep private class discussions within the reader's student scope.
do $$
declare definition text;needle text:='where d.course_id=course and d.material_id=target and (not d.hidden or (c->>''manager'')::boolean)';replacement text:='where d.course_id=course and d.material_id=target and ((c->>''reviewer'')::boolean or (c->>''student'')::boolean or d.author_id=actor or (c->''children'')@>to_jsonb(array[d.author_id]) or d.author_id=(select teacher_id from public.teaching_classes where id=course)) and (not d.hidden or (c->>''manager'')::boolean)';
begin
 definition:=pg_get_functiondef('private.advanced_command(text,jsonb)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Expected discussion predicate missing';end if;
 definition:=replace(definition,needle,replacement);
 -- Serialize prerequisite graph changes before taking a material row lock.
 definition:=replace(definition,'if cmd=''material-rule'' then','if cmd=''material-rule'' then perform pg_advisory_xact_lock(hashtextextended(course::text,8));');
 execute definition;
end;$$;
commit;
