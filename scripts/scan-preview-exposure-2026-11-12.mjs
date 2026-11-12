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
  ...extras,'aljamharah'
])].map(x=> x+'.aljamharah.pages.dev');
const tasks=hosts.flatMap(host=>paths.map(path=>({host,path})));
const results=[];
async function inspect({host,path}) {
 const url='https://'+host+path;
 try{
   const response=await fetch(url,{redirect:'manual',headers:{Accept:'*/*'},signal:AbortSignal.timeout(16000)});
   const type=(response.headers.get('content-type')||'').toLowerCase();
   let text='';
   if(response.status===200){
     const reader=response.body?.getReader();
     if(reader){
       let bytes=0; const chunks=[];
       while(bytes<65536){
         const {value,done}=await reader.read(); if(done)break;
         if(!value)continue;
         const take=value.subarray(0,Math.min(value.length,65536-bytes));
         chunks.push(take);bytes+=take.length;
       }
       await reader.cancel().catch(()=>{});
       text=new TextDecoder().decode(Buffer.concat(chunks.map(x=>Buffer.from(x))));
     }
   }
   const html=type.includes('text/html') && /<(!doctype\s+html|html[\s>]|head[\s>]|title[\s>])/i.test(text);
   const likelyRaw=path.startsWith('/content/') ? response.status===200 && (type.includes('json') || /^\s*[\[{]/.test(text)) :
      response.status===200 && !html && (
        /^(import |export |const |function |#|name:|\{|\[)/m.test(text) ||
        /javascript|json|markdown|text\/plain|yaml|octet-stream/i.test(type));
   const editorial=path.startsWith('/content/') && /publication_status|rights_basis|editorial_note|text_attribution|draft/i.test(text);
   const status=response.status;
   const verdict=likelyRaw?(path.startsWith('/content/')?'POTENTIAL_EDITORIAL_EXPOSURE':'INTERNAL_SOURCE_EXPOSED'):
     html?'HTML_FALLBACK':[403,404,410].includes(status)?'UNAVAILABLE':
     (status>=300&&status<400)?'REDIRECT_UNVERIFIED':'UNVERIFIED';
   return {host,path,status,type,verdict,editorialMarker:editorial || undefined};
 }catch(e){return {host,path,verdict:'ERROR_UNVERIFIED',error:String(e.message||e).slice(0,150)}}
}
const workers=12;let cursor=0;
await Promise.all(Array.from({length:workers},async()=>{
 while(cursor<tasks.length){const i=cursor++; results[i]=await inspect(tasks[i]);}
}));
const counts={};for(const r of results)counts[r.verdict]=(counts[r.verdict]||0)+1;
const flags=results.filter(r=>['POTENTIAL_EDITORIAL_EXPOSURE','INTERNAL_SOURCE_EXPOSED'].includes(r.verdict));
const unresolved=results.filter(r=>['UNVERIFIED','REDIRECT_UNVERIFIED','ERROR_UNVERIFIED'].includes(r.verdict));
console.log('AUDIT_SUMMARY',JSON.stringify({uniqueHosts:hosts.length,probes:tasks.length,counts,flagCount:flags.length,unverifiedCount:unresolved.length}));
for(const r of flags)console.log('EXPOSURE_FLAG',JSON.stringify(r));
for(const r of unresolved)console.log('UNVERIFIED_PATH',JSON.stringify(r));
const byHost=hosts.map(host=>{
 const rs=results.filter(r=>r.host===host);
 return {host,exposed:rs.filter(x=>/EXPOSURE$|SOURCE_EXPOSED$/.test(x.verdict)).length,
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
