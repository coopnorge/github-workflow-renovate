// Reads .github/workflows/renovate.yaml and works out how it runs Renovate: the
// Renovate version, the global config file and the environment passed into the
// Renovate container. The tests run Renovate the same way, so a change to the
// workflow is tested together with the presets.
//
// Only the parts of the workflow that change Renovate's behaviour are emulated.
// Steps for cloud credentials, caches and log forwarding are skipped. If the
// workflow is restructured so that a step below can't be found, this module
// throws instead of guessing, and needs to be updated with the workflow.
import YAML from 'yaml';

const RENOVATE_ACTION = 'renovatebot/github-action';
const SUPPORTED_IMAGE = 'ghcr.io/renovatebot/renovate';

/** Values for `${{ steps.* }}` and `${{ secrets.* }}` in the tests. */
export const MOCK_GITHUB_TOKEN = 'mock-github-token';

const TOKEN = /\s*(?:'((?:[^']|'')*)'|(\|\||&&)|(true|false)\b|([A-Za-z_][\w-]*(?:\.[\w-]+)*))/y;

function tokenize(expr) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < expr.trimEnd().length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(expr);
    if (!m) {
      throw new Error(`Unsupported workflow expression \`${expr}\` at "${expr.slice(start)}". Extend tests/lib/workflow.mjs to support it.`);
    }
    if (m[1] !== undefined) tokens.push({ value: m[1].replaceAll("''", "'") });
    else if (m[2]) tokens.push({ op: m[2] });
    else if (m[3]) tokens.push({ value: m[3] === 'true' });
    else tokens.push({ path: m[4] });
  }
  return tokens;
}

function lookup(path, context) {
  const [root, ...keys] = path.split('.');
  if (!(root in context)) {
    throw new Error(`Unsupported workflow context \`${root}\` in \`${path}\`. Extend tests/lib/workflow.mjs to support it.`);
  }
  return keys.reduce((obj, key) => (obj == null ? undefined : obj[key]), context[root]);
}

/** Evaluates a GitHub Actions expression made of literals, context paths, `||` and `&&`. */
export function evaluateExpression(expr, context) {
  const tokens = tokenize(expr);
  let pos = 0;
  const operand = () => {
    const token = tokens[pos++];
    if (!token || token.op) throw new Error(`Unexpected end or operator in \`${expr}\``);
    return token.path ? lookup(token.path, context) : token.value;
  };
  const and = () => {
    let value = operand();
    while (tokens[pos]?.op === '&&') {
      pos += 1;
      const right = operand();
      value = value ? right : value;
    }
    return value;
  };
  let value = and();
  while (tokens[pos]?.op === '||') {
    pos += 1;
    const right = and();
    value = value || right;
  }
  return value;
}

/** Replaces each `${{ ... }}` in a workflow value with its result, as a string. */
export function interpolate(value, context) {
  if (typeof value !== 'string') return value == null ? '' : String(value);
  return value.replace(/\$\{\{(.*?)\}\}/g, (_, expr) => {
    const result = evaluateExpression(expr, context);
    return result == null || result === false ? '' : String(result);
  });
}

function findStep(steps, description, predicate) {
  const step = steps.find(predicate);
  if (!step) {
    throw new Error(`Could not find the ${description} step in renovate.yaml. Update tests/lib/workflow.mjs to match the workflow.`);
  }
  return step;
}

/**
 * Works out how the workflow would run Renovate for `repository`.
 *
 * @param {string} workflowYaml content of .github/workflows/renovate.yaml
 * @param {{ repository: string, inputs?: Record<string, unknown> }} options
 *   `inputs` are the `with:` values a consumer passes to the reusable workflow.
 */
export function resolveWorkflow(workflowYaml, { repository, inputs = {} }) {
  const workflow = YAML.parse(workflowYaml);
  const inputDefs = workflow.on?.workflow_call?.inputs ?? {};
  for (const name of Object.keys(inputs)) {
    if (!(name in inputDefs)) throw new Error(`renovate.yaml has no input named "${name}"`);
  }
  const resolvedInputs = Object.fromEntries(Object.entries(inputDefs).map(([name, def]) => [
    name,
    inputs[name] ?? def.default ?? (def.type === 'boolean' ? false : ''),
  ]));

  const jobs = Object.values(workflow.jobs ?? {});
  if (jobs.length !== 1) throw new Error(`Expected one job in renovate.yaml, found ${jobs.length}`);
  const job = jobs[0];
  const steps = job.steps ?? [];

  const context = {
    env: {},
    inputs: resolvedInputs,
    secrets: {},
    vars: {},
    github: { repository, event_name: 'workflow_dispatch', run_id: '1', run_attempt: '1' },
    steps: { get_github_token: { outputs: { token: MOCK_GITHUB_TOKEN } } },
  };
  for (const scope of [workflow.env, job.env]) {
    for (const [key, value] of Object.entries(scope ?? {})) {
      context.env[key] = interpolate(value, context);
    }
  }

  const image = context.env.RENOVATE_IMAGE;
  const version = context.env.RENOVATE_VERSION;
  if (image !== SUPPORTED_IMAGE || !/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw new Error(`Expected RENOVATE_IMAGE=${SUPPORTED_IMAGE} and an exact RENOVATE_VERSION in renovate.yaml, got ${image}:${version}`);
  }

  // "Configure extra environment variables": inputs.extra-env-vars are added to
  // the environment, and their names are added to the env-regex.
  const configEnvStep = findStep(steps, 'env-regex (id: config-env)', (s) => s.id === 'config-env');
  const baseRegex = configEnvStep.run?.match(/BASE_REGEX="([^"]+)"/)?.[1]?.replaceAll('\\\\', '\\');
  if (!baseRegex) throw new Error('Could not find BASE_REGEX in the config-env step of renovate.yaml');
  const extraKeys = [];
  for (const line of String(resolvedInputs['extra-env-vars'] ?? '').split('\n')) {
    if (!line) continue;
    const key = line.split('=')[0];
    context.env[key] = line.slice(key.length + 1);
    if (key) extraKeys.push(key);
  }
  const envRegex = `^(?:${[baseRegex, ...extraKeys].join('|')})$`;
  context.steps['config-env'] = { outputs: { 'env-regex': envRegex } };
  context.steps['renovate-version'] = { outputs: { 'renovate-image': image, 'renovate-version': version } };

  // "Forward env": its env block is written to GITHUB_ENV for the later steps.
  const forwardStep = findStep(steps, 'Forward env', (s) => s.name === 'Forward env');
  const forwarded = { ...context.env };
  for (const [key, value] of Object.entries(forwardStep.env ?? {})) {
    forwarded[key] = interpolate(value, context);
  }

  const renovateStep = findStep(steps, RENOVATE_ACTION, (s) => s.uses?.startsWith(`${RENOVATE_ACTION}@`));
  const actionInputs = Object.fromEntries(Object.entries(renovateStep.with ?? {})
    .map(([key, value]) => [key, interpolate(value, { ...context, env: forwarded })]));
  const regex = new RegExp(actionInputs['env-regex'] || envRegex);

  const renovateImage = actionInputs['renovate-image'] || image;
  const renovateVersion = actionInputs['renovate-version'] || version;
  return {
    image: `${renovateImage}:${renovateVersion}`,
    renovateVersion,
    configFile: actionInputs.configurationFile,
    env: Object.fromEntries(Object.entries(forwarded).filter(([key]) => regex.test(key))),
    inputs: resolvedInputs,
  };
}
