import {z} from 'zod';
export type Field={key:string;label:string;type?:'text'|'date'|'number'|'select';source?:string;choices?:readonly string[];optional?:boolean;role?:string;max?:number};
export type Entity={key:string;label:string;singular:string;description:string;fields:Field[]};
const field=(key:string,label:string,source?:string,role?:string):Field=>({key,label,type:source?'select':'text',source,role});
const status:Field={key:'status',label:'Status',type:'select',choices:['draft','active','archived']};
const enabled:Field={key:'active',label:'Status penugasan / tautan',type:'select',choices:['true','false']};
const dates:Field[]=[{key:'starts_on',label:'Tanggal mulai',type:'date'},{key:'ends_on',label:'Tanggal selesai',type:'date'}];
export const entities:Entity[]=[
 {key:'academic_years',label:'Tahun ajaran',singular:'tahun ajaran',description:'Aktifkan satu tahun ajaran. Mengaktifkan tahun baru mengarsipkan tahun aktif beserta semesternya.',fields:[field('name','Nama tahun ajaran'),...dates,status]},
 {key:'semesters',label:'Semester',singular:'semester',description:'Tanggal semester harus berada dalam tahun ajaran dan tidak bertumpang tindih. Mengaktifkan semester baru mengarsipkan semester aktif.',fields:[field('academic_year_id','Tahun ajaran','academic_years'),{key:'number',label:'Semester',type:'select',choices:['1','2']},...dates,status]},
 {key:'curriculum_versions',label:'Kurikulum',singular:'versi kurikulum',description:'Simpan nama dan versi kurikulum. Versi yang sudah dipakai pengampu tidak dapat ditimpa.',fields:[field('name','Nama kurikulum'),field('version','Versi'),{key:'description',label:'Keterangan',optional:true,max:1000}]},
 {key:'grade_levels',label:'Tingkat',singular:'tingkat',description:'Untuk MTs/SMP gunakan tingkat 7, 8, dan 9. Jenjang lain dapat memakai nomor 1–12.',fields:[{key:'number',label:'Nomor tingkat',type:'number'},field('name','Nama tingkat')]},
 {key:'classrooms',label:'Kelas / rombel',singular:'rombel',description:'Buat rombel baru untuk setiap semester. Rombel lama tetap tersimpan sebagai arsip.',fields:[field('semester_id','Semester','semesters'),field('grade_level_id','Tingkat','grade_levels'),field('name','Nama rombel')]},
 {key:'subjects',label:'Mata pelajaran',singular:'mata pelajaran',description:'Kode unik per sekolah. Mapel nonaktif tidak dapat dipilih untuk penugasan baru.',fields:[field('code','Kode mapel'),field('name','Nama mata pelajaran'),{key:'active',label:'Status',type:'select',choices:['true','false']}]},
 {key:'staff_details',label:'Identitas guru',singular:'identitas guru',description:'Lengkapi kode guru setelah akun dengan peran Guru tersedia.',fields:[field('teacher_id','Guru','users','teacher'),field('staff_code','Kode guru')]},
 {key:'student_details',label:'Identitas siswa',singular:'identitas siswa',description:'Nomor induk disimpan sebagai teks agar angka nol di awal tetap ada.',fields:[field('student_id','Siswa','users','student'),field('student_number','Nomor induk siswa')]},
 {key:'teaching_classes',label:'Guru pengampu',singular:'penugasan pengampu',description:'Satu guru untuk satu mata pelajaran per rombel. Pilih kurikulum yang berlaku pada kelas ini.',fields:[field('classroom_id','Rombel','classrooms'),field('subject_id','Mata pelajaran','subjects'),field('curriculum_version_id','Kurikulum','curriculum_versions'),field('teacher_id','Guru','users','teacher'),enabled]},
 {key:'student_enrollments',label:'Anggota kelas',singular:'keanggotaan siswa',description:'Satu rombel aktif per siswa dalam satu semester. Untuk pindah kelas, nonaktifkan keanggotaan lama lalu tambahkan yang baru.',fields:[field('semester_id','Semester','semesters'),field('classroom_id','Rombel','classrooms'),field('student_id','Siswa','users','student'),{key:'status',label:'Status keanggotaan',type:'select',choices:['active','inactive']}]},
 {key:'homeroom_assignments',label:'Wali kelas',singular:'penugasan wali kelas',description:'Satu wali kelas per rombel. Pengguna harus memiliki peran Wali Kelas.',fields:[field('classroom_id','Rombel','classrooms'),field('teacher_id','Wali kelas','users','homeroom_teacher'),enabled]},
 {key:'duty_assignments',label:'Guru piket',singular:'penugasan piket',description:'Tentukan rentang tanggal penugasan. Pencatatan absensi harian tersedia pada Tahap 4.',fields:[field('teacher_id','Guru piket','users','duty_teacher'),...dates,enabled]},
 {key:'guardian_students',label:'Orang tua / wali',singular:'tautan wali–siswa',description:'Satu wali dapat ditautkan ke beberapa anak, dan seorang siswa dapat memiliki beberapa wali.',fields:[field('guardian_id','Orang tua / wali','users','guardian'),field('student_id','Siswa','users','student'),field('relationship','Hubungan (mis. Ibu, Ayah, Wali)'),enabled]},
];
const text=(max=100)=>z.string().trim().min(1,'Wajib diisi.').max(max,'Isian terlalu panjang.');
const date=z.iso.date('Tanggal tidak valid.');
const base={id:z.uuid().optional(),expected_updated_at:z.string().max(50).optional(),reason:z.string().trim().max(500).optional()};
const range={starts_on:date,ends_on:date};
const year={name:text(),...range,status:z.enum(['draft','active','archived'])};
const schemas:Record<string,z.ZodType>={
 academic_years:z.object({...base,...year}).strict(),
 semesters:z.object({...base,academic_year_id:z.uuid(),number:z.coerce.number().int().min(1).max(2),...range,status:year.status}).strict(),
 curriculum_versions:z.object({...base,name:text(),version:text(40),description:z.string().trim().max(1000).default('')}).strict(),
 grade_levels:z.object({...base,number:z.coerce.number().int().min(1).max(12),name:text(50)}).strict(),
 classrooms:z.object({...base,semester_id:z.uuid(),grade_level_id:z.uuid(),name:text(50)}).strict(),
 subjects:z.object({...base,code:text(30),name:text(),active:z.boolean()}).strict(),
 staff_details:z.object({...base,teacher_id:z.uuid(),staff_code:text(40)}).strict(),
 student_details:z.object({...base,student_id:z.uuid(),student_number:text(40)}).strict(),
 teaching_classes:z.object({...base,active:z.boolean().default(true),classroom_id:z.uuid(),subject_id:z.uuid(),curriculum_version_id:z.uuid(),teacher_id:z.uuid()}).strict(),
 student_enrollments:z.object({...base,classroom_id:z.uuid(),semester_id:z.uuid(),student_id:z.uuid(),status:z.enum(['active','inactive'])}).strict(),
 homeroom_assignments:z.object({...base,active:z.boolean().default(true),classroom_id:z.uuid(),teacher_id:z.uuid()}).strict(),
 duty_assignments:z.object({...base,active:z.boolean().default(true),teacher_id:z.uuid(),...range}).strict(),
 guardian_students:z.object({...base,active:z.boolean().default(true),guardian_id:z.uuid(),student_id:z.uuid(),relationship:text(50)}).strict(),
};
export function parseEntity(entity:string,input:unknown){
 const schema=schemas[entity];if(!schema)throw new Error('Jenis data tidak dikenal.');
 const parsed=schema.parse(input) as Record<string,unknown>;
 if(parsed.starts_on && parsed.ends_on && String(parsed.ends_on)<String(parsed.starts_on))throw new Error('Tanggal selesai harus sama atau setelah tanggal mulai.');
 return parsed;
}
export const schoolSchema=z.object({name:text(150),education_level:z.enum(['MI/SD','MTs/SMP','MA/SMA','Beberapa jenjang']),logo_url:z.union([z.literal(''),z.url().max(1000).refine(v=>new URL(v).protocol==='https:','Logo harus menggunakan tautan HTTPS.')]),expected_updated_at:z.string().max(50)}).strict();
export const statusLabels:Record<string,string>={draft:'Draf',active:'Aktif',archived:'Arsip',inactive:'Nonaktif',true:'Aktif',false:'Nonaktif'};
export type DataRow={id:string;updated_at?:string;[key:string]:unknown};
export type AcademicState={school:DataRow;users:DataRow[];[key:string]:DataRow[]|DataRow};
export function rowsOf(state:AcademicState,key:string):DataRow[]{const value=state[key];return Array.isArray(value)?value:[];}
export function rowLabel(state:AcademicState,key:string,row:DataRow):string{
 if(key==='users')return `${row.full_name} (${row.username_normalized})`;
 if(key==='semesters'){const y=rowsOf(state,'academic_years').find(y=>y.id===row.academic_year_id);return `${y?.name??'Tahun'} · ${row.number===1?'Ganjil':'Genap'} · ${statusLabels[String(row.status)]??row.status}`;}
 if(key==='classrooms'){const s=rowsOf(state,'semesters').find(s=>s.id===row.semester_id);return `${row.name} · ${s?rowLabel(state,'semesters',s):''}`;}
 if(key==='curriculum_versions')return `${row.name} · ${row.version}`;
 return String(row.name??row.code??row.id);
}
