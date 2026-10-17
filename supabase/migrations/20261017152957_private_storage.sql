begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lms-private','lms-private',false,5000000,array[
 'image/jpeg','image/png','image/webp','application/pdf','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'audio/mpeg','audio/mp4','audio/ogg','audio/wav','video/mp4','video/webm'
]);
-- Tidak memberi policy storage.objects: semua akses user ditolak pada Tahap 1.
-- Tahap unggahan akan menerbitkan izin terbatas dan memvalidasi batas per jenis berkas.
commit;
