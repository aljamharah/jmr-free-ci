import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const src=readFileSync(new URL('../scripts/test01-live-content-journeys.mjs',import.meta.url),'utf8');
const wf=readFileSync(new URL('../.github/workflows/test01-live-content-journeys.yml',import.meta.url),'utf8');

test('TEST-01 restricted poems never expose verse lines or copy/print actions',()=>{
  assert.match(src,/restrictedPoems=allPoems\.filter/);
  assert.match(src,/restricted_poem_checks/);
  assert.match(src,/Restricted poem copy\/print controls must not be visible/);
  assert.match(src,/#actions'\)\.isHidden\(\)/);
  assert.match(src,/Restricted poem must not show verse lines/);
  assert.match(src,/النص الكامل غير مستضاف في الجمهرة بعد/);
  assert.match(src,/request\.method\(\)==='GET'/);
  assert.match(src,/url\.origin===BASE/);
  assert.doesNotMatch(src,/env\.AI\.run|openai\.com|Bearer\s/);
});

test('TEST-01 live browser probe syntax remains valid and changes trigger its workflow',()=>{
  const r=spawnSync(process.execPath,['--check'],{input:src,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.match(wf,/scripts\/test01-live-content-journeys\.mjs/);
  assert.match(wf,/permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(wf,/^\s*pull_request_target:/m);
});
