import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';

const BASE = 'https://aljamharah.pages.dev';
const MAX_BOOKS = 50;
const failures = [];
const report = { book_records: 0, book_mobile: 0, book_desktop: 0, books_with_inline_frame: 0, books_with_text: 0, books_with_source_notice: 0, poem_actions: 0, share_actions: 0, print_actions: 0, model_calls: 0, external_frames_loaded: false };

async function getJSON(path) {
  const url = new URL(path, BASE);
  assert.equal(url.origin, BASE, 'Unexpected data origin');
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(16000) });
  assert.equal(response.status, 200, 'Public index unavailable');
  return response.json();
}
const safeRecord = path => /^content\/books\/records\/[A-Za-z0-9_-]{1,80}\.json$/.test(path || '');
const index = await getJSON('/content/books/index.json');
const books = Array.isArray(index.books) ? index.books : [];
assert.ok(books.length > 0 && books.length <= MAX_BOOKS, 'Invalid or unexpectedly huge public book index');
assert.equal(new Set(books.map(b => b.id)).size, books.length, 'Duplicate book identifier');
const records = [];
for (const entry of books) {
  assert.ok(/^[A-Za-z0-9_-]{1,80}$/.test(entry.id) && safeRecord(entry.record), 'Invalid book index record');
  const rec = await getJSON('/' + entry.record);
  assert.equal(rec.id, entry.id, 'Book record identifier mismatch');
  assert.equal(rec.publication_status, 'published', 'An unpublished book is present in public index');
  records.push(rec);
}
report.book_records = records.length;

const publishedPoems = (await getJSON('/content/poems.json')).poems.filter(p =>
  p.publication_status === 'published' && p.text_status === 'local_text' &&
  ['public_domain', 'permission_granted'].includes(p.rights_status) &&
  typeof p.body === 'string' && /[\u064B-\u065F\u0670]/u.test(p.body)
);
assert.ok(publishedPoems.length >= 1, 'No eligible vowelled poem to test');

let browser;
try {
  try { browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']}); }
  catch { browser = await chromium.launch({headless:true,args:['--no-sandbox']}); }
  for (const width of [390,1280]) {
    const ctx = await browser.newContext({
      viewport:{width,height:844},locale:'ar',reducedMotion:'reduce',bypassCSP:true
    });
    // Never fetch third-party books, images or framed PDFs in this audit.
    await ctx.route('**/*',route=>{
      const request=route.request(), url=new URL(request.url());
      return request.method()==='GET' && url.origin===BASE ? route.continue() : route.abort();
    });
    // Intercept local clipboard and print only inside the disposable browser.
    // Never activate a real OS print dialog or share to third parties.
    await ctx.addInitScript(() => {
      window.__test01 = {copied:'',printCalls:0};
      Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
      Object.defineProperty(navigator,'clipboard',{configurable:true,
        value:{writeText:async text=>{window.__test01.copied=String(text);}}});
      window.print=()=>{window.__test01.printCalls++;};
    });
    const page = await ctx.newPage();
    const javascriptErrors=[];
    page.on('pageerror', e=>javascriptErrors.push(e.name));
    for (const [i,book] of records.entries()) {
      try {
        const response=await page.goto(BASE+'/book.html?id='+encodeURIComponent(book.id),{waitUntil:'domcontentloaded',timeout:28000});
        assert.equal(response?.status(),200);
        await page.locator('#bookPanel h1.book-title').waitFor({state:'visible',timeout:15000});
        assert.equal((await page.locator('#bookPanel h1.book-title').innerText()).trim(),book.title.trim());
        assert.equal(await page.locator('#bookReading .waqf-reader-stage').count(),1);
        assert.equal(await page.locator('#bookReturnRow').count(),1);
        assert.ok(await page.locator('#bookPanel .waqf-reader-frame, #bookPanel .waqf-reader-text, #bookPanel .waqf-reader-empty').count()>=1,
          'Book did not render an inline frame, text or explicit source state');
        const frames=await page.locator('#bookPanel .waqf-reader-frame').count();
        if(frames){
          const urls=await page.locator('#bookPanel .waqf-reader-frame').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
          for(const src of urls){
            const u=new URL(src,BASE);
            assert.ok(u.protocol==='https:' && (u.origin===BASE || u.hostname==='archive.org' || u.hostname==='www.archive.org'),
              'Disallowed embedded reader origin');
          }
          report.books_with_inline_frame++;
        }else if(await page.locator('#bookPanel .waqf-reader-text').count())report.books_with_text++;
        else report.books_with_source_notice++;
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
        assert.ok(overflow<=6, 'Book has horizontal overflow');
        if(width===390)report.book_mobile++;else report.book_desktop++;
      }catch(e){ failures.push('Book #'+(i+1)+' / '+width+'px: '+String(e.message).slice(0,150)); }
    }
    if(width===390) {
      const poemSample=publishedPoems.slice(0,Math.min(3,publishedPoems.length));
      for(const [i,poem] of poemSample.entries()){
        try{
          const detailUrl=BASE+'/poem.html?slug='+encodeURIComponent(poem.slug)+
            '&from='+encodeURIComponent('catalog.html?group=arab-poetry&item=muallaqat')+
            '&utm_source=verification';
          const response=await page.goto(detailUrl,{waitUntil:'domcontentloaded',timeout:28000});
          assert.equal(response?.status(),200);
          await page.locator('#poemVerses .verse-line').first().waitFor({state:'visible',timeout:15000});
          assert.equal((await page.locator('#poemHero h1').innerText()).trim(),poem.title.trim());
          const before=await page.locator('#poemVerses').innerText();
          assert.ok(/[\u064B-\u065F\u0670]/u.test(before),'Visible poem has no diacritics');
          await page.locator('#removeDiacritics').click();
          assert.equal(await page.locator('#removeDiacritics').getAttribute('aria-pressed'),'true');
          const stripped=await page.locator('#poemVerses').innerText();
          assert.doesNotMatch(stripped,/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u);
          assert.equal(stripped, before.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu,''));
          await page.locator('#removeDiacritics').click();
          assert.equal(await page.locator('#removeDiacritics').getAttribute('aria-pressed'),'false');
          assert.equal(await page.locator('#poemVerses').innerText(), before);
          await page.locator('#copyPoem').click();
          await page.waitForFunction(()=>window.__test01?.copied?.length>0,{timeout:8000});
          assert.equal(await page.evaluate(()=>window.__test01.copied),poem.body,
            'Copy must preserve original published poem text');
          await page.locator('#poemActionFeedback.show').waitFor({state:'visible',timeout:8000});
          report.poem_actions++;
          await page.locator('#sharePoem').click();
          // Cloudflare Pages may canonicalize /poem.html to /poem. Verify content
          // identity and query hygiene, not a hard-coded .html pathname.
          await page.waitForFunction(previous=>window.__test01?.copied!==previous,
            poem.body,{timeout:8000});
          const sharedUrl=await page.evaluate(()=>window.__test01.copied);
          const canonical=new URL(sharedUrl);
          assert.equal(canonical.origin,BASE,'Share must stay on public Jamharah origin');
          assert.ok(['/poem','/poem.html'].includes(canonical.pathname),
            'Share path must point to the public poem page');
          assert.deepEqual([...canonical.searchParams.keys()],['slug'],
            'Share must omit private navigation, tracking and unrelated parameters');
          assert.equal(canonical.searchParams.get('slug'),poem.slug,
            'Shared slug must identify the current poem');
          assert.equal(canonical.hash,'','Share must not include a private fragment');
          report.share_actions++;
          await page.locator('#print').click();
          assert.equal(await page.evaluate(()=>window.__test01.printCalls),1,
            'Print button did not call the intercepted browser print API');
          report.print_actions++;
        }catch(e){failures.push('Poem sample #'+(i+1)+': '+String(e.message).slice(0,150));}
      }
    }
    await ctx.close();
    assert.equal(javascriptErrors.length,0,'Uncaught JavaScript errors for '+width+'px');
  }
} finally { if(browser) await browser.close(); }
const summary=[
 '## TEST-01 — Live book and poem journeys',
 '- Public Production, GET-only, same-origin subresources; external PDF/Archive iframe requests blocked (not tested)',
 '- Public book records checked: '+report.book_records,
 '- Book detail pages at 390px: '+report.book_mobile+', at 1280px: '+report.book_desktop,
 '- Inline frame present per inspected book: '+report.books_with_inline_frame,
 '- Text-only reading state: '+report.books_with_text+', source/unavailable state: '+report.books_with_source_notice,
 '- Poem copy samples (diacritics off/on, feedback, clipboard preservation): '+report.poem_actions,
 '- Canonical share tests (strip navigation/tracking parameters): '+report.share_actions,
 '- Print action tests (intercepted; no real printer opened): '+report.print_actions,
 '- Failures: '+failures.length,
 '- Not covered: third-party PDF render, rights provenance, actual iPhone/Android, color-glyph shape/harakat accuracy, model calls',
 ...(failures.length? ['- Failures (public row positions only): '+failures.slice(0,10).join('; ')]:[])
].join('\n')+'\n';
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
console.log('TEST01_LIVE_SUMMARY '+JSON.stringify({...report,failures}));
if(failures.length)process.exitCode=1;
