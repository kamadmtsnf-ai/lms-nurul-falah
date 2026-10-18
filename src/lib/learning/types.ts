import {postJson} from '@/lib/http/client';
export type Meeting={id:string;title:string;starts_at:string;updated_at:string};
export type Material={id:string;meeting_id:string;title:string;body:string;links:string[];status:string;publish_at:string|null;updated_at:string};
export type Assignment={id:string;title:string;instructions:string;formats:string[];due_at:string;accept_late:boolean;max_score:number;status:string;publish_at:string|null;grades_visible:boolean;updated_at:string};
export type Student={id:string;full_name:string};
export type Attendance={student_id:string;meeting_id?:string;status:string;revision:number;reason:string};
export type Submission={id:string;assignment_id:string;student_id:string;revision:number;version_id:string;version:number;body:string;links:string[];asset_ids:string[];submitted_at:string;is_late:boolean};
export type Grade={version_id:string;assignment_id:string;student_id:string;score:number;feedback:string;updated_at:string;max_score:number;grades_visible:boolean};
export type Asset={id:string;target_id:string;target_type:string;name:string;bytes:number;owner_id:string;status:string};
export type CourseState={offset:number;has_more:boolean;context:{actor:string;school:string;classroom:string;manager:boolean;reviewer:boolean;admin:boolean;teacher:boolean;student:boolean;writable:boolean;student_writable:boolean;semester_status:string;children:string[]};course:{id:string;subject:string;classroom:string;teacher:string};meetings:Meeting[];materials:Material[];assignments:Assignment[];roster:Student[];attendance:Attendance[];meeting_roster:{meeting_id:string;student_id:string}[];daily:{student_id:string;status:string;count:number}[];submissions:Submission[];grades:Grade[];assets:Asset[]};
export async function learningRequest(action:string,body:Record<string,unknown>){return postJson<any>(`/api/pembelajaran/${action}`,body);}
export function localInput(iso?:string|null){if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export function dateLabel(iso:string){return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(iso))+' WIB';}
