import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/private-source-validation.yml', import.meta.url), 'utf8');

test('deleted preview deployment alias is not used by any live step', () => {
  assert.ok(!yml.includes('https://jmr-preview-rate-limit-2026.aljamharah.pages.dev'));
  assert.match(yml, /preview_url:\s*\n\s*description:/);
  assert.match(yml, /description: "Full verified HTTPS Preview origin only/);
});

test('live preview checks require manual dispatch and vetted input', () => {
  assert.match(yml, /name: Verify manual Preview URL is a trusted aljamharah\.pages\.dev preview origin/);
  assert.match(yml, /\/\^https:\\\/\\\/\[a-z0-9-\]\+\\\.aljamharah\\\.pages\\\.dev\$\//);
  const targetNames = [
    'Check deployed JMR Preview page and API guard',
    'Send one real language question to JMR Preview',
    'Verify live poet retrieval and Quran isolation'
  ];
  for (const name of targetNames) {
    const start = yml.indexOf('      - name: ' + name);
    assert.ok(start > 0, 'missing live test step: ' + name);
    const section = yml.slice(start, start + 410);
    assert.match(section, /if: github\.event_name == 'workflow_dispatch'/, name);
    assert.match(section, /inputs\.preview_url != ''/, name);
    assert.match(section, /\$\{\{ inputs\.preview_url \}\}/, name);
  }
});

test('automatic pushes preserve offline tests while opting out of live Workers AI', () => {
  assert.match(yml, /push:\s*\n\s*branches: \[main\]/);
  assert.match(yml, /name: Run Durable Object concurrency and expiry tests/);
  assert.match(yml, /if: github\.event_name == 'push'/);
});
