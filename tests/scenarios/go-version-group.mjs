import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { dockerHubImage, golangReleases, imageDigest } from '../lib/registries.mjs';

const released = { '1.27.2': daysAgo(60), '1.27.3': daysAgo(30) };

// The go directive in go.mod and the golang image in Dockerfiles are updated
// in one PR. Builds use GOTOOLCHAIN=local, so updating go.mod on its own would
// require a newer Go than the image has, and the build would fail.
export default {
  description: 'updates the go directive and the golang image in one PR',
  github: {
    'golang/go': {
      tags: Object.entries(released).map(([version, date]) => ({ name: `go${version}`, sha: sha(`go${version}`), date })),
    },
  },
  http: {
    ...golangReleases(released),
    ...dockerHubImage('golang', {
      '1.27.2': { pushed: daysAgo(40), digest: imageDigest('golang:1.27.2') },
      '1.27.3': { pushed: daysAgo(20), digest: imageDigest('golang:1.27.3') },
    }),
  },
  files: {
    'go.mod': dedent`
      module github.com/coopnorge/example

      go 1.27.2
    `,
    Dockerfile: dedent`
      FROM golang:1.27.2@${imageDigest('golang:1.27.2')} AS build
      ENV GOTOOLCHAIN=local
    `,
  },
  branches: {
    'renovate/go-version': {
      changes: {
        'go.mod': ['-go 1.27.2', '+go 1.27.3'],
        Dockerfile: [
          `-FROM golang:1.27.2@${imageDigest('golang:1.27.2')} AS build`,
          `+FROM golang:1.27.3@${imageDigest('golang:1.27.3')} AS build`,
        ],
      },
      pr: { title: 'chore(deps): update go version to v1.27.3', state: 'merged' },
    },
  },
};
