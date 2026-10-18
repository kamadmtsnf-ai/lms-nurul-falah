/** Minimal native Auth MFA schema for local PGlite tests, never deployed. */
export async function prepareAuthSecurityFixture(db:{exec:(sql:string)=>Promise<unknown>}){
 await db.exec("create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text not null,factor_type text not null);alter table auth.sessions add column aal text default 'aal1';");
}
