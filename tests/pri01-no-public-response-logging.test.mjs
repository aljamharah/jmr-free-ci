import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const flow=readFileSync(new URL('../.github/workflows/private-source-validation.yml',import.meta.url),'utf8');

test('PRI-01: public CI never writes live model answer or raw response to error logs',()=>{
  assert.doesNotMatch(flow,/answer:\s*result\?\.answer/);
  assert.doesNotMatch(flow,/error:\s*result\?\.error/);
  assert.doesNotMatch(flow,/JSON\.stringify\((?:payload|poet\.poet_matches|quran\.poet_matches|quran\.quran_verification)\)/);
  assert.match(flow,/response_details:\s*"suppressed"/);
  assert.match(flow,/response suppressed/);
});

test('PRI-01: live model checks remain explicit and private source not exported',()=>{
  assert.match(flow,/run_semantic_live_checks:\s*\n/);
  assert.match(flow,/if: github\.event_name == 'workflow_dispatch' && inputs\.run_semantic_live_checks/);
  assert.match(flow,/persist-credentials: false/);
  assert.match(flow,/permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(flow,/uses:\s*actions\/upload-artifact@/);
  assert.doesNotMatch(flow,/^\s*pull_request_target:/m);
});
