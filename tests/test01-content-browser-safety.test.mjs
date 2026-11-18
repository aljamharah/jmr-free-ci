import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const script=readFileSync(new URL('../scripts/test01-live-content-journeys.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/test01-live-content-journeys.yml',import.meta.url),'utf8');

test('TEST-01 browser journey script is valid Node.js',()=>{
  const p=spawnSync(process.execPath,['--input-type=module','--check'],{input:script,encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
});
test('TEST-01 live browser touches public GET-only and cannot invoke paid JMR AI',()=>{
  assert.match(script,/const BASE = 'https:\/\/aljamharah\.pages\.dev'/);
  assert.match(script,/request\.method\(\)==='GET'/);
  assert.doesNotMatch(script,/method:\s*['"]POST|\/api\/jmr|\.AI\.run|openai\.com|secrets\./);
  assert.match(script,/new Set\(books\.map\(b => b\.id\)\)/);
  assert.match(script,/for \(const entry of books\)/);
  assert.match(script,/for \(const width of \[390,1280\]\)/);
  assert.match(script,/removeDiacritics/);
  assert.match(script,/waqf-reader-frame/);
});
test('TEST-01 workflow has no broad push trigger and no excessive token permissions',()=>{
  assert.match(workflow,/push:\s*\n\s+branches: \[main\]\s*\n\s+paths:/);
  assert.match(workflow,/\.github\/workflows\/test01-live-content-journeys\.yml/);
  assert.match(workflow,/^permissions:\s*\n\s+contents: read/m);
  assert.match(workflow,/persist-credentials: false/);
  assert.doesNotMatch(workflow,/pull_request_target:|write-all|secrets\.|permissions:\s*write/);
  assert.match(workflow,/github\.repository == 'aljamharah\/jmr-free-ci'/);
});
