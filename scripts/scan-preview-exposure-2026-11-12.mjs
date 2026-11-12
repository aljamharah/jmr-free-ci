#!/usr/bin/env node
// Historical Cloudflare Pages security audit: read-only, no secrets, no AI POST, no deletions.
// Checks both immutable short-ID URLs and potentially mutable branch aliases.
// These 36 pairs are sourced from the 2026-11-12 Cloudflare inventory excerpt.
// A complete account-wide decision additionally requires the Cloudflare API's full UUID inventory.
const pairs = [
['85070db4','ops-cloudflare-token-readonl'],['af165aba','security-pages-preview-reado'],
['4b140ed5','engineering-final-release-cl'],['e803d2ee','docs-verified-technical-stat'],
['6f0c06a6','quality-jmr-one-sentence-res'],['df7ee758','engineering-jmr-library-sele'],
['c3332fdf','quality-jmr-source-grouping'],['5a7f9430','engineering-reconcile-header'],
['c13393d6','engineering-technical-founda'],['c1b38b5a','docs-command-center-2026-11'],
['57467daf','engineering-header-nav-contr'],['d429f8b0','design-compact-poet-profile'],
['12bada3b','fix-poet-profile-single-card'],['72762e43','quality-jmr-prosody-2026-11'],
['dc915b50','ui-home-header-consistency-2'],['0f5249f7','review-quick-fixes-12-2026-1'],
['31021ff5','fix-lexicon-integrity-curren'],['cf1be62b','stabilization-foundation-202'],
['de341618','stabilization-2026-11-11-saf'],['10aa935b','jmr-preview-rate-limit-2026'],
['04d25429','jmr-ai-foundation'],['794d34a2','jmr-quality-phase-1-2'],
['0944656a','jmr-ai-clean-preview'],['9b603e29','library-internal-archive-rea'],
['52498072','library-arud-qawafi-nine-boo'],['5c169441','feat-seed-arud-qawafi-books'],
['3d0b6b3b','feat-arabic-arud-qawafi-cate'],['a37d4977','feat-library-private-r2-read'],
['59fe7442','fix-library-rights-review-ga'],['63f77ca0','feat-library-book-reader-com'],
['5df981b0','fix-library-search-trigger'],['9cabb12d','fix-library-header-prayer-fi'],
['53302926','fix-library-shared-controls'],['aa3d6857','fix-library-visual-polish'],
['bb2cec27','fix-library-read-only-protec'],['ea92d045','fix-library-cms-path']
];
const paths = [
'/content/poems.json','/content/poems%2Ejson','/database/README-AR.md',
'/scripts/build_public_site.mjs','/.github/workflows/validate-library.yml',
'/workers/jmr-ratelimit-do/README.md','/package.json','/.gitignore'
];
const extras = ['7f4e2712','5ea3503d','bcd3c544','56e7e6e5','ca95cc72'];
const hosts = [...new Set([
  ...pairs.flatMap(([id,alias])=>[id,alias]),
  ...extras
])].map(x=> x+'.aljamharah.pages.dev').concat(['aljamharah.pages.dev']);
const tasks=hosts.flatMap(host=>paths.map(path=>({host,path})));
const results=[];
const PUBLIC_POEM_FIELDS = new Set([
 'slug','title','poet_slug','era_id','collection_id','verse_count','poem_subject',
 'poem_type','meter','rhyme_letter','source_reference','source_url',
 'text_status','rights_status','publication_status','body'
]);
function inspectPoemsJson(data) {
 if (!data || !Array.isArray(data.poems) || Object.keys(data).some(k => k !== 'poems')) return 'EDITORIAL_DATA_EXPOSED';
 for (const poem of data.poems) {
   if (!poem || poem.publication_status !== 'published') return 'EDITORIAL_DATA_EXPOSED';
   if (Object.keys(poem).some(k => !PUBLIC_POEM_FIELDS.has(k))) return 'EDITORIAL_DATA_EXPOSED';
   if (poem.body && !(poem.text_status==='local_text' && ['public_domain','permission_granted'].includes(poem.rights_status))) return 'EDITORIAL_DATA_EXPOSED';
 }
 return 'PUBLISHED_POEMS_ONLY';
}
async function inspect({host,path}) {
 const url='https://'+host+path;
 try{
   const response=await fetch(url,{redirect:'manual',headers:{Accept:'*/*'},signal:AbortSignal.timeout(18000)});
   const type=(response.headers.get('content-type')||'').toLowerCase();
   const poemPath=path.startsWith('/content/');
   let text='',overLimit=false;
   if(response.status===200){
     const reader=response.body?.getReader();
     if(reader){
       let bytes=0;const chunks=[],maxBytes=poemPath?8*1024*1024:65536;
       while(true){
         const {value,done}=await reader.read();if(done)break;
         if(!value)continue;
         if(bytes+value.length>maxBytes){overLimit=true;break;}
         chunks.push(Buffer.from(value));bytes+=value.length;
       }
       if(overLimit) await reader.cancel().catch(()=>{});
       text=new TextDecoder().decode(Buffer.concat(chunks));
     }
   }
   const status=response.status;
   const html=type.includes('text/html') && /<(!doctype\s+html|html[\s>]|head[\s>]|title[\s>])/i.test(text);
   let verdict;
   if([403,404,410].includes(status)) verdict='UNAVAILABLE';
   else if(status>=300 && status<400) verdict='REDIRECT_UNVERIFIED';
   else if(status!==200) verdict='UNVERIFIED';
   else if(html) verdict='HTML_FALLBACK';
   else if(poemPath && overLimit) verdict='JSON_REVIEW_REQUIRED';
   else if(poemPath) {
     try { verdict=inspectPoemsJson(JSON.parse(text)); }
     catch { verdict='JSON_REVIEW_REQUIRED'; }
   } else {
     verdict= /^(import |export |const |function |#|name:|\{|\[)/m.test(text) ||
       /javascript|json|markdown|text\/plain|yaml|octet-stream/i.test(type)
       ? 'INTERNAL_SOURCE_EXPOSED' : 'UNVERIFIED';
   }
   return {host,path,status,type,verdict};
 }catch(e){return {host,path,verdict:'ERROR_UNVERIFIED',error:String(e.message||e).slice(0,150)}}
}
const workers=12;let cursor=0;
await Promise.all(Array.from({length:workers},async()=>{
 while(cursor<tasks.length){const i=cursor++; results[i]=await inspect(tasks[i]);}
}));
const counts={};for(const r of results)counts[r.verdict]=(counts[r.verdict]||0)+1;
const flags=results.filter(r=>['EDITORIAL_DATA_EXPOSED','INTERNAL_SOURCE_EXPOSED'].includes(r.verdict));
const unresolved=results.filter(r=>['UNVERIFIED','REDIRECT_UNVERIFIED','ERROR_UNVERIFIED','JSON_REVIEW_REQUIRED'].includes(r.verdict));
console.log('AUDIT_SUMMARY',JSON.stringify({uniqueHosts:hosts.length,probes:tasks.length,counts,flagCount:flags.length,unverifiedCount:unresolved.length}));
for(const r of flags)console.log('EXPOSURE_FLAG',JSON.stringify(r));
for(const r of unresolved)console.log('UNVERIFIED_PATH',JSON.stringify(r));
const byHost=hosts.map(host=>{
 const rs=results.filter(r=>r.host===host);
 return {host,exposed:rs.filter(x=>/EDITORIAL_DATA_EXPOSED$|INTERNAL_SOURCE_EXPOSED$/.test(x.verdict)).length,
  unavailable:rs.filter(x=>x.verdict==='UNAVAILABLE').length,
  fallback:rs.filter(x=>x.verdict==='HTML_FALLBACK').length,
  unverified:rs.filter(x=>x.verdict.includes('UNVERIFIED')).length};
});
for(const r of byHost)console.log('HOST_SUMMARY',JSON.stringify(r));
const report={generatedAt:new Date().toISOString(),scope:'36 known Preview alias/hash pairs plus five notable immutable hosts and canonical domain. NOT a complete 1397-deployment inventory.',paths,summary:counts,byHost,results};
const fs=await import('node:fs/promises');
await fs.writeFile('historical-exposure-audit.json',JSON.stringify(report,null,2));
console.log('REPORT_PATH historical-exposure-audit.json');
if(flags.length)process.exitCode=2;
else if(unresolved.length)process.exitCode=3;
