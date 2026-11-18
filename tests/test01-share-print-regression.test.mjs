import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const file=new URL('../scripts/test01-live-content-journeys.mjs',import.meta.url);
const source=readFileSync(file,'utf8');

test('TEST-01 public browser tests stay GET-only and never request model inference',()=>{
  assert.match(source,/request\.method\(\)==='GET' && url\.origin===BASE/);
  assert.doesNotMatch(source,/fetch\([^)]*,\s*\{\s*method:\s*['"]POST['"]/);
  assert.match(source,/external PDF\/Archive iframe requests blocked/);
  assert.match(source,/model_calls: 0/);
});

test('TEST-01 canonical share and print are verified with in-browser mocks',()=>{
  assert.match(source,/ctx\.addInitScript/);
  assert.match(source,/Object\.defineProperty\(navigator,'clipboard'/);
  assert.match(source,/Object\.defineProperty\(navigator,'share'/);
  assert.match(source,/window\.print=\(\)=>\{window\.__test01\.printCalls\+\+;/);
  assert.match(source,/expectedShare=BASE\+'\/poem\.html\?slug='/);
  assert.match(source,/utm_source=verification/);
  assert.match(source,/assert\.equal\(sharedUrl,expectedShare/);
  assert.match(source,/report\.print_actions\+\+/);
  assert.match(source,/report\.share_actions\+\+/);
});

test('TEST-01 revised browser source is valid Node ESM',()=>{
  const result=spawnSync(process.execPath,['--check',file.pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('TEST-01 live journey reruns on scripts as well as workflow edits',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/test01-live-content-journeys.yml',import.meta.url),'utf8');
  assert.match(yaml,/branches:\s*\[main\]/);
  assert.match(yaml,/paths:\s*\n\s+- "\.github\/workflows\/test01-live-content-journeys\.yml"\s*\n\s+- "scripts\/test01-live-content-journeys\.mjs"/);
  assert.doesNotMatch(yaml,/^\s+pull_request_target:|^\s+schedule:/m);
  assert.match(yaml,/permissions:\s*\n\s+contents: read/);
});
