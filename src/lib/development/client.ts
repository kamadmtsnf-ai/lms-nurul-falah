import {postJson} from '@/lib/http/client';
export async function devRequest<T=unknown>(action:string,body:Record<string,unknown>={}):Promise<T>{const d=await postJson<{result:T}>(`/api/pengembangan/${action}`,body);return d.result;}
export type SchoolList={central:boolean;schools:{id:string;name:string}[]};
export type DevelopmentState={admin:boolean;features:{offline_enabled:boolean;team_enabled:boolean;channels_enabled:boolean;acceptance_reference:string;revision:number};courses:{id:string;classroom:string;subject:string}[];users:{id:string;full_name:string}[];team:{course_id:string;user_id:string;active:boolean}[];contacts:{user_id:string;channel:string;destination:string;verified:boolean;active:boolean}[]};
