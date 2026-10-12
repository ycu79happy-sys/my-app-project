export function createCloudApi({supabaseUrl,supabaseKey}, {fetcher=fetch,storage=localStorage,now=Date.now}={}) {
 const base=supabaseUrl.replace(/\/$/,'');const sessionKey='note-garden-session:'+base;
 let session;try{session=JSON.parse(storage.getItem(sessionKey)||'null');}catch{session=null;}
 function error(message,status=400){return Object.assign(new Error(message),{status});}
 function save(value){session=value;if(value)storage.setItem(sessionKey,JSON.stringify(value));else storage.removeItem(sessionKey);}
 async function request(path,method='GET',body,token){
  const response=await fetcher(base+path,{method,headers:{apikey:supabaseKey,Authorization:'Bearer '+(token||supabaseKey),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw error('서버 응답을 읽을 수 없습니다.',response.status);}
  if(!response.ok)throw error(data?.msg||data?.error_description||data?.message||'요청에 실패했습니다.',response.status);
  return data;
 }
 let refreshing;
 async function token(){
  if(!session?.access_token)throw error('로그인이 필요합니다.',401);
  if(session.expires_at*1000<now()+60000){
   if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:session.refresh_token}).then(save).catch(e=>{if(e.status===400||e.status===401)save(null);throw e;}).finally(()=>refreshing=null);
   await refreshing;
  }return session.access_token;
 }
 const normalize=n=>({id:n.id,title:n.title,body:n.body,notebook:n.notebook,pinned:n.pinned?1:0,updated:Number(n.updated)});
 return async(path,method='GET',body)=>{
  if(path==='register'||path==='login'){
   if(typeof body.email!=='string'||typeof body.password!=='string'||body.password.length<10)throw error('이메일과 10자 이상의 비밀번호를 입력하세요.');
   const result=await request(path==='register'?'/auth/v1/signup':'/auth/v1/token?grant_type=password','POST',{email:body.email.trim(),password:body.password});
   if(!result.access_token)return {verificationRequired:true};save(result);return {email:result.user.email};
  }
  const access=await token();
  if(path==='me'){const user=await request('/auth/v1/user','GET',undefined,access);return {email:user.email};}
  if(path==='logout'){await request('/auth/v1/logout','POST',{},access);save(null);return {};}
  if(path==='notes'&&method==='GET'){
   // PostgREST responses are paged: do not silently drop notes past the row limit.
   const all=[];let offset=0;
   while(true){const page=await request('/rest/v1/notes?select=id,title,body,notebook,pinned,updated&order=id.asc&limit=500&offset='+offset,'GET',undefined,access);all.push(...page.map(normalize));if(page.length<500)break;offset+=page.length;}
   return all.sort((a,b)=>b.pinned-a.pinned||b.updated-a.updated);
  }
  if(path==='notes'&&method==='PUT'){
   const fields={title:body.title,body:body.body,notebook:body.notebook,pinned:!!body.pinned};
   if(!body.updated){const result=await request('/rest/v1/notes','POST',{id:body.id,...fields},access);return normalize(result[0]);}
   const result=await request('/rest/v1/notes?id=eq.'+encodeURIComponent(body.id)+'&updated=eq.'+body.updated,'PATCH',fields,access);
   if(!result.length)throw error('다른 기기에서 수정되거나 삭제된 메모입니다. 백업을 내보내고 새로고침하세요.',409);
   return normalize(result[0]);
  }
  if(path.startsWith('notes/')&&method==='DELETE'){await request('/rest/v1/notes?id=eq.'+encodeURIComponent(path.slice(6)),'DELETE',undefined,access);return {};}
  throw error('지원하지 않는 요청입니다.',404);
 };
}
