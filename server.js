import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
mkdirSync(process.env.DATA_DIR || root+'data',{recursive:true});
const db=new DatabaseSync((process.env.DATA_DIR || root+'data')+'/notes.sqlite');
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,password TEXT); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS notes(id TEXT,user TEXT,title TEXT,body TEXT,notebook TEXT,pinned INTEGER,updated INTEGER,PRIMARY KEY(id,user));`);
const files={'/':['public/index.html','text/html; charset=utf-8'],'/app.js':['public/app.js','text/javascript'],'/cloud.js':['public/cloud.js','text/javascript'],'/config.js':['public/config.js','text/javascript'],'/style.css':['public/style.css','text/css'],'/fflate.js':['node_modules/fflate/esm/browser.js','text/javascript']};
export const server=http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try {
 if(!req.url.startsWith('/api/')){const f=files[req.url.split('?')[0]];if(!f)return send(404,{error:'Not found'});res.writeHead(200,{'Content-Type':f[1],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});return res.end(readFileSync(root+f[0]));}
 if(req.method!=='GET' && req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`)return send(403,{error:'요청 출처가 올바르지 않습니다.'});
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2*1024*1024)return send(413,{error:'메모가 너무 큽니다.'});}const body=raw?JSON.parse(raw):{};
 if(['/api/register','/api/login'].includes(req.url)){
 const {email,password}=body;if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<10||password.length>256)return send(400,{error:'이메일과 10자 이상의 비밀번호를 입력하세요.'});
 const user=email.trim().toLowerCase();let row=db.prepare('SELECT password FROM users WHERE id=?').get(user);
 if(req.method!=='POST')return send(405,{error:'Method not allowed'});
 if(req.url==='/api/register'){if(row)return send(409,{error:'이미 가입된 이메일입니다.'});const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO users VALUES(?,?)').run(user,salt+':'+scryptSync(password,salt,64).toString('hex'));}
 else{if(!row)return send(401,{error:'로그인 정보를 확인하세요.'});const [salt,hash]=row.password.split(':');if(!timingSafeEqual(Buffer.from(hash,'hex'),scryptSync(password,salt,64)))return send(401,{error:'로그인 정보를 확인하세요.'});}
 const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,user,Date.now()+7*86400000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);return send(200,{email:user});
 }
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];const session=db.prepare('SELECT user FROM sessions WHERE token=? AND expires>?').get(token||'',Date.now());if(!session)return send(401,{error:'로그인이 필요합니다.'});
 if(req.url==='/api/me'&&req.method==='GET')return send(200,{email:session.user});
 if(req.url==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{});}
 if(req.url==='/api/notes'&&req.method==='GET')return send(200,db.prepare('SELECT * FROM notes WHERE user=? ORDER BY pinned DESC, updated DESC').all(session.user).map(({user,...n})=>n));
 if(req.url==='/api/notes'&&req.method==='PUT'){
 const n=body;if(typeof n.id!=='string'||n.id.length>100||!['title','body','notebook'].every(k=>typeof n[k]==='string')||n.title.length>500||n.notebook.length>200)return send(400,{error:'올바르지 않은 메모입니다.'});
 const existing=db.prepare('SELECT updated FROM notes WHERE id=? AND user=?').get(n.id,session.user);if(existing && n.updated!==existing.updated)return send(409,{error:'다른 기기에서 수정된 메모입니다. 백업을 내보내고 새로고침하세요.'});
 const updated=Math.max(Date.now(),(existing?.updated||0)+1);db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?) ON CONFLICT(id,user) DO UPDATE SET title=excluded.title,body=excluded.body,notebook=excluded.notebook,pinned=excluded.pinned,updated=excluded.updated').run(n.id,session.user,n.title,n.body,n.notebook,n.pinned?1:0,updated);return send(200,{...n,updated});}
 if(req.url.startsWith('/api/notes/')&&req.method==='DELETE'){db.prepare('DELETE FROM notes WHERE id=? AND user=?').run(decodeURIComponent(req.url.slice(11)),session.user);return send(200,{});}
 send(404,{error:'Not found'});
 }catch(e){send(500,{error:'요청 처리에 실패했습니다.'});console.error(e.message);}
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Note Garden listening on port '+(process.env.PORT||3000)));
