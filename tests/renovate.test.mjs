// End-to-end regression tests for renovate.yaml and the presets in this repository.
//
// Each file in ./scenarios describes a repository (its files), the GitHub data
// Renovate sees for its dependencies, and the branches/PRs Renovate must create.
// Renovate runs the way .github/workflows/renovate.yaml runs it. See
// docs/index.md ("Regression tests") for details.
import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  Gitea, ensureImage, outputDir, readPresets, readSourceFile, removeScenarioVolume, runRenovate,
  sourceRef, testsDir, workflowPath,
} from './lib/harness.mjs';
import { resolveWorkflow } from './lib/workflow.mjs';

const execFile = promisify(execFileCb);

// The configuration from docs/index.md that consumer repositories use.
const DEFAULT_RENOVATE_CONFIG = `${JSON.stringify({
  $schema: 'https://docs.renovatebot.com/renovate-schema.json',
  extends: ['github>coopnorge/github-workflow-renovate'],
}, null, 2)}\n`;

const scenariosDir = join(testsDir, 'scenarios');
const only = process.env.RENOVATE_TEST_SCENARIO?.split(',').filter(Boolean);
const scenarios = [];
for (const file of (await readdir(scenariosDir)).filter((f) => f.endsWith('.mjs')).sort()) {
  const name = file.replace(/\.mjs$/, '');
  if (!only || only.includes(name)) {
    const { default: scenario } = await import(pathToFileURL(join(scenariosDir, file)));
    scenarios.push({ ...scenario, name });
  }
}

const workflowYaml = await readSourceFile(workflowPath);
const presets = await readPresets();
const { image } = resolveWorkflow(workflowYaml, { repository: 'renovate/test' });
const gitea = new Gitea();

before(async () => {
  console.log(`Testing ${workflowPath} and presets from ${sourceRef ?? 'the working tree'} with ${image}`);
  await Promise.all([ensureImage(image), gitea.start()]);
}, { timeout: 900_000 });
after(() => gitea.stop(), { timeout: 120_000 });

function describeProblem(record) {
  const details = [record.depName, record.packageFile, record.branch, record.err?.message]
    .filter(Boolean).join(', ');
  return details ? `${record.msg} (${details})` : record.msg;
}

test('presets pass renovate-config-validator --strict', { timeout: 300_000 }, async () => {
  const dir = join(outputDir, 'config-validator');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(presets)) {
    await writeFile(join(dir, name), content);
  }
  const names = Object.keys(presets).sort();
  try {
    await execFile('docker', [
      'run', '--rm', '--volume', `${dir}:/presets:ro`, '--workdir', '/presets', image,
      'renovate-config-validator', '--strict', '--no-global', ...names,
    ], { maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    assert.fail(`renovate-config-validator found problems:\n${err.stdout}${err.stderr}`);
  }
});

for (const scenario of scenarios) {
  test(`${scenario.name}: ${scenario.description}`, { timeout: 600_000 }, async () => {
    const repository = `renovate/${scenario.name}`;
    const workflow = resolveWorkflow(workflowYaml, { repository, inputs: scenario.workflowInputs });
    const files = { [workflow.configFile]: DEFAULT_RENOVATE_CONFIG, ...scenario.files };
    await rm(join(outputDir, scenario.name), { recursive: true, force: true });
    await gitea.createRepo(scenario.name, files);
    const allowed = scenario.allowedProblems ?? [];

    // Renovate runs repeatedly, like the scheduled workflow, until a run changes
    // nothing. Later runs revisit the branches and PRs of earlier ones: Renovate
    // then re-extracts the updated files from the branch, which catches autoReplace
    // bugs that only show up when a branch is updated. Between runs, the CI of the
    // repository reports on the Renovate branches, so later runs can automerge.
    const minRuns = scenario.runs ?? 2;
    const maxRuns = scenario.runs ?? 6;
    const ci = scenario.ci === undefined ? 'success' : scenario.ci;
    const results = [];
    let before = await gitea.snapshot(scenario.name);
    for (let runIndex = 1; runIndex <= maxRuns; runIndex += 1) {
      results.push(await runRenovate({ gitea, workflow, repository, scenario, files, presets, runIndex }));
      const after = await gitea.snapshot(scenario.name);
      if (runIndex >= minRuns && after === before) break;
      if (ci) await gitea.reportCi(scenario.name, ci);
      before = after;
    }
    const runs = results.length;
    if (!process.env.RENOVATE_TEST_KEEP_GITEA) await removeScenarioVolume(scenario);
    const actual = await gitea.collect(scenario.name);
    const resultFile = join(outputDir, scenario.name, 'result.json');
    await writeFile(resultFile, `${JSON.stringify(actual, null, 2)}\n`);

    // Every check runs, and all failures are reported together, so a failing
    // scenario shows the wrong branches as well as the warnings that explain them.
    const failures = [];
    const check = (fn) => {
      try {
        fn();
      } catch (err) {
        failures.push(err.message);
      }
    };

    const expected = scenario.branches ?? {};
    check(() => assert.deepEqual(
      Object.fromEntries(Object.entries(actual).map(([b, a]) => [b, a.changes])),
      Object.fromEntries(Object.entries(expected).map(([b, e]) => [b, e.changes])),
      `Renovate branches and their changes (file -> removed/added lines) do not match. Actual result: ${resultFile}`,
    ));

    for (const [branch, { pr }] of Object.entries(expected)) {
      const actualPr = actual[branch]?.pr;
      if (pr === undefined || actualPr === undefined) continue;
      if (pr === null) {
        check(() => assert.equal(actualPr, null, `Expected no PR for ${branch}`));
        continue;
      }
      if (!actualPr) {
        failures.push(`Expected a PR for ${branch}`);
        continue;
      }
      for (const field of ['title', 'state']) {
        if (pr[field] !== undefined) {
          check(() => assert.equal(actualPr[field], pr[field], `PR ${field} of ${branch}`));
        }
      }
      for (const text of pr.bodyIncludes ?? []) {
        check(() => assert.ok(actualPr.body.includes(text), `PR body of ${branch} should include:\n${text}\n\nBody:\n${actualPr.body}`));
      }
      for (const text of pr.bodyExcludes ?? []) {
        check(() => assert.ok(!actualPr.body.includes(text), `PR body of ${branch} should not include:\n${text}\n\nBody:\n${actualPr.body}`));
      }
    }

    for (const [index, result] of results.entries()) {
      const context = `Renovate run ${index + 1}/${runs}, full log: ${result.logFile}`;
      check(() => assert.equal(result.exitCode, 0, `Renovate failed (${context})`));
      const problems = result.problems
        .filter((record) => !allowed.some((re) => re.test(record.msg)))
        .map(describeProblem);
      check(() => assert.deepEqual(problems, [], `Renovate logged warnings or errors (${context})`));
      check(() => assert.deepEqual(result.unmatched, [], `Requests without mock data, add them to the scenario's \`github\` or \`http\` (${context})`));
    }

    if (failures.length) {
      assert.fail(`${failures.length} check(s) failed:\n\n${failures.join('\n\n')}`);
    }
  });
}
