import { identityMessage } from '../src/lib/email/identity-template.ts';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
 await mkdir('/tmp/lms-identity-email',{recursive:true});
 for(const purpose of ['verify_email','reset_password'])for(const width of [320,390,600,900]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  const url=`https://lms.example.test/${purpose==='verify_email'?'verifikasi':'pulihkan'}#token=${'a'.repeat(43)}`;
  const message=identityMessage(url,purpose);
  await page.setContent(message.html);
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width,`${purpose} overflow at ${width}`);
  const links=page.getByRole('link');assert.equal(await links.count(),2);
  for(const link of await links.all())assert.equal(await link.getAttribute('href'),url);
  await page.getByRole('heading',{level:1}).waitFor();
  assert.ok((await links.first().boundingBox()).height>=44);
  await page.screenshot({path:`/tmp/lms-identity-email/${purpose}-${width}.png`,fullPage:true});
  results.push({purpose,width,status:'passed'});await page.close();
 }
 const report={checks:results.length,results,scope:'HTML rendering in Chromium; multipart SMTP tested separately. Does not replace every native email-client rendering test.'};
 await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/identity-email-ui.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
