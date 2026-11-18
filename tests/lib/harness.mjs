import { execFile as execFileCb } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { MOCK_GITHUB_TOKEN } from './workflow.mjs';

const execFile = promisify(execFileCb);

export const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = resolve(testsDir, '..');
export const outputDir = join(testsDir, '.output');
export const workflowPath = '.github/workflows/renovate.yaml';
const composeFile = join(testsDir, 'docker-compose.yaml');

const GITEA_USER = 'renovate';
const GITEA_PASSWORD = 'renovate-test-password';
const LOG_LEVEL_WARN = 40;

/**
 * The workflow and presets under test come from the working tree, or from a git
 * ref (commit, branch, tag) when RENOVATE_TEST_REF is set.
 */
export const sourceRef = process.env.RENOVATE_TEST_REF || null;

export async function readSourceFile(path) {
  if (sourceRef) {
    const { stdout } = await execFile('git', ['show', `${sourceRef}:${path}`], {
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  }
  return readFile(join(repoRoot, path), 'utf8');
}

// Keep the user's git and Renovate settings (signing, tokens, ...) out of the tests.
const isolatedHome = await mkdtemp(join(tmpdir(), 'renovate-test-home-'));
process.on('exit', () => rmSync(isolatedHome, { recursive: true, force: true }));
// Renovate does not pass GIT_CONFIG_NOSYSTEM on to git, so the system gitconfig is
// still read. An empty helper clears helpers such as osxkeychain from it, so the
// throwaway Gitea token is never stored in the OS keychain.
await writeFile(join(isolatedHome, '.gitconfig'), '[credential]\n\thelper =\n');
const baseEnv = {
  PATH: process.env.PATH,
  HOME: isolatedHome,
  TMPDIR: tmpdir(),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C.UTF-8',
};

async function run(cmd, args, options = {}) {
  return execFile(cmd, args, {
    maxBuffer: 256 * 1024 * 1024,
    ...options,
    env: { ...baseEnv, ...options.env },
  });
}

// Docker and npm need the real environment (CLI plugins, DOCKER_HOST, npm registry config).
async function compose(...args) {
  return execFile('docker', ['compose', '-f', composeFile, ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function git(cwd, ...args) {
  const { stdout } = await run('git', args, { cwd });
  return stdout;
}

/** Deterministic fake commit SHA, so expectations can refer to it by label. */
export function sha(label) {
  return createHash('sha1').update(label).digest('hex');
}

/** ISO timestamp `days` days before now. */
export function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Template tag that strips the common leading indentation, for inline file contents. */
export function dedent(strings, ...values) {
  const text = String.raw({ raw: strings }, ...values).replace(/^\n/, '');
  const lines = text.split('\n');
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length),
  );
  return lines.map((l) => l.slice(indent)).join('\n').replace(/[ \t]+$/, '');
}

/**
 * Pulls the Renovate image used by the workflow, unless it is already present.
 * The tests run Renovate in that image so that git and the other tools Renovate
 * calls are the same versions as in production.
 */
export async function ensureImage(image) {
  try {
    await execFile('docker', ['image', 'inspect', image]);
  } catch {
    await execFile('docker', ['pull', '-q', image], { maxBuffer: 16 * 1024 * 1024 });
  }
}

/** Preset files (`*.json`, `*.json5` in the repository root) of the version under test. */
export async function readPresets() {
  const names = sourceRef
    ? (await execFile('git', ['ls-tree', '--name-only', sourceRef], { cwd: repoRoot })).stdout.split('\n')
    : await readdir(repoRoot);
  const presets = {};
  for (const name of names.filter((n) => /\.json5?$/.test(n))) {
    presets[name] = await readSourceFile(name);
  }
  return presets;
}

export class Gitea {
  /** URL for the harness, on the host. */
  url;
  /** URL for Renovate, inside the compose network. */
  internalUrl = 'http://gitea:3000';
  network;
  token;

  async start() {
    await compose('up', '-d', '--wait');
    const { stdout } = await compose('port', 'gitea', '3000');
    this.url = `http://${stdout.trim()}`;
    const { stdout: id } = await compose('ps', '-q', 'gitea');
    const { stdout: networks } = await execFile('docker', [
      'inspect', '--format', '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}', id.trim(),
    ]);
    this.network = networks.trim().split(' ')[0];
    await compose(
      'exec', '-T', 'gitea', 'gitea', 'admin', 'user', 'create', '--admin',
      '--username', GITEA_USER, '--password', GITEA_PASSWORD,
      '--email', 'renovate@example.com', '--must-change-password=false',
    ).catch((err) => {
      if (!String(err.stderr).includes('already exists')) throw err;
    });
    const basic = Buffer.from(`${GITEA_USER}:${GITEA_PASSWORD}`).toString('base64');
    const res = await fetch(`${this.url}/api/v1/users/${GITEA_USER}/tokens`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `test-${randomBytes(4).toString('hex')}`, scopes: ['all'] }),
    });
    if (!res.ok) throw new Error(`Could not create Gitea token: ${res.status} ${await res.text()}`);
    this.token = (await res.json()).sha1;
  }

  async stop() {
    if (!process.env.RENOVATE_TEST_KEEP_GITEA) {
      await compose('down', '-v', '--remove-orphans');
    }
  }

  async api(method, path, body) {
    const res = await fetch(`${this.url}/api/v1${path}`, {
      method,
      headers: { authorization: `token ${this.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
      throw new Error(`Gitea ${method} ${path}: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 || method === 'DELETE' ? null : res.json();
  }

  gitUrl(repo) {
    const url = new URL(`${this.url}/${GITEA_USER}/${repo}.git`);
    url.username = GITEA_USER;
    url.password = this.token;
    return url.toString();
  }

  /** (Re)creates `renovate/<name>` with one commit on main holding `files`. */
  async createRepo(name, files) {
    await this.api('DELETE', `/repos/${GITEA_USER}/${name}`);
    await this.api('POST', '/user/repos', { name, default_branch: 'main', auto_init: false });
    const dir = await mkdtemp(join(tmpdir(), `renovate-test-${name}-`));
    try {
      await git(dir, 'init', '-q', '-b', 'main');
      for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(dir, path)), { recursive: true });
        await writeFile(join(dir, path), content);
      }
      await git(dir, 'add', '-A');
      await git(dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com',
        'commit', '-q', '-m', 'chore: initial commit');
      await git(dir, 'push', '-q', this.gitUrl(name), 'main');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    return `${GITEA_USER}/${name}`;
  }

  /** Branch heads and PR states, to tell whether a Renovate run changed anything. */
  async snapshot(name) {
    const branches = await this.api('GET', `/repos/${GITEA_USER}/${name}/branches?limit=50`);
    const pulls = await this.api('GET', `/repos/${GITEA_USER}/${name}/pulls?state=all&limit=50`);
    return JSON.stringify([
      branches.map((b) => `${b.name}@${b.commit.id}`).sort(),
      pulls.map((p) => `#${p.number} ${p.state} ${p.merged} ${p.title} ${p.updated_at}`).sort(),
    ]);
  }

  /**
   * Stands in for the CI of the repository: reports `state` as a commit status on
   * the head of every Renovate branch, so the next run can automerge.
   */
  async reportCi(name, state) {
    const branches = await this.api('GET', `/repos/${GITEA_USER}/${name}/branches?limit=50`);
    for (const branch of branches.filter((b) => b.name.startsWith('renovate/'))) {
      await this.api('POST', `/repos/${GITEA_USER}/${name}/statuses/${branch.commit.id}`, {
        state,
        context: 'ci/test',
        description: 'Reported by the test harness',
      });
    }
  }

  /**
   * Every Renovate branch with its changes and PR. A PR's changes are taken from
   * its head ref, so they are still available after the PR was automerged.
   */
  async collect(name) {
    const dir = await mkdtemp(join(tmpdir(), `renovate-test-${name}-clone-`));
    try {
      await git(dir, 'clone', '-q', this.gitUrl(name), '.');
      await git(dir, 'fetch', '-q', 'origin', '+refs/pull/*/head:refs/remotes/pull/*');
      const result = {};
      const pulls = await this.api('GET', `/repos/${GITEA_USER}/${name}/pulls?state=all&limit=50`);
      for (const pr of pulls) {
        const diff = await git(dir, 'diff', '-U0', '--no-color', '--no-renames', pr.merge_base, `refs/remotes/pull/${pr.number}`);
        // head.ref becomes refs/pull/N/head once the branch is deleted after merge.
        result[pr.head.label] = {
          changes: parseDiff(diff),
          pr: { title: pr.title, state: pr.merged ? 'merged' : pr.state, body: pr.body ?? '' },
        };
      }
      const branches = (await git(dir, 'for-each-ref', '--format=%(refname:strip=3)', 'refs/remotes/origin/renovate/'))
        .split('\n').filter(Boolean);
      for (const branch of branches.filter((b) => !result[b])) {
        const diff = await git(dir, 'diff', '-U0', '--no-color', '--no-renames', `origin/main...origin/${branch}`);
        result[branch] = { changes: parseDiff(diff), pr: null };
      }
      return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** Turns `git diff -U0` output into `{ path: ['-old line', '+new line', ...] }`. */
export function parseDiff(diff) {
  const files = {};
  let current;
  let oldPath;
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) {
      oldPath = line === '--- /dev/null' ? null : line.slice(6);
    } else if (line.startsWith('+++ ')) {
      current = line === '+++ /dev/null' ? oldPath : line.slice(6);
      files[current] = [];
    } else if (current && (line.startsWith('+') || line.startsWith('-'))) {
      files[current].push(line);
    }
  }
  return files;
}

/**
 * Runs Renovate once against `repository` on Gitea the way renovate.yaml runs it:
 * the same image, global config file and environment, started like
 * renovatebot/github-action starts it. GitHub is replaced by the scenario mocks.
 *
 * /tmp/renovate is a Docker volume per scenario. Before each run everything but
 * the repository cache is removed from it, so each run starts from a fresh clone
 * and only the repository cache is kept, like the workflow does with actions/cache.
 */
export async function runRenovate({ gitea, workflow, repository, scenario, files, presets, runIndex }) {
  const scenarioOutput = join(outputDir, scenario.name);
  const inputDir = join(scenarioOutput, `run-${runIndex}.input`);
  await rm(inputDir, { recursive: true, force: true });
  await mkdir(inputDir, { recursive: true });
  const volume = `renovate-test-${scenario.name}`;
  if (runIndex === 1) await execFile('docker', ['volume', 'rm', '-f', volume]);

  // Offline vulnerability database: one `<ecosystem>.nedb` file of OSV records
  // (one JSON object per line) per ecosystem in the scenario's `osv`.
  await mkdir(join(inputDir, 'osv'));
  for (const [ecosystem, advisories] of Object.entries(scenario.osv ?? {})) {
    await writeFile(
      join(inputDir, 'osv', `${ecosystem.toLowerCase()}.nedb`),
      advisories.map((advisory) => `${JSON.stringify(advisory)}\n`).join(''),
    );
  }

  await writeFile(join(inputDir, 'mock.json'), JSON.stringify({
    presets,
    repos: scenario.github ?? {},
    http: scenario.http ?? {},
    githubToken: MOCK_GITHUB_TOKEN,
    allowedHosts: [new URL(gitea.internalUrl).hostname],
  }));

  // renovatebot/github-action mounts `configurationFile` (a file in the checked out
  // repository) into the container and uses it as the global config file.
  if (files[workflow.configFile] === undefined) {
    throw new Error(`The scenario has no ${workflow.configFile}, which renovate.yaml uses as config file`);
  }
  const configName = basename(workflow.configFile);
  await writeFile(join(inputDir, configName), files[workflow.configFile]);

  const env = {
    ...workflow.env,
    // Replace GitHub with Gitea as the platform hosting the repository.
    RENOVATE_PLATFORM: 'gitea',
    RENOVATE_ENDPOINT: `${gitea.internalUrl}/api/v1/`,
    RENOVATE_TOKEN: gitea.token,
    RENOVATE_GIT_URL: 'endpoint',
    RENOVATE_CONFIG_FILE: `/github-action/${configName}`,
    RENOVATE_LOG_FILE: '',
    // Gitea merges a PR as soon as platform automerge is enabled on it when its
    // checks have already passed, and Renovate's own merge attempt right after it
    // then fails. GitHub refuses that instead, and Renovate merges the PR itself.
    // Without platform automerge, Renovate always merges itself: the same result.
    RENOVATE_PLATFORM_AUTOMERGE: 'false',
    // osvVulnerabilityAlerts downloads a vulnerability database from github.com.
    // Use the advisories of the scenario instead: the tests run offline.
    OSV_OFFLINE_DISABLE_DOWNLOAD: 'true',
    OSV_OFFLINE_ROOT_DIR: '/renovate-test-input/osv',
    LOG_LEVEL: 'debug',
    LOG_FORMAT: 'json',
    FORCE_COLOR: '3',
    NODE_OPTIONS: [workflow.env.NODE_OPTIONS, '--import /renovate-test/lib/network-mock.mjs'].filter(Boolean).join(' '),
    RENOVATE_TEST_MOCK_FILE: '/renovate-test-input/mock.json',
  };
  await writeFile(join(scenarioOutput, `run-${runIndex}.env.json`), `${JSON.stringify(env, null, 2)}\n`);

  const keepCache = workflow.inputs['renovate-cache'] !== 'disabled';
  const prepare = keepCache
    ? `shopt -s dotglob nullglob
       for p in /tmp/renovate/*; do [ "$p" = /tmp/renovate/cache ] || rm -rf "$p"; done
       for p in /tmp/renovate/cache/*; do [ "$p" = /tmp/renovate/cache/renovate ] || rm -rf "$p"; done
       for p in /tmp/renovate/cache/renovate/*; do [ "$p" = /tmp/renovate/cache/renovate/repository ] || rm -rf "$p"; done`
    : 'shopt -s dotglob nullglob; rm -rf /tmp/renovate/*';
  const args = [
    'run', '--rm',
    ...Object.keys(env).flatMap((key) => ['--env', key]),
    '--network', gitea.network,
    '--volume', `${volume}:/tmp/renovate`,
    '--volume', `${join(inputDir, configName)}:/github-action/${configName}:ro`,
    '--volume', `${inputDir}:/renovate-test-input:ro`,
    '--volume', `${testsDir}:/renovate-test:ro`,
    workflow.image,
    'bash', '-c', `${prepare}\nexec renovate`,
  ];

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    ({ stdout, stderr } = await execFile('docker', args, {
      env: { ...process.env, ...env },
      maxBuffer: 256 * 1024 * 1024,
    }));
  } catch (err) {
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
    exitCode = err.code ?? 1;
  }

  const logFile = join(scenarioOutput, `run-${runIndex}.log`);
  await writeFile(logFile, stdout + stderr);
  const records = stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { level: LOG_LEVEL_WARN, msg: `Unparseable log line: ${l}` };
    }
  });
  const unmatched = stderr.split('\n')
    .filter((l) => l.startsWith(UNMATCHED_PREFIX))
    .map((l) => l.slice(UNMATCHED_PREFIX.length));
  return {
    exitCode,
    logFile,
    records,
    problems: records.filter((r) => r.level >= LOG_LEVEL_WARN),
    unmatched,
  };
}

/** Removes the Docker volume that holds a scenario's repository cache. */
export async function removeScenarioVolume(scenario) {
  await execFile('docker', ['volume', 'rm', '-f', `renovate-test-${scenario.name}`]);
}

/** Must match the prefix written by network-mock.mjs. */
const UNMATCHED_PREFIX = 'renovate-test: unmatched request: ';
