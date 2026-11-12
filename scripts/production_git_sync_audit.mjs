#!/usr/bin/env node
/**
 * Read-only status of whether Cloudflare Pages production has deployed private
 * aljamharah/aljamharah main. Never prints tokens, commit SHAs, API bodies,
 * deploy URLs, environment bindings, or secrets. Never writes to APIs.
 */
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';

const CF_ROOT = 'https://api.cloudflare.com/client/v4/';
const GH_MAIN = 'https://api.github.com/repos/aljamharah/aljamharah/commits/main';
const shaPattern = /^[0-9a-f]{40}$/i;

function checkInput(value, label) {
  if (typeof value !== 'string' || value.length < 10) throw new Error(label + ' missing');
}

export function computeSync({ deployedSha, mainSha, latestStage }) {
  if (!shaPattern.test(deployedSha ?? '') || !shaPattern.test(mainSha ?? '')) return 'unknown';
  if (deployedSha !== mainSha) return 'not_matching';
  return latestStage === 'success' ? 'up_to_date' : 'matching_commit_unconfirmed';
}

export async function inspectProductionSync({ accountId, cloudflareToken, githubReadToken, fetchImpl = fetch }) {
  if (typeof accountId !== 'string' || !shaPattern.test(accountId)) throw new Error('Invalid account ID');
  checkInput(cloudflareToken, 'Cloudflare read-only token');
  checkInput(githubReadToken, 'Private GitHub read-only token');

  const onlyGet = async (url, authToken, provider) => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer ' + authToken,
          Accept: 'application/json',
          ...(provider === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {})
        },
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new Error(provider + ' unavailable');
    }
    if (!response.ok) throw new Error(provider + ' returned HTTP ' + response.status);
    const body = await response.json();
    if (provider === 'cloudflare') {
      if (body?.success !== true || !Array.isArray(body.result)) throw new Error('Invalid Cloudflare response');
      return body.result;
    }
    if (typeof body?.sha !== 'string') throw new Error('Invalid GitHub response');
    return body;
  };

  const cfDeployments = await onlyGet(
    CF_ROOT + 'accounts/' + accountId + '/pages/projects/aljamharah/deployments?env=production&per_page=1&page=1',
    cloudflareToken, 'cloudflare'
  );
  const latest = cfDeployments[0] ?? null;
  const githubMain = await onlyGet(GH_MAIN, githubReadToken, 'github');

  const stage = latest?.latest_stage?.status;
  const latestStage = ['success', 'failure', 'active', 'queued', 'canceled', 'skipped', 'idle'].includes(stage)
    ? stage : 'not_reported';
  const deployedSha = latest?.deployment_trigger?.metadata?.commit_hash;
  return Object.freeze({
    project: 'aljamharah',
    environment: 'production',
    latest_deployment_status: latestStage,
    production_matches_main: computeSync({ deployedSha, mainSha: githubMain.sha, latestStage }),
    cloudflare_writes: 0,
    note: 'Read-only, no SHA/token/URL printed. A mismatch might be a build delay or an older successful deployment.'
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectProductionSync({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      cloudflareToken: process.env.ALJAMHARAH_CF_READ_TOKEN,
      githubReadToken: process.env.JMR_PRIVATE_REPO_READ_TOKEN
    });
    console.log(JSON.stringify(result, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '## Cloudflare production ↔ GitHub main (GET-only)\n\n' +
        '| Metric | Status |\n|---|---|\n' +
        '| Latest deployment | ' + result.latest_deployment_status + ' |\n' +
        '| Production commit compared with private main | ' + result.production_matches_main + ' |\n' +
        '| Cloudflare changes | 0 |\n\n' +
        'Mismatch is not proof of a failed deployment; investigate before modifying production.\n');
    }
  } catch (error) {
    console.error('Read-only deployment sync check stopped: ' + error.message);
    process.exitCode = 1;
  }
}
