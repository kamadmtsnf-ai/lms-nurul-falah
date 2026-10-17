import {test} from "node:test";
import assert from "node:assert/strict";
import {SMTPServer} from "smtp-server";
import nodemailer from "nodemailer";
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
  assert.throws(()=>verificationMessage('http://example.com/token'));
  assert.equal(smtpSchema.safeParse({}).success,false);
 }finally{transport.close();await new Promise<void>(resolve=>server.close(resolve));}
});
