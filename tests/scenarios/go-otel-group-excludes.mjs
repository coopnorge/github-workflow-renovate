import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { goproxy } from '../lib/registries/go.mjs';

const old = daysAgo(120);
const recent = daysAgo(60);

// The opentelemetry-go monorepo group only has modules from that repository.
// Modules that are versioned and released separately, even under the same
// go.opentelemetry.io domain, and unrelated modules stay out of it. contrib has
// its own opentelemetry-go-contrib monorepo group.
export default {
  description: 'keeps other go modules out of the opentelemetry-go monorepo group',
  github: {
    'open-telemetry/opentelemetry-go': {
      tags: [{ name: 'v1.47.0', sha: sha('otel-v1.47.0'), date: recent }],
    },
    'open-telemetry/opentelemetry-go-contrib': {
      tags: [{ name: 'v0.73.0', sha: sha('contrib-v0.73.0'), date: recent }],
    },
    'open-telemetry/opentelemetry-proto-go': {
      tags: [{ name: 'v1.12.0', sha: sha('proto-v1.12.0'), date: recent }],
    },
    'google/uuid': {
      tags: [{ name: 'v1.7.0', sha: sha('uuid-v1.7.0'), date: recent }],
    },
  },
  http: {
    ...goproxy('go.opentelemetry.io/otel', { 'v1.46.0': old, 'v1.47.0': recent }, {
      repo: 'open-telemetry/opentelemetry-go',
    }),
    ...goproxy('go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp', { 'v0.72.0': old, 'v0.73.0': recent }, {
      importRoot: 'go.opentelemetry.io/contrib',
      repo: 'open-telemetry/opentelemetry-go-contrib',
    }),
    ...goproxy('go.opentelemetry.io/proto/otlp', { 'v1.11.0': old, 'v1.12.0': recent }, {
      repo: 'open-telemetry/opentelemetry-proto-go',
    }),
    ...goproxy('github.com/google/uuid', { 'v1.6.0': old, 'v1.7.0': recent }, {
      repo: 'google/uuid',
    }),
  },
  files: {
    'go.mod': dedent`
      module github.com/coopnorge/example

      require (
      	github.com/google/uuid v1.6.0
      	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.72.0
      	go.opentelemetry.io/otel v1.46.0
      	go.opentelemetry.io/proto/otlp v1.11.0
      )
    `,
  },
  branches: {
    'renovate/opentelemetry-go-monorepo': {
      changes: {
        'go.mod': [
          '-\tgo.opentelemetry.io/otel v1.46.0',
          '+\tgo.opentelemetry.io/otel v1.47.0',
        ],
      },
      pr: { state: 'merged' },
    },
    'renovate/opentelemetry-go-contrib-monorepo': {
      changes: {
        'go.mod': [
          '-\tgo.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.72.0',
          '+\tgo.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.73.0',
        ],
      },
      pr: { state: 'merged' },
    },
    'renovate/go.opentelemetry.io-proto-otlp-1.x': {
      changes: {
        'go.mod': [
          '-\tgo.opentelemetry.io/proto/otlp v1.11.0',
          '+\tgo.opentelemetry.io/proto/otlp v1.12.0',
        ],
      },
      pr: { state: 'merged' },
    },
    'renovate/github.com-google-uuid-1.x': {
      changes: {
        'go.mod': [
          '-\tgithub.com/google/uuid v1.6.0',
          '+\tgithub.com/google/uuid v1.7.0',
        ],
      },
      pr: { state: 'merged' },
    },
  },
};
