import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
test('static build works on repository subpaths and refuses secret keys',()=>{
 const out=mkdtempSync(tmpdir()+'/note-build-');
 try {
 const run=key=>spawnSync(process.execPath,['scripts/build.mjs'],{encoding:'utf8',env:{...process.env,BUILD_DIR:out,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:key}});
 assert.equal(run('sb_publishable_build_test').status,0);
 const html=readFileSync(out+'/index.html','utf8');assert.match(html,/src="\.\/app.js"/);assert.match(html,/href="\.\/style.css"/);assert.match(readFileSync(out+'/app.js','utf8'),/from '\.\/fflate.js'/);assert.ok(readFileSync(out+'/fflate.js').length>0);
 assert.notEqual(run('sb_secret_never_publish').status,0);
 const service='header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';assert.notEqual(run(service).status,0);
 }finally{rmSync(out,{recursive:true,force:true});}
});
