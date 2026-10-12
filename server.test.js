import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const dir=mkdtempSync(tmpdir()+'/note-test-');process.env.DATA_DIR=dir;
const {server}=await import('./server.js');
test('HTTP account isolation, persistence, conflict detection and logout',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
 assert.equal((await call('notes')).status,401);
 const a=await call('register','POST',{email:'a@example.com',password:'safe-password-a'});assert.equal(a.status,200);
 const b=await call('register','POST',{email:'b@example.com',password:'safe-password-b'});assert.equal(b.status,200);
 assert.equal((await call('login','POST',{email:'a@example.com',password:'wrong-password'})).status,401);
 const login=await call('login','POST',{email:'a@example.com',password:'safe-password-a'});assert.equal(login.status,200);
 const n=await call('notes','PUT',{id:'one',title:'한국어 메모',body:'# 기록\n오늘의 생각',notebook:'일상',pinned:1,updated:0},a.cookie);assert.equal(n.status,200);
 const list=await call('notes','GET',null,login.cookie);assert.equal(list.data.length,1);assert.equal(list.data[0].body,'# 기록\n오늘의 생각');assert.equal((await call('notes','GET',null,b.cookie)).data.length,0);
 const update=await call('notes','PUT',{...n.data,body:'수정'},login.cookie);assert.equal(update.status,200);
 assert.equal((await call('notes','PUT',{...n.data,body:'오래된 수정'},a.cookie)).status,409);
 assert.equal((await call('notes/one','DELETE',null,b.cookie)).status,200);assert.equal((await call('notes','GET',null,a.cookie)).data.length,1);
 assert.equal((await call('notes/one','DELETE',null,a.cookie)).status,200);assert.equal((await call('notes','GET',null,a.cookie)).data.length,0);
 assert.equal((await call('logout','POST',{},a.cookie)).status,200);assert.equal((await call('me','GET',null,a.cookie)).status,401);
 const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/Note Garden/);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
