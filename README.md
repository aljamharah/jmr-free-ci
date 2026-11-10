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


## Manual validation of the canonical private source

The separate workflow `.github/workflows/private-source-validation.yml` is **manual only** and runs only when the owner `aljamharah` dispatches it from the default `main` branch. It checks out the private repository's `jmr-ai-foundation` branch into the ephemeral hosted runner, runs the real validation suite there, and does not copy the source into this public repository or upload it as an artifact.

### One-time, no-cost setup

1. Create a fine-grained personal access token at https://github.com/settings/personal-access-tokens/new.
2. Set resource owner to `aljamharah`.
3. Choose **Only select repositories** and select only `aljamharah/aljamharah`.
4. Grant **Contents: Read-only**. No write permission is needed.
5. In this public repository, open **Settings → Secrets and variables → Actions → New repository secret**.
6. Name it `JMR_PRIVATE_REPO_READ_TOKEN` and paste the token value. Never put the token in a file, issue, commit, or chat.
7. Open **Actions → Validate private JMR source → Run workflow**.

Security boundary: this privileged workflow has no `push` or `pull_request` trigger. Do not add those triggers. The token is supplied only to the checkout action, credential persistence is disabled, the workflow is limited to the repository owner, and it has read-only repository permissions.

The public contract workflow remains separate and can continue validating the public test harness without any secret.
