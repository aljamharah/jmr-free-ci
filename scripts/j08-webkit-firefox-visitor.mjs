import {webkit, firefox} from 'playwright';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';

const ORIGIN='https://aljamharah.pages.dev';
const CASES=[
  {name:'webkit-mobile-390',engine:webkit,viewport:{width:390,height:844},mobile:true},
  {name:'firefox-desktop-1280',engine:firefox,viewport:{width:1280,height:800},mobile:false}
];
const PAGES=['index.html','catalog.html','lexicon.html','library.html','search.html','poets.html','jmr.html'];
const rows=[],errors=[];
function check(ok,label){if(!ok)errors.push(label);}
for(const c of CASES){
  let browser;
  try{
    browser=await c.engine.launch({headless:true});
    const context=await browser.newContext({
      viewport:c.viewport,isMobile:c.mobile,hasTouch:c.mobile,
      locale:'ar',reducedMotion:'reduce'
    });
    await context.route('**/*',route=>{
      const req=route.request(),u=new URL(req.url());
      return req.method()==='GET'&&u.origin===ORIGIN?route.continue():route.abort();
    });
    for(const path of PAGES){
      const page=await context.newPage(),js=[];
      page.on('pageerror',e=>js.push(e.name));
      try{
        const started=Date.now();
        const response=await page.goto(ORIGIN+'/'+path,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(180);
        const state=await page.evaluate(()=>({
          dir:document.documentElement.dir,
          title:document.title.trim(),
          overflow:document.documentElement.scrollWidth-innerWidth
        }));
        await page.keyboard.press('Tab');
        const tab=await page.evaluate(()=>document.activeElement!==document.body&&
          !!document.activeElement&&document.activeElement!==document.documentElement);
        const result={engine:c.name,path,status:response?.status(),rtl:state.dir==='rtl',
          title:!!state.title,overflow:Math.max(0,Math.ceil(state.overflow)),
          keyboard:tab,js:js.length,domReadyMs:Date.now()-started};
        check(result.status===200,'http '+c.name+' '+path);
        check(result.rtl,'rtl '+c.name+' '+path);
        check(result.title,'title '+c.name+' '+path);
        check(result.overflow<=6,'overflow '+c.name+' '+path);
        check(result.keyboard,'keyboard '+c.name+' '+path);
        check(result.js===0,'js '+c.name+' '+path);
        rows.push(result);
        console.log('J08_XENGINE_SCREEN '+JSON.stringify(result));
      }catch(e){errors.push('load '+c.name+' '+path+' '+String(e.message).slice(0,120));}
      await page.close();
    }
    // Interact as a visitor; no API POST and no private source or cookies.
    const page=await context.newPage(),js=[];
    page.on('pageerror',e=>js.push(e.name));
    try{
      await page.goto(ORIGIN+'/search.html',{waitUntil:'domcontentloaded',timeout:30000});
      await page.locator('#unifiedQuery').fill('قفا');
      await page.locator('#unifiedQuery').press('Enter');
      await page.waitForFunction(()=>document.querySelector('#unifiedStatus')?.textContent?.includes('قفا')&&
        document.querySelector('.unified-result')!==null,{timeout:20000});
      const poem=page.locator('.unified-result').filter({hasText:'القصائد'}).first();
      check(await poem.count()===1,'poem card '+c.name);
      const href=await poem.getAttribute('href');
      check(!!href && /^poem(?:\.html)?\?slug=/.test(href),'trusted relative href '+c.name);
      await poem.click();
      const to=new URL(page.url());
      check(['/poem','/poem.html'].includes(to.pathname)&&to.searchParams.has('slug'),
        'poem click destination '+c.name);
      check(await page.locator('h1').count()>0,'poem title '+c.name);
      await page.goBack({waitUntil:'domcontentloaded',timeout:25000});
      check(['/search','/search.html'].includes(new URL(page.url()).pathname),
        'search Back '+c.name);
      await page.locator('#unifiedQuery').fill('فلاوجودلهذاالاختبار');
      await page.locator('#unifiedQuery').press('Enter');
      await page.waitForFunction(()=>document.querySelector('#unifiedStatus')?.textContent?.includes('فلاوجودلهذاالاختبار'),
        {timeout:20000});
      check(await page.locator('.unified-empty').count()===1,'search empty '+c.name);
      check(js.length===0,'search JavaScript '+c.name);
      console.log('J08_XENGINE_JOURNEY '+JSON.stringify({engine:c.name,poem:true,back:true,empty:true}));
    }catch(e){errors.push('journey '+c.name+' '+String(e.message).slice(0,180));}
    await page.close();
    await context.close();
  }catch(e){errors.push('browser '+c.name+' '+String(e.message).slice(0,180));}
  finally{if(browser)await browser.close();}
}
appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
  '### J-08 cross-engine visitor check: WebKit mobile + Firefox desktop',
  '- Real browser engines in hosted Linux, **not** a physical iPhone or desktop',
  '- GET-only public same-origin, no tokens, AI calls, user tracking or model quota',
  '- Coverage: '+rows.length+' page-engine cases; 2 interactive search → poem → Back → empty-state journeys',
  '- Tested RTL, page title, first Tab, script errors, horizontal overflow, navigation',
  '- Failures: '+errors.length+(errors.length?'; '+errors.join('; '):''),
  '- Does not certify VoiceOver, TalkBack, Core Web Vitals field data or visual appearance'
].join('\n')+'\n');
console.log('J08_XENGINE_SUMMARY '+JSON.stringify({screens:rows.length,journeys:2,failures:errors}));
if(errors.length)process.exitCode=1;
