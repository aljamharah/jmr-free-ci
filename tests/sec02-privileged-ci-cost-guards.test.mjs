import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const path = name => new URL('../.github/workflows/' + name, import.meta.url);
const load = name => readFileSync(path(name), 'utf8');
const modelProbe = load('jmr-production-three-prompt-quality-probe.yml');

test('SEC-02: real Production AI quality probe cannot consume quota on push, PR, or schedule', () => {
  assert.match(modelProbe, /^on:\s*\n\s+workflow_dispatch:\s*$/m);
  assert.doesNotMatch(modelProbe, /^\s+(?:push|pull_request|pull_request_target|schedule|repository_dispatch):/m);
  assert.match(modelProbe, /github\.actor == 'aljamharah'/);
  assert.match(modelProbe, /github\.ref == 'refs\/heads\/main'/);
  assert.match(modelProbe, /github\.event_name == 'workflow_dispatch'/);
  assert.match(modelProbe, /permissions:\s*\n\s+contents: read/);
  assert.match(modelProbe, /const endpoint='https:\/\/aljamharah\.pages\.dev\/api\/jmr'/);
  assert.match(modelProbe, /method:'POST'/);
});

test('SEC-02: sensitive workflows cannot run in pull_request_target context', () => {
  for (const file of [
    'private-source-validation.yml',
    'private-pr-premerge-gate.yml',
    'production-release-gate.yml',
    'cloudflare-connect-readonly.yml',
    'sec01-historical-preview-access-coverage.yml',
    'jmr-production-three-prompt-quality-probe.yml'
  ]) {
    const yml = load(file);
    assert.doesNotMatch(yml, /^\s*pull_request_target:/m, file);
    assert.doesNotMatch(yml, /^\s*permissions:\s*write-all\s*$/m, file);
    assert.match(yml, /^permissions:\s*\n\s+contents: read\s*$/m, file);
  }
});

test('SEC-02: private source cannot be exposed as an artifact by privileged checks', () => {
  for (const file of ['private-source-validation.yml', 'private-pr-premerge-gate.yml']) {
    const yml = load(file);
    assert.doesNotMatch(yml, /uses:\s*actions\/upload-artifact@/i, file);
    assert.match(yml, /persist-credentials: false/, file);
    assert.match(yml, /secrets\.JMR_PRIVATE_REPO_READ_TOKEN/, file);
  }
  const yml = load('private-source-validation.yml');
  assert.match(yml, /github\.actor == 'aljamharah' && github\.ref == 'refs\/heads\/main'/);
  assert.match(yml, /inputs\.run_semantic_live_checks/);
});
