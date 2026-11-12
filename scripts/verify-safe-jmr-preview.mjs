#!/usr/bin/env node
// Read-only checks plus bounded empty-message POST tests against sanitized JMR Preview.
// No paid model inference, no Cloudflare writes, no secrets or file-body output.
const slug='jmr-secure-preview-2026-11-1';
const base='https://'+slug+'.aljamharah.pages.dev';
const paths=[
  '/database/README-AR.md','/scripts/build_public_site.mjs',
  '/.github/workflows/validate-library.yml',
  '/workers/jmr-ratelimit-do/README.md','/package.json','/.gitignore'
];
async function check(url,opts={}){
  const response=await fetch(url,{...opts,redirect:'manual',signal:AbortSignal.timeout(15000)});
  const type=(response.headers.get('content-type')||'').toLowerCase();
  return {response,type};
}
function safePoems(data){
  const ALLOWED=new Set(['slug','title','poet_slug','era_id','collection_id',
  'verse_count','poem_subject','poem_type','meter','rhyme_letter','source_reference',
  'source_url','text_status','rights_status','publication_status','body']);
  return data && Array.isArray(data.poems) && Object.keys(data).every(k=>k==='poems') &&
    data.poems.every(p=>p && p.publication_status==='published' &&
     Object.keys(p).every(k=>ALLOWED.has(k)) &&
     (!p.body || (p.text_status==='local_text' &&
     ['public_domain','permission_granted'].includes(p.rights_status))));
}
let available=false;
for(let attempt=0;attempt<16;attempt++){
 try {
   const {response,type}=await check(base+'/');
   const page=await response.text();
   if(response.status===200&&type.includes('text/html')&&page.includes('الجمهرة')){
     available=true;break;
   }
 }catch{}
 await new Promise(r=>setTimeout(r,10000));
}
if(!available){console.error('SAFE_PREVIEW_NOT_YET_AVAILABLE',base);process.exit(1);}
console.log('SAFE_PREVIEW_HOME',JSON.stringify({url:base,status:200}));
for(const path of paths){
  const {response,type}=await check(base+path);
  const body=response.status===200?await response.text():'';
  const fallback=type.includes('text/html')&&/<(?:!doctype|html|title)[\s>]/i.test(body);
  const safe=[403,404,410].includes(response.status)||fallback;
  console.log('SAFE_PREVIEW_INTERNAL_PATH',JSON.stringify({path,status:response.status,type,fallback,safe}));
  if(!safe)process.exitCode=1;
}
for(const path of ['/content/poems.json','/content/poems%2Ejson']){
 const {response,type}=await check(base+path);
 let safe=false;
 if(response.ok&&type.includes('json')) {
  const body=await response.json();safe=safePoems(body);
 }else {
  const body=await response.text();
  safe=type.includes('text/html')&&body.includes('الجمهرة');
 }
 console.log('SAFE_PREVIEW_EDITORIAL_PATH',JSON.stringify({path,status:response.status,type,safe}));
 if(!safe)process.exitCode=1;
}
// Use one minute window. Empty messages should be rejected before AI inference.
const wait=(61-new Date().getUTCSeconds())*1000;
if(wait<15000) await new Promise(r=>setTimeout(r,wait));
const responses=await Promise.all(Array.from({length:15},async()=>{
 const {response}=await check(base+'/api/jmr',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message:''})
 });
 return response.status;
}));
const counts=Object.fromEntries([...new Set(responses)].map(s=>[s,responses.filter(v=>v===s).length]));
const passed=(counts[400]===12&&counts[429]===3);
console.log('SAFE_PREVIEW_DO_CONCURRENCY',JSON.stringify({counts,passed}));
if(!passed)process.exitCode=1;
