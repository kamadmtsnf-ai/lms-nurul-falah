import {z} from 'zod';
import {questionSchema} from '@/lib/quiz/validation';
const id=z.uuid();const rubric=z.array(z.object({label:z.string().trim().min(1).max(150),points:z.number().positive().max(10000)}).strict()).max(20);
export const actions:Record<string,z.ZodType>={
 'features':z.object({}).strict(),'portal':z.object({}).strict(),'inbox':z.object({}).strict(),'message-read':z.object({}).strict(),'weighted-report':z.object({}).strict(),'discussion-list':z.object({}).strict(),'complete':z.object({}).strict(),
 'material-rule':z.object({enabled:z.boolean(),prerequisite_id:id.nullable()}).strict(),
 'material-share':z.object({destination_course:id}).strict(),
 'discussion-post':z.object({body:z.string().trim().min(1).max(3000)}).strict(),'discussion-hide':z.object({hidden:z.boolean()}).strict(),
 'weights':z.object({assignment_weight:z.number().min(0).max(100),quiz_weight:z.number().min(0).max(100),visible:z.boolean()}).strict().refine(x=>x.assignment_weight+x.quiz_weight===100,{message:'Jumlah bobot harus 100%.'}),
 'assignment-rule':z.object({revision_limit:z.number().int().min(1).max(100),late_minutes:z.number().int().min(0).max(43200),group_mode:z.boolean(),rubric}).strict(),
 'group-save':z.object({assignment_id:id,name:z.string().trim().min(1).max(100),members:z.array(id).min(1).max(30)}).strict(),
 'group-submit':z.object({request_id:id,revision:z.number().int().min(0),body:z.string().max(30000),links:z.array(z.url().refine(x=>x.startsWith('https://'))).max(10),asset_ids:z.array(id).max(5)}).strict(),
 'bank-list':z.object({}).strict(),'bank-save':z.object({questions:z.array(questionSchema).min(1).max(100)}).strict(),'bank-delete':z.object({}).strict(),
 'bank-import':z.object({file:z.string().max(2800000)}).strict(),
 'message-create':z.object({subject:z.string().trim().min(2).max(150),body:z.string().trim().min(1).max(3000),email:z.boolean()}).strict(),
 'message-status':z.object({}).strict(),'message-send':z.object({}).strict(),
 'retention-list':z.object({}).strict(),
 'retention-schedule':z.object({student_id:id,graduation_year_id:id}).strict(),
 'retention-prepare':z.object({student_id:id,export_reference:z.string().trim().min(5).max(500),confirmation:z.literal('SIAPKAN PENGHAPUSAN')}).strict(),
 'retention-auth':z.object({student_id:id,confirmation:z.literal('HAPUS AKUN ALUMNI')}).strict(),
 'retention-purge':z.object({student_id:id,confirmation:z.literal('HAPUS DATA ALUMNI')}).strict(),
};
export const envelope=z.object({course:id.optional(),school:id.optional(),target:id.optional(),offset:z.number().int().min(0).max(100000).optional(),data:z.unknown().optional()}).strict();
