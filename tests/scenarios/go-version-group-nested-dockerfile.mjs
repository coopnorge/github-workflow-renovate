import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { dockerHubImage, imageDigest } from '../lib/registries/docker.mjs';
import { golangReleases } from '../lib/registries/go.mjs';

const released = { '1.27.3': daysAgo(60), '1.27.4': daysAgo(30) };

// The go version group in go.json5 applies to the whole repository: a golang
// image in a subdirectory, such as a tooling image, is updated in the same PR
// as the go directive in the root go.mod.
export default {
  description: 'groups a nested golang tooling image with the root go directive',
  github: {
    'golang/go': {
      tags: Object.entries(released).map(([version, date]) => ({ name: `go${version}`, sha: sha(`go${version}`), date })),
    },
  },
  http: {
    ...golangReleases(released),
    ...dockerHubImage('golang', {
      '1.27.3': { pushed: daysAgo(40), digest: imageDigest('golang:1.27.3') },
      '1.27.4': { pushed: daysAgo(20), digest: imageDigest('golang:1.27.4') },
    }),
  },
  files: {
    'go.mod': dedent`
      module github.com/coopnorge/example

      go 1.27.3
    `,
    'internal/devtool/tools.Dockerfile': dedent`
      FROM golang:1.27.3@${imageDigest('golang:1.27.3')} AS golang
    `,
  },
  branches: {
    'renovate/go-version': {
      changes: {
        'go.mod': ['-go 1.27.3', '+go 1.27.4'],
        'internal/devtool/tools.Dockerfile': [
          `-FROM golang:1.27.3@${imageDigest('golang:1.27.3')} AS golang`,
          `+FROM golang:1.27.4@${imageDigest('golang:1.27.4')} AS golang`,
        ],
      },
      pr: { title: 'chore(deps): update go version to v1.27.4', state: 'merged' },
    },
  },
};
