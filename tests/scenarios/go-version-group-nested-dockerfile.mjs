import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { dockerHubImage, golangReleases, imageDigest } from '../lib/registries.mjs';

const released = { '1.27.3': daysAgo(60), '1.27.4': daysAgo(30) };

// A golang image written as `golang:...` in a subdirectory, such as a tooling
// image, and the go directive in the root go.mod are updated in separate PRs.
export default {
  description: 'updates a nested golang tooling image and the root go directive in separate PRs',
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
    'renovate/go-1.x': {
      changes: {
        'go.mod': ['-go 1.27.3', '+go 1.27.4'],
      },
      pr: { title: 'chore(deps): update go module directive to v1.27.4', state: 'merged' },
    },
    'renovate/golang-1.x': {
      changes: {
        'internal/devtool/tools.Dockerfile': [
          `-FROM golang:1.27.3@${imageDigest('golang:1.27.3')} AS golang`,
          `+FROM golang:1.27.4@${imageDigest('golang:1.27.4')} AS golang`,
        ],
      },
      pr: { title: 'chore(deps): update golang docker tag to v1.27.4', state: 'merged' },
    },
  },
};
