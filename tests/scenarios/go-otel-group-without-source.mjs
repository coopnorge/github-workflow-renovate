import { daysAgo, dedent } from '../lib/harness.mjs';
import { goproxy } from '../lib/registries/go.mjs';

const versions = { 'v1.46.0': daysAgo(120), 'v1.47.0': daysAgo(60) };
const source = { importRoot: 'go.opentelemetry.io/otel', repo: 'open-telemetry/opentelemetry-go' };
const modules = ['go.opentelemetry.io/otel', 'go.opentelemetry.io/otel/sdk', 'go.opentelemetry.io/otel/sdk/metric'];

// The opentelemetry-go monorepo group matches on the source repository, which
// Renovate finds from the `go-import` meta tag at https://<module>?go-get=1. If
// that lookup fails, the modules are not grouped. In production it works: the
// PRs in coopnorge/backstage link to github.com/open-telemetry/opentelemetry-go.
export default {
  description: 'does not group go.opentelemetry.io/otel modules without their source repository',
  http: Object.assign({}, ...modules.map((module) => ({
    ...goproxy(module, versions, source),
    [`https://${module}?go-get=1`]: { status: 404, body: 'not found' },
  }))),
  files: {
    'go.mod': dedent`
      module github.com/coopnorge/example

      require (
      	go.opentelemetry.io/otel v1.46.0
      	go.opentelemetry.io/otel/sdk v1.46.0
      	go.opentelemetry.io/otel/sdk/metric v1.46.0
      )
    `,
  },
  // One PR per module.
  branches: Object.fromEntries(modules.map((module) => [
    `renovate/${module.replaceAll('/', '-')}-1.x`,
    {
      changes: { 'go.mod': [`-\t${module} v1.46.0`, `+\t${module} v1.47.0`] },
      pr: { title: `chore(deps): update module ${module} to v1.47.0`, state: 'merged' },
    },
  ])),
};
