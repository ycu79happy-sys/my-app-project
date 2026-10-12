import {cpSync,mkdirSync,writeFileSync} from 'node:fs';
const url=process.env.SUPABASE_URL||'';const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw Error('Set SUPABASE_URL to your project HTTPS URL.');
let publicKey=key.startsWith('sb_publishable_');
if(key.split('.').length===3){try{publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{}}
if(!publicKey)throw Error('Use a publishable key or legacy anon key. NEVER use a secret/service_role key.');
const out=process.env.BUILD_DIR||'dist';
mkdirSync(out,{recursive:true});cpSync('public',out,{recursive:true});cpSync('node_modules/fflate/esm/browser.js',out+'/fflate.js');
writeFileSync(out+'/config.js','export const config = '+JSON.stringify({supabaseUrl:url,supabaseKey:key})+';\n');
writeFileSync(out+'/.nojekyll','');console.log('Static app built in dist/ (public Supabase configuration included).');
