import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSync, inspectProductionSync } from '../scripts/production_git_sync_audit.mjs';

const ACCOUNT = 'a'.repeat(32);
const CF_SECRET = 'fake-cf-token-not-for-print';
const GH_SECRET = 'fake-gh-token-not-for-print';
const MAIN = 'b'.repeat(40);
const DIFFERENT = 'c'.repeat(40);

const ok = result => ({ ok: true, async json() { return result; } });
const cfPayload = (sha, stage = 'success') =>
  ({ success: true, result: [{
    latest_stage: { status: stage },
    deployment_trigger: { metadata: { commit_hash: sha } },
    url: 'https://private-prod-alias.example'
  }]});

test('synchronization states are explicitly distinguished', () => {
  assert.equal(computeSync({ deployedSha: MAIN, mainSha: MAIN, latestStage: 'success' }), 'up_to_date');
  assert.equal(computeSync({ deployedSha: DIFFERENT, mainSha: MAIN, latestStage: 'success' }), 'not_matching');
  assert.equal(computeSync({ deployedSha: MAIN, mainSha: MAIN, latestStage: 'queued' }), 'matching_commit_unconfirmed');
  assert.equal(computeSync({ deployedSha: undefined, mainSha: MAIN, latestStage: 'success' }), 'unknown');
  assert.equal(computeSync({ deployedSha: MAIN, mainSha: undefined, latestStage: 'success' }), 'unknown');
});

test('read-only test sends exactly two GET calls to fixed API URLs, and prints no secrets', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('cloudflare.com')) return ok(cfPayload(MAIN));
    if (url.includes('api.github.com')) return ok({ sha: MAIN });
    throw Error('Unexpected URL');
  };
  const output = await inspectProductionSync({
    accountId: ACCOUNT, cloudflareToken: CF_SECRET,
    githubReadToken: GH_SECRET, fetchImpl: fakeFetch
  });
  assert.equal(output.production_matches_main, 'up_to_date');
  assert.equal(output.latest_deployment_status, 'success');
  assert.equal(output.cloudflare_writes, 0);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /api\.cloudflare\.com\/client\/v4\/accounts\/a{32}\/pages\/projects\/aljamharah\/deployments\?env=production&per_page=1&page=1$/);
  assert.equal(calls[1].url, 'https://api.github.com/repos/aljamharah/aljamharah/commits/main');
  assert.deepEqual(calls.map(c => c.opts.method), ['GET', 'GET']);
  assert.ok(calls.every(c => c.opts.redirect === 'error'));
  assert.ok(calls.every(c => c.opts.body === undefined));
  const printed = JSON.stringify(output);
  for (const secret of [CF_SECRET, GH_SECRET, ACCOUNT, MAIN, 'private-prod-alias.example']) {
    assert.equal(printed.includes(secret), false);
  }
});

test('mismatch is reported without asserting failure or altering Cloudflare', async () => {
  const output = await inspectProductionSync({
    accountId: ACCOUNT, cloudflareToken: CF_SECRET, githubReadToken: GH_SECRET,
    fetchImpl: async url => ok(url.includes('cloudflare.com') ? cfPayload(DIFFERENT) : { sha: MAIN })
  });
  assert.equal(output.production_matches_main, 'not_matching');
  assert.equal(output.cloudflare_writes, 0);
});

test('invalid account and missing secrets fail before fetching anything', async () => {
  for (const arg of [
    { accountId: '../', cloudflareToken: CF_SECRET, githubReadToken: GH_SECRET },
    { accountId: ACCOUNT, cloudflareToken: '', githubReadToken: GH_SECRET },
    { accountId: ACCOUNT, cloudflareToken: CF_SECRET, githubReadToken: '' }
  ]) {
    await assert.rejects(inspectProductionSync({
      ...arg, fetchImpl: () => { throw Error('No network expected'); }
    }), /Invalid account ID|token missing/);
  }
});

test('Cloudflare errors do not print secret response details', async () => {
  const fake = async () => ({ok: false, status: 403, async json() { return {secret:'DO NOT PRINT'}; }});
  await assert.rejects(inspectProductionSync({
    accountId: ACCOUNT, cloudflareToken: CF_SECRET, githubReadToken: GH_SECRET,
    fetchImpl: fake
  }), /cloudflare returned HTTP 403/);
});
