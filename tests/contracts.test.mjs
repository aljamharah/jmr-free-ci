import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contract = JSON.parse(
  await readFile(new URL("../contracts/jmr-api-contract.json", import.meta.url), "utf8")
);

test("public harness points to the one canonical private repository", () => {
  assert.equal(contract.canonical_repository, "aljamharah/aljamharah");
  assert.equal(contract.visibility_boundary.canonical_source_is_private, true);
});

test("public harness contains no application source, secrets, or production deployment", () => {
  assert.equal(contract.visibility_boundary.public_harness_contains_application_source, false);
  assert.equal(contract.visibility_boundary.public_harness_contains_secrets, false);
  assert.equal(contract.visibility_boundary.public_harness_deploys_production, false);
});

test("JMR response contract requires an answer string", () => {
  assert.ok(contract.response.required_fields.includes("answer"));
  assert.equal(contract.response.answer_type, "string");
  assert.ok(contract.response.optional_fields.includes("sources"));
});

test("Quran safety invariants remain mandatory", () => {
  assert.equal(contract.quran_safety.must_verify_before_attribution, true);
  assert.equal(contract.quran_safety.must_not_attribute_verse_as_poetry, true);
  assert.equal(contract.quran_safety.must_fail_closed_when_canonical_corpus_unavailable, true);
});


test("private-source validation is manual-only, owner-gated, and read-only", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/private-source-validation.yml", import.meta.url),
    "utf8"
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request):/m);
  assert.match(workflow, /if: github\.actor == 'aljamharah' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /Contents: Read-only/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /ref: jmr/preview-rate-limit-2026-11-10/);
  assert.doesNotMatch(workflow, /upload-artifact/);
});
