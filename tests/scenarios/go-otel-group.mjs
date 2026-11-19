import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { goproxy } from '../lib/registries.mjs';

const versions = { 'v1.46.0': daysAgo(120), 'v1.47.0': daysAgo(60) };
const source = { importRoot: 'go.opentelemetry.io/otel', repo: 'open-telemetry/opentelemetry-go' };
const modules = [
  'go.opentelemetry.io/otel',
  'go.opentelemetry.io/otel/metric',
  'go.opentelemetry.io/otel/sdk',
  'go.opentelemetry.io/otel/sdk/metric',
  'go.opentelemetry.io/otel/trace',
];

// The go.opentelemetry.io/otel modules are released together and depend on each
// other, so separate PRs conflict (#344). config:recommended's group:monorepos
// groups every module whose source is github.com/open-telemetry/opentelemetry-go,
// including nested modules such as otel/sdk/metric, without a custom group.
export default {
  description: 'groups all go.opentelemetry.io/otel modules into one PR with the monorepo preset',
  github: {
    'open-telemetry/opentelemetry-go': {
      tags: [
        { name: 'v1.46.0', sha: sha('otel-v1.46.0'), date: versions['v1.46.0'] },
        { name: 'v1.47.0', sha: sha('otel-v1.47.0'), date: versions['v1.47.0'] },
      ],
    },
  },
  http: Object.assign({}, ...modules.map((module) => goproxy(module, versions, source))),
  files: {
    'go.mod': dedent`
      module github.com/coopnorge/example

      require (
      	go.opentelemetry.io/otel v1.46.0
      	go.opentelemetry.io/otel/metric v1.46.0
      	go.opentelemetry.io/otel/sdk v1.46.0
      	go.opentelemetry.io/otel/sdk/metric v1.46.0
      	go.opentelemetry.io/otel/trace v1.46.0
      )
    `,
  },
  branches: {
    'renovate/opentelemetry-go-monorepo': {
      changes: {
        'go.mod': [
          '-\tgo.opentelemetry.io/otel v1.46.0',
          '-\tgo.opentelemetry.io/otel/metric v1.46.0',
          '-\tgo.opentelemetry.io/otel/sdk v1.46.0',
          '-\tgo.opentelemetry.io/otel/sdk/metric v1.46.0',
          '-\tgo.opentelemetry.io/otel/trace v1.46.0',
          '+\tgo.opentelemetry.io/otel v1.47.0',
          '+\tgo.opentelemetry.io/otel/metric v1.47.0',
          '+\tgo.opentelemetry.io/otel/sdk v1.47.0',
          '+\tgo.opentelemetry.io/otel/sdk/metric v1.47.0',
          '+\tgo.opentelemetry.io/otel/trace v1.47.0',
        ],
      },
      pr: { title: 'chore(deps): update opentelemetry-go monorepo to v1.47.0', state: 'merged' },
    },
  },
};
