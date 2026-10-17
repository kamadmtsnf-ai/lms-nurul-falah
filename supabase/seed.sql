-- Hanya untuk proyek development baru. Tidak membuat akun atau data siswa.
insert into public.schools(id,name,education_level,timezone)
values ('00000000-0000-4000-8000-000000000001','MTs Nurul Falah','MTs/SMP','Asia/Jakarta')
on conflict (id) do nothing;
