// Fast checks (no Docker) of how the tests read .github/workflows/renovate.yaml.
// The end-to-end tests in renovate.test.mjs run Renovate with this result.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readSourceFile, workflowPath } from './lib/harness.mjs';
import { evaluateExpression, interpolate, MOCK_GITHUB_TOKEN, resolveWorkflow } from './lib/workflow.mjs';

const workflowYaml = await readSourceFile(workflowPath);

describe('workflow expressions', () => {
  const context = {
    env: { SET: 'from-env', EMPTY: '' },
    inputs: { enabled: true, disabled: false },
  };

  test('evaluates || and && like GitHub Actions', () => {
    assert.equal(evaluateExpression(" env.EMPTY || 'fallback' ", context), 'fallback');
    assert.equal(evaluateExpression(" env.SET || 'fallback' ", context), 'from-env');
    assert.equal(evaluateExpression(' env.MISSING || env.SET ', context), 'from-env');
    assert.equal(evaluateExpression(" inputs.enabled && 'yes' || 'no' ", context), 'yes');
    assert.equal(evaluateExpression(" inputs.disabled && 'yes' || 'no' ", context), 'no');
    assert.equal(evaluateExpression(" 'it''s' ", context), "it's");
  });

  test('interpolates values', () => {
    assert.equal(interpolate('a-${{ env.SET }}-b', context), 'a-from-env-b');
    assert.equal(interpolate('${{ inputs.disabled }}', context), '');
  });

  test('rejects unsupported expressions instead of guessing', () => {
    assert.throws(() => evaluateExpression("contains(env.SET, 'x')", context), /Unsupported workflow expression/);
    assert.throws(() => evaluateExpression('job.workflow_ref', context), /Unsupported workflow context/);
  });
});

describe(workflowPath, () => {
  const repository = 'renovate/example';
  const resolved = resolveWorkflow(workflowYaml, { repository });

  test('runs an exact version of the official Renovate image', () => {
    assert.match(resolved.image, /^ghcr\.io\/renovatebot\/renovate:\d+\.\d+\.\d+$/);
  });

  test('uses the documented config file by default', () => {
    assert.equal(resolved.configFile, '.github/renovate.json5');
  });

  test('passes the settings for self-hosted runs to Renovate', () => {
    assert.equal(resolved.env.RENOVATE_REPOSITORIES, repository);
    assert.equal(resolved.env.RENOVATE_ONBOARDING, 'false');
    assert.equal(resolved.env.RENOVATE_GITHUB_COM_TOKEN, MOCK_GITHUB_TOKEN);
    assert.equal(resolved.env.LOG_LEVEL, 'info');
  });

  test('passes extra-env-vars to Renovate', () => {
    const { env } = resolveWorkflow(workflowYaml, {
      repository,
      inputs: { 'extra-env-vars': 'MY_SETTING=a=b\nRENOVATE_PR_HOURLY_LIMIT=7' },
    });
    assert.equal(env.MY_SETTING, 'a=b');
    assert.equal(env.RENOVATE_PR_HOURLY_LIMIT, '7');
  });

  test('does not pass other variables to Renovate', () => {
    assert.equal(resolved.env.GITHUB_ORG, undefined);
    assert.equal(resolved.env.cache_dir, undefined);
  });

  test('rejects inputs the workflow does not have', () => {
    assert.throws(() => resolveWorkflow(workflowYaml, { repository, inputs: { nope: 'x' } }), /no input named "nope"/);
  });
});
