import {test} from "node:test";
import assert from "node:assert/strict";
import {SMTPServer} from "smtp-server";
import nodemailer from "nodemailer";
import {identityMessage} from "../src/lib/email/identity-template";
import {verificationMessage,smtpSchema} from "../src/lib/email/transport";
test("template verifikasi dan pengiriman ke SMTP lokal",async()=>{
 let received="";
 const server=new SMTPServer({authOptional:true,disabledCommands:["STARTTLS"],onData(stream,session,callback){stream.on('data',chunk=>{received+=chunk.toString();});stream.on('end',()=>callback());}});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.server.address();assert.ok(port && typeof port!=='string');
 const transport=nodemailer.createTransport({host:'127.0.0.1',port:port.port,secure:false,ignoreTLS:true});
 try{
  await transport.sendMail({from:'noreply@example.test',to:'wali@example.test',...verificationMessage('https://lms.example.test/verifikasi?token=local-test')});
  assert.match(received,/Verifikasi email LMS Nurul Falah/);
  assert.match(received,/local-test/);
  assert.match(received,/multipart\/alternative/);
  assert.match(received,/text\/plain/);
  assert.match(received,/text\/html/);
  received="";
  await transport.sendMail({from:'noreply@example.test',to:'wali@example.test',...identityMessage('https://lms.example.test/pulihkan#token=synthetic-reset','reset_password')});
  assert.match(received,/multipart\/alternative/);
  assert.match(received,/synthetic-reset/);
  assert.match(received,/Pemulihan password LMS Nurul Falah/);
  assert.throws(()=>verificationMessage('http://example.com/token'));
  assert.equal(smtpSchema.safeParse({}).success,false);
 }finally{transport.close();await new Promise<void>(resolve=>server.close(resolve));}
});

test("identity templates preserve token links, provide distinct instructions and reject unsafe URLs",()=>{
 for(const purpose of ["verify_email","reset_password"] as const){
  const url=`https://lms.example.test/${purpose==="verify_email"?"verifikasi":"pulihkan"}?source=a&other=b#token=synthetic-token`;
  const message=identityMessage(url,purpose);
  assert.ok(message.text.includes(url));assert.match(message.html,/lang="id"/);
  assert.match(message.text,/15 menit/);assert.match(message.text,/satu kali/);
  assert.equal((message.html.match(/href="/g)||[]).length,2);
  assert.ok(message.html.includes(url.replace(/&/g,"&amp;")));
  assert.doesNotMatch(message.html,/<(?:script|img|iframe|form)\b/i);
  assert.match(message.text,purpose==="verify_email"?/tetap|sedang login/:/login ulang/);
 }
 for(const url of ['javascript:alert(1)','http://example.com/reset','https://user:password@example.com/reset','ftp://localhost/reset'])assert.throws(()=>identityMessage(url,'reset_password'));
 assert.ok(identityMessage('http://localhost:3000/verifikasi#token=test','verify_email').html);
});
