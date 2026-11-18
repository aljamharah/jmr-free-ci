import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const yaml=readFileSync(new URL('../.github/workflows/jmr-production-rate-limit-malformed-burst.yml',import.meta.url),'utf8');
const snippet=yaml.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s+NODE/);

test('OPS-01: bounded production probe never calls the model or sends user prompts',()=>{
  assert.match(yaml,/permissions:\s*\n\s+contents: read/);
  assert.match(yaml,/branches:\s*\[main\]/);
  assert.match(yaml,/paths:\s*\n\s+- "\.github\/workflows\/jmr-production-rate-limit-malformed-burst\.yml"/);
  assert.doesNotMatch(yaml,/^\s*pull_request_target:/m);
  assert.ok(snippet,'expected one inline Node module');
  const source=snippet[1];
  assert.match(source,/const requests=20;/);
  assert.match(source,/body:'\{invalid-json'/);
  assert.match(source,/method:'POST'/);
  assert.match(source,/before\.status!==405/);
  assert.match(source,/counts\.bad_json_400!==12/);
  assert.match(source,/counts\.limited_429!==8/);
  assert.match(source,/counts\.unavailable_503!==0/);
  assert.match(source,/counts\['429_limit_stage'\]!==8/);
  assert.match(source,/reset\.status!==400/);
  assert.match(source,/const msRemaining=60000-/);
  assert.match(source,/sameMinute/);
  assert.doesNotMatch(source,/env\.AI\.run|AI\.run|openai\.com|Bearer |Authorization:|secrets\./);
});

test('OPS-01: no-model production probe inline JavaScript passes syntax validation',()=>{
  assert.ok(snippet);
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:snippet[1],encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('OPS-01: production result is aggregate-only and makes limited scope explicit',()=>{
  assert.match(yaml,/GITHUB_STEP_SUMMARY/);
  assert.match(yaml,/single GitHub runner IP/);
  assert.match(yaml,/new_minute_reset_400:true/);
  assert.match(yaml,/no_model_calls:true/);
  assert.doesNotMatch(yaml,/console\.log\([^)]*(?:CF-Connecting-IP|secret|token)/);
});
