import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const yml=readFileSync(new URL('../.github/workflows/j06-all-public-detail-browser-contract-20261117.yml',import.meta.url),'utf8');
test('TEST-01 all-poem detail audit tracks dynamic published catalogue, no stale count assumptions',()=>{
  assert.match(yml,/filter\(p=>p\.publication_status==='published'\)/);
  assert.match(yml,/new Set\(poems\.map\(p=>p\.slug\)\)/);
  assert.doesNotMatch(yml,/assert\.equal\(poems\.length,\s*11\)/);
  assert.match(yml,/for\(const poem of poems\)/);
  assert.match(yml,/for\(const poet of poets\)/);
  assert.match(yml,/request\(\)\.method\(\)|r\.method\(\)==='GET'/);
  assert.doesNotMatch(yml,/^\s*pull_request_target:/m);
  assert.match(yml,/permissions:\s*\n\s+contents: read/);
});
test('TEST-01 all-poem inline browser script has valid ESM syntax',()=>{
  const snippets=[...yml.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s+NODE/g)];
  assert.equal(snippets.length,1);
  const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:snippets[0][1],encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
});
