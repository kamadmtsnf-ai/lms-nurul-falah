import {z} from 'zod';
import {rolesSchema,usernameSchema,emailSchema} from '../auth/validation';
export const importKinds=['users','teachers','students','classrooms','subjects','teaching','guardians'] as const;
export type ImportKind=typeof importKinds[number];
export const importConfigs:Record<ImportKind,{label:string;columns:string[];instructions:string;example:string[]}>={
 users:{label:'Pengguna / akun',columns:['username','name','roles','email'],instructions:'Maksimal 25 akun per berkas. roles: admin, principal, teacher, homeroom_teacher, duty_teacher, student, guardian. Pisahkan beberapa peran dengan koma. Email opsional; password awal ditentukan aplikasi. Buat akun sebelum mengimpor identitas/penugasan.',example:['siswa.001','Nama Siswa','student','wali@example.com']},
 teachers:{label:'Identitas guru',columns:['username','staff_code'],instructions:'Akun harus sudah dibuat dengan peran teacher. Kode guru unik dan dibaca sebagai teks.',example:['guru.001','G001']},
 students:{label:'Siswa dan anggota kelas',columns:['username','student_number','year','semester','classroom'],instructions:'Akun student, tahun ajaran, semester dan rombel harus sudah tersedia. Siswa yang sudah memiliki nomor induk di sekolah tidak diimpor ulang; perubahan melalui form. semester: 1 atau 2. year dan classroom harus sama persis dengan master.',example:['siswa.001','0001','2026/2027','1','7A']},
 classrooms:{label:'Kelas / rombel',columns:['year','semester','grade','name'],instructions:'Tahun, semester dan tingkat harus sudah tersedia. semester: 1 atau 2. grade: nomor tingkat (mis. 7).',example:['2026/2027','1','7','7A']},
 subjects:{label:'Mata pelajaran',columns:['code','name'],instructions:'Kode mapel unik. Data baru disimpan aktif; tidak menimpa kode yang sudah ada.',example:['IPS','Ilmu Pengetahuan Sosial']},
 teaching:{label:'Guru pengampu',columns:['username','year','semester','classroom','subject','curriculum','version'],instructions:'Akun teacher, kelas, kode mapel, nama kurikulum dan versinya harus tersedia. Satu guru per mapel di setiap rombel.',example:['guru.001','2026/2027','1','7A','IPS','Kurikulum Merdeka','2026']},
 guardians:{label:'Tautan wali–siswa',columns:['guardian','student','relationship'],instructions:'Gunakan username akun dengan peran guardian dan student. Pasangan wali–siswa tidak boleh ganda.',example:['wali.001','siswa.001','Ibu']},
};
const str=(max=100)=>z.string().trim().min(1,'Wajib diisi.').max(max);
const semester=z.enum(['1','2']);
const period={year:str(),semester,classroom:str(50)};
const schemas:Record<ImportKind,z.ZodType>={
 users:z.object({username:usernameSchema,name:str(),roles:z.string().transform(v=>v.split(',').map(s=>s.trim()).filter(Boolean)).pipe(rolesSchema),email:z.union([emailSchema,z.literal('')])}).strict(),
 teachers:z.object({username:usernameSchema,staff_code:str(40)}).strict(),
 students:z.object({username:usernameSchema,student_number:str(40),...period}).strict(),
 classrooms:z.object({year:str(),semester,grade:z.string().regex(/^(?:[1-9]|1[0-2])$/,'Nomor tingkat harus 1–12.'),name:str(50)}).strict(),
 subjects:z.object({code:str(30),name:str()}).strict(),
 teaching:z.object({username:usernameSchema,...period,subject:str(30),curriculum:str(),version:str(40)}).strict(),
 guardians:z.object({guardian:usernameSchema,student:usernameSchema,relationship:str(50)}).strict(),
};
export function parseImportRow(kind:ImportKind,row:Record<string,string>){return schemas[kind].parse(row) as Record<string,unknown>;}
