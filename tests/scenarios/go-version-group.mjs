import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { dockerHubImage, golangReleases, imageDigest } from '../lib/registries.mjs';

const released = { '1.27.2': daysAgo(60), '1.27.3': daysAgo(30) };

// A new Go version updates the go directive in go.mod (go.json5 bumps it) and the
// golang image in Dockerfiles. They are separate PRs. Builds use
// GOTOOLCHAIN=local, so if the go.mod PR is merged first, it requires a newer Go
// than the image has, and the build fails.
export default {
  description: 'updates the go directive and the golang image in separate PRs',
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
    'renovate/go-1.x': {
      changes: {
        'go.mod': ['-go 1.27.2', '+go 1.27.3'],
      },
      pr: { title: 'chore(deps): update go module directive to v1.27.3', state: 'merged' },
    },
    'renovate/golang-1.x': {
      changes: {
        Dockerfile: [
          `-FROM golang:1.27.2@${imageDigest('golang:1.27.2')} AS build`,
          `+FROM golang:1.27.3@${imageDigest('golang:1.27.3')} AS build`,
        ],
      },
      pr: { title: 'chore(deps): update golang docker tag to v1.27.3', state: 'merged' },
    },
  },
};
