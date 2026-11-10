# JMR Free CI

A public, cost-free validation harness for the private Al-Jamhara repository.

## Important boundary

- The canonical application source remains in the private repository: `aljamharah/aljamharah`.
- This repository contains only public test infrastructure and deliberately non-sensitive API contract fixtures.
- It does **not** mirror the private application, copy private source files, contain credentials, or deploy the website.
- Passing these checks validates this public harness and its contract fixtures only. It does not claim that the private application integration tests have passed.

## Current checks

GitHub Actions runs Node.js built-in tests against the public contract fixture. No third-party packages, API keys, paid services, or secrets are required.

## Keeping the project unified

The private repository remains the single source of truth. Any future integration with private source must use a reviewed, read-only mechanism and must never publish private files or secrets into this repository.


## Trusted-owner validation of the canonical private source

The separate workflow `.github/workflows/private-source-validation.yml` runs when the owner `aljamharah` pushes to the default `main` branch, or manually when the owner dispatches it there. It checks out the private repository's isolated Preview integration branch `jmr/preview-rate-limit-2026-11-10` into the ephemeral hosted runner, runs the foundation, Quran, API, rate-limit and Durable Object tests there, checks the deployed Preview page and 11-record poet index, exercises the reviewed Fatir 35:28 Quran attribution path without a model call, performs a no-model greeting smoke request, and does not copy the source into this public repository or upload it as an artifact.

### One-time, no-cost setup

1. Create a fine-grained personal access token at https://github.com/settings/personal-access-tokens/new.
2. Set resource owner to `aljamharah`.
3. Choose **Only select repositories** and select only `aljamharah/aljamharah`.
4. Grant **Contents: Read-only**. No write permission is needed.
5. In this public repository, open **Settings → Secrets and variables → Actions → New repository secret**.
6. Name it `JMR_PRIVATE_REPO_READ_TOKEN` and paste the token value. Never put the token in a file, issue, commit, or chat.
7. The workflow runs automatically on a trusted owner push to `main`; the owner can also open **Actions → Validate private JMR source → Run workflow** for a manual rerun. It tests the isolated Preview integration branch; it does not deploy Cloudflare or change Production.

Security boundary: this privileged workflow has no `pull_request` or `pull_request_target` trigger. The push trigger is restricted to `main` and the job additionally requires `github.actor == 'aljamharah'`. The token is supplied only to the checkout action, credential persistence is disabled, the workflow is limited to the repository owner, and it has read-only repository permissions.

The public contract workflow remains separate and can continue validating the public test harness without any secret.
Every run checks out the current head of the isolated Preview branch at execution time, so the same workflow can validate the latest private changes without publishing them here.


### Optional live semantic checks

The workflow dispatch form has an opt-in checkbox named `run_semantic_live_checks`. Leave it off for routine validation. When enabled, it sends two real model requests to the Preview endpoint: a Mutanabbi biography lookup and a Quran-sensitive question that mentions the poet. This consumes Workers AI request quota. Run it only when Preview has available model quota; a provider-side HTTP 429 means the semantic check could not be completed and is not a passed test. External web search remains controlled by the Preview environment and is not enabled by this workflow.
