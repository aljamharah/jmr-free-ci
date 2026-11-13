import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const dir=new URL('../.github/workflows/',import.meta.url);
const read=name=>readFileSync(new URL(name,dir),'utf8');
const runtime=read('jmr-runtime-guards-no-model.yml');
const concurrency=read('jmr-preview-concurrent-do-guard.yml');
const privateSource=read('private-source-validation.yml');

test('runtime guard checks public production/staging only and requires Preview Access',()=>{
  assert.match(runtime,/name:"production",origin:"https:\/\/aljamharah.pages.dev"/);
  assert.match(runtime,/name:"isolated-staging",origin:"https:\/\/aljamharah-staging.pages.dev"/);
  assert.doesNotMatch(runtime,/name:"production-project-preview"/);
  assert.match(runtime,/Preview no longer requires Access login/);
  assert.match(runtime,/runtime behavior NOT_TESTED/);
  assert.match(runtime,/redirect:"manual"/);
});

test('concurrent DO guard does not issue unauthenticated POSTs or claim a 12\/13 result',()=>{
  assert.match(concurrency,/do_concurrency:"NOT_TESTED_ACCESS_PROTECTED"/);
  assert.match(concurrency,/method:"GET"/);
  assert.doesNotMatch(concurrency,/method:"POST"/);
  assert.doesNotMatch(concurrency,/Array.from\(\{length:15\}/);
  assert.match(concurrency,/No approved|approved authenticated|service credential is not configured/);
});

test('manual live JMR checks are blocked until a separate authenticated Access workflow exists',()=>{
  assert.match(privateSource,/id: preview_access/);
  assert.match(privateSource,/authenticated=false/);
  assert.match(privateSource,/LIVE_PREVIEW_TESTS_NOT_EXECUTED/);
  const names=[
    'Check deployed JMR Preview page and API guard',
    'Send one real language question to JMR Preview',
    'Verify live poet retrieval and Quran isolation'
  ];
  for(const name of names){
    const section=privateSource.slice(privateSource.indexOf('      - name: '+name));
    assert.ok(section.length>0,'missing step '+name);
    assert.match(section.slice(0,360),/steps\.preview_access\.outputs\.authenticated == 'true'/);
  }
  assert.match(privateSource,/name: Run JMR API mock tests/);
  assert.match(privateSource,/name: Run Durable Object concurrency and expiry tests/);
});

test('all changed inline Node ESM snippets are syntax-valid',()=>{
  for(const [name,content] of [
    ['runtime',runtime],['concurrent',concurrency],['private source',privateSource]
  ]){
    const snippets=[...content.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s+NODE/g)];
    assert.ok(snippets.length>0,'no inline Node snippets in '+name);
    for(const [idx,m] of snippets.entries()){
      const check=spawnSync(process.execPath,['--input-type=module','--check'],{
        input:m[1],encoding:'utf8'
      });
      assert.equal(check.status,0,name+' snippet '+idx+' invalid: '+check.stderr);
    }
  }
});
