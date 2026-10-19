import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, school } from '../scripts/testing/fixture';
import { adminResetSchema, emailSchema, nextFor } from '../src/lib/auth/validation';

test('email validation normalizes whitespace and rejects invalid addresses; reset requires explicit confirmation', () => {
 assert.equal(emailSchema.parse('  Wali@Example.com  '), 'wali@example.com');
 assert.equal(emailSchema.safeParse('wali@').success, false);
 assert.equal(adminResetSchema.safeParse({school,target:randomUUID()}).success,false);
});
test('administrator reset keeps activation gate, preserves identity and prevents unauthorized or overlapping reset', async () => {
 const f=await fixture(1); const [admin,teacher,student]=f.actors;
 const call=async (cmd:string,p:Record<string,unknown>={})=>{await f.db.exec('set role service_role');try{return (await f.db.query<{v:any}>('select public.identity_command($1,$2::jsonb) v',[cmd,JSON.stringify({actor:admin.id,session:admin.session,school,target:student.id,...p})])).rows[0].v;}finally{await f.db.exec('reset role');}};
 try {
  await assert.rejects(()=>call('admin_reset_begin',{actor:teacher.id,session:teacher.session}));
  await assert.rejects(()=>call('admin_reset_begin',{target:admin.id}));
  await assert.rejects(()=>call('admin_reset_begin',{school:randomUUID()}));
  await f.db.query("insert into auth.mfa_factors values($1,$2,'verified','totp')",[randomUUID(),admin.id]);
  await assert.rejects(()=>call('admin_reset_begin'));
  await f.db.query("update auth.sessions set aal='aal2' where id=$1",[admin.session]);
  const old= (await f.db.query<{email_verified_at:Date;status:string;contact_email:string}>('select email_verified_at,status,contact_email from profiles where id=$1',[student.id])).rows[0];
  await f.db.query("update profiles set status='disabled' where id=$1",[student.id]);
  const otherSchool=randomUUID();await f.db.query("insert into schools(id,name) values($1,'Other school')",[otherSchool]);
  await f.db.query('insert into school_memberships(school_id,user_id) values($1,$2)',[otherSchool,student.id]);
  await assert.rejects(()=>call('admin_reset_begin'));
  await f.db.query('delete from school_memberships where school_id=$1',[otherSchool]);
  const ticket=await call('admin_reset_begin');
  await assert.rejects(()=>call('admin_reset_begin'));
  await assert.rejects(()=>call('admin_reset_finish',{nonce:randomUUID()}));
  await call('admin_reset_finish',{nonce:ticket.nonce});
  await assert.rejects(()=>call('admin_reset_finish',{nonce:ticket.nonce}));
  const row=(await f.db.query<any>('select must_change_password,email_verified_at,status,contact_email,credentials_changed_at from profiles where id=$1',[student.id])).rows[0];
  assert.equal(row.must_change_password,true);assert.equal(row.status,'disabled');assert.equal(String(row.email_verified_at),String(old.email_verified_at));assert.equal(row.contact_email,old.contact_email);
  assert.equal(nextFor(row),'/ganti-password');
  await f.db.query("update profiles set status='active' where id=$1",[student.id]);
  assert.equal((await f.as(2,tx=>tx.query('select * from profiles'))).rows.length,0);
  assert.equal((await f.db.query("select * from private.password_locks where user_id=$1",[student.id])).rows.length,0);
  const logs=(await f.db.query<any>("select action,details from audit_logs where entity_id=$1 and action like 'admin_reset_%'",[student.id])).rows;
  assert.equal(logs.length,2);assert.ok(!JSON.stringify(logs).includes('12345678'));
  for(const role of ['anon','authenticated']){await f.db.exec(`set role ${role}`);try{await assert.rejects(()=>f.db.query("select public.identity_command('admin_reset_begin','{}')"),/permission denied/);}finally{await f.db.exec('reset role');}}
 }finally{await f.db.close();}
});
