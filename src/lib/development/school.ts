import 'server-only';import {cookies} from 'next/headers';
export async function selectedMembership<T extends {school_id:string}>(members:T[],role?:(m:T)=>boolean){const selected=(await cookies()).get('lms-school')?.value;const scoped=selected?members.find(m=>m.school_id===selected):undefined;if(scoped)return !role||role(scoped)?scoped:undefined;return role?members.find(role):members[0];}
