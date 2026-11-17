import {chromium} from 'playwright';
import axe from 'axe-core';
import {appendFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// Public-production-only, GET-only browser audit. No external domains or private data.
const base='https://aljamharah.pages.dev';
const allPages=['index.html','catalog.html','lexicon.html','library.html',
  'poets.html','poet.html','poem.html','search.html','book.html','reader.html',
  'jmr.html','privacy.html'];
const auditedPages=new Set(['index.html','lexicon.html','search.html',
  'library.html','poets.html','jmr.html','privacy.html']);
const viewports=[
  {id:'mobile-320',width:320,mobile:true,slow:true},
  {id:'mobile-390',width:390,mobile:true,slow:true},
  {id:'desktop-1280',width:1280,mobile:false,slow:false}
];
const rows=[],violations=[],searchRows=[],failures=[];
const safe=(fn,reason)=>{try{assert.ok(fn,reason);}catch(e){failures.push(reason);}};


let browser;
try {
  try{browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});}
  catch{browser=await chromium.launch({headless:true,args:['--no-sandbox']});}
  for(const v of viewports){
    const context=await browser.newContext({
      viewport:{width:v.width,height:844},isMobile:v.mobile,hasTouch:v.mobile,
      deviceScaleFactor:v.mobile?2:1,locale:'ar',reducedMotion:'reduce',
      bypassCSP:true
    });
    await context.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      return req.method()==='GET'&&u.origin===base?route.continue():route.abort();
    });
    await context.addInitScript(()=>{
      window.__visitorLab={lcp:0,cls:0};
      try{new PerformanceObserver(list=>{
        for(const e of list.getEntries())window.__visitorLab.lcp=e.startTime;
      }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
      try{new PerformanceObserver(list=>{
        for(const e of list.getEntries())if(!e.hadRecentInput)window.__visitorLab.cls+=e.value;
      }).observe({type:'layout-shift',buffered:true});}catch{}
    });
    for(const path of allPages){
      const p=await context.newPage();
      const errs=[];p.on('pageerror',e=>errs.push(e.name));
      const cdp=await context.newCDPSession(p);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      if(v.slow){
        await cdp.send('Network.emulateNetworkConditions',{
          offline:false,latency:160,
          downloadThroughput:1.6*1024*1024/8,
          uploadThroughput:750*1024/8
        });
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      }
      let status=0,dir='',title='',overflow=0,focus=false;
      let timings={lcp:0,cls:0,fcp:0,dcl:0,bytes:0,requests:0};
      try{
        const res=await p.goto(base+'/'+path,{waitUntil:'domcontentloaded',timeout:40000});
        status=res?.status()||0;
        await p.waitForLoadState('load',{timeout:10000}).catch(()=>{});
        await p.waitForTimeout(400);
        title=await p.title();
        dir=await p.locator('html').getAttribute('dir');
        timings=await p.evaluate(()=>{
          const nav=performance.getEntriesByType('navigation')[0];
          const resources=performance.getEntriesByType('resource');
          const paints=performance.getEntriesByType('paint');
          return {
            lcp:Math.round(window.__visitorLab?.lcp||0),
            cls:Number((window.__visitorLab?.cls||0).toFixed(4)),
            fcp:Math.round(paints.find(x=>x.name==='first-contentful-paint')?.startTime||0),
            dcl:Math.round(nav?.domContentLoadedEventEnd||0),
            requests:resources.length+1,
            bytes:(nav?.transferSize||0)+resources.reduce((n,x)=>n+(x.transferSize||0),0)
          };
        });
        overflow=await p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
        await p.keyboard.press('Tab');
        focus=await p.evaluate(()=>{
          const e=document.activeElement;
          return !!e&&e!==document.body&&['A','BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY'].includes(e.tagName);
        });
        safe(status===200,'HTTP '+path+' '+v.id);
        safe(title.trim().length>0,'missing title '+path+' '+v.id);
        safe(dir==='rtl','RTL '+path+' '+v.id);
        safe(overflow<=6,'horizontal overflow '+path+' '+v.id+' px='+Math.ceil(overflow));
        safe(errs.length===0,'page JavaScript '+path+' '+v.id+' count='+errs.length);
        safe(focus,'keyboard Tab reachability '+path+' '+v.id);
        if(auditedPages.has(path)&&v.width!==320){
          await p.addScriptTag({content:axe.source});
          const issues=await p.evaluate(async()=>{
            const out=await window.axe.run(document,{runOnly:{type:'tag',values:[
              'wcag2a','wcag2aa','wcag21a','wcag21aa']}});
            return out.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.length}));
          });
          for(const issue of issues)violations.push({page:path,view:v.id,...issue});
          safe(!issues.some(x=>['critical','serious'].includes(x.impact)),
            'serious axe violation '+path+' '+v.id+' ids='+issues.map(x=>x.id).join(','));
        }
      }catch(e){failures.push('browser audit '+path+' '+v.id+' '+e.message.slice(0,150));}
      const row={path,view:v.id,status,focus,overflow:Math.ceil(overflow),js:errs.length,...timings};
      rows.push(row);
      console.log('J08_LIVE '+JSON.stringify(row));
      await p.close();
    }
    if(v.width===390||v.width===1280){
      const p=await context.newPage();
      const errors=[];p.on('pageerror',e=>errors.push(e.name));
      try{
        const r=await p.goto(base+'/search.html',{waitUntil:'domcontentloaded',timeout:35000});
        assert.equal(r?.status(),200);
        const submit=async (q,kind)=>{
          const started=Date.now();
          await p.locator('#unifiedQuery').fill(q);
          await p.locator('#unifiedForm').evaluate(el=>el.requestSubmit());
          await p.waitForFunction(query=>{
            const text=document.querySelector('#unifiedStatus')?.textContent||'';
            return text.includes('عُثر على')&&text.includes(query);
          },q,{timeout:25000});
          const kinds=await p.locator('.unified-result .result-kind').allTextContents();
          const latency=Date.now()-started;
          if(kind)safe(kinds.includes(kind),'missing '+kind+' results '+v.id+' '+q);
          searchRows.push({view:v.id,query:q,latencyMs:latency,items:kinds.length});
          console.log('J08_SEARCH '+JSON.stringify(searchRows.at(-1)));
        };
        await submit('العروض','الكتب');
        await p.locator('#unifiedType').selectOption('books');
        const books=await p.locator('.unified-result .result-kind').allTextContents();
        safe(books.length>0&&books.every(x=>x==='الكتب'),'book filter '+v.id);
        await p.locator('#unifiedType').selectOption('all');
        await submit('القيس','الشعراء');
        await submit('قفا','القصائد');
        await submit('فلاوجودلهذاالاختبار',null);
        safe((await p.locator('.unified-empty').count())===1,'empty state '+v.id);
        safe(errors.length===0,'search JavaScript '+v.id);
      }catch(e){failures.push('live-search '+v.id+' '+e.message.slice(0,150));}
      await p.close();
    }
    await context.close();
  }
}finally{
  if(browser)await browser.close();
}
const axes=[...new Set(violations.map(x=>x.id))].sort();
const summary=[
  '### J-08: reproducible public-production visitor lab',
  '- Source: public Cloudflare production; GET-only, **same-origin only**, no external fonts/scripts/analytics, POST or AI',
  '- Chromium browser (headless): simulated mobile 320/390px, desktop 1280px, Arabic RTL',
  '- Mobile: simulated 160ms latency, ~1.6 Mbps downstream, 4× CPU throttle; desktop: unthrottled',
  '- Cache disabled per page; measured via browser Navigation/Resource Timing and PerformanceObserver',
  '- Values **are lab observations, not real iPhone/Android measurements or CrUX field Core Web Vitals**',
  '- 12 pages × 3 viewport profiles = '+rows.length+' navigation scenarios; '+violations.length+' axe rule occurrences across 14 WCAG screens',
  '- WCAG rule IDs: '+(axes.join(', ')||'none'),
  '- Search: books/poets/poems/filter/empty states on mobile and desktop; synthetic response timings, not INP',
  '| Viewport | Screens | Median lab LCP ms* | Median lab CLS | Median transfer KiB* | Median DCL ms |',
  '|---|---:|---:|---:|---:|---:|',
  ...viewports.map(v=>{
    const a=rows.filter(x=>x.view===v.id),lcps=a.filter(x=>x.lcp>0).map(x=>x.lcp).sort((x,y)=>x-y),
      cls=a.map(x=>x.cls).sort((x,y)=>x-y),bytes=a.map(x=>x.bytes/1024).sort((x,y)=>x-y),
      dcl=a.map(x=>x.dcl).sort((x,y)=>x-y);
    const med=x=>x.length?Number(x[Math.floor(x.length/2)]).toFixed(1):'n/a';
    return '| '+v.id+' | '+a.length+' | '+med(lcps)+' | '+med(cls)+' | '+med(bytes)+' | '+med(dcl)+' |';
  }),
  '- *LCP omitted from the median if no candidate was observed; transferSize is an approximate browser metric under the restricted GET policy',
  '| Search query | Mobile 390ms | Desktop 1280ms |',
  '|---|---:|---:|',
  ...['العروض','القيس','قفا','فلاوجودلهذاالاختبار'].map(q=>{
    const row=v=>searchRows.find(x=>x.view===v&&x.query===q);
    return '| '+q+' | '+(row('mobile-390')?.latencyMs??'n/a')+' | '+(row('desktop-1280')?.latencyMs??'n/a')+' |';
  }),
  '- Successful assertions require HTTP 200, RTL, title, no overflow >6px, first Tab focus, no uncaught JS, core search categories, no serious/critical axe violations',
  '- Failures ('+failures.length+'): '+(failures.slice(0,14).join('; ')||'none'),
  '- **Not covered**: physical devices, VoiceOver/TalkBack/NVDA manual use, real-user INP/LCP/CLS or external dependency timing'
].join('\n')+'\n';
appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
console.log('J08_LIVE_SUMMARY '+JSON.stringify({
  screens:rows.length,axeFindings:violations.length,ruleIds:axes,
  mobileSearch:searchRows.filter(x=>x.view==='mobile-390'),
  desktopSearch:searchRows.filter(x=>x.view==='desktop-1280'),
  failures:failures.slice(0,20)
}));
if(failures.length)process.exitCode=1;
