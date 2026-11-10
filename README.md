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
