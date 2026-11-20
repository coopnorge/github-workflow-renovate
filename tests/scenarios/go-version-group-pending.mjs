import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { dockerHubImage, golangReleases, imageDigest } from '../lib/registries.mjs';

const released = { '1.27.2': daysAgo(60), '1.27.3': daysAgo(20) };

// Docker Hub dates a tag by its last push, and official images are rebuilt, so
// the golang image can stay younger than minimumReleaseAge after the go.dev
// release date has passed it. The go directive should wait for the image, or the
// build fails with "go.mod requires go >= 1.27.3 (running go 1.27.2;
// GOTOOLCHAIN=local)".
export default {
  description: 'updates the go directive while the golang image is within minimumReleaseAge',
  github: {
    'golang/go': {
      tags: Object.entries(released).map(([version, date]) => ({ name: `go${version}`, sha: sha(`go${version}`), date })),
    },
  },
  http: {
    ...golangReleases(released),
    ...dockerHubImage('golang', {
      '1.27.2': { pushed: daysAgo(40), digest: imageDigest('golang:1.27.2') },
      '1.27.3': { pushed: daysAgo(2), digest: imageDigest('golang:1.27.3') },
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
  // The go directive doesn't wait: go.mod requires Go 1.27.3 while the image
  // still has 1.27.2, so the build fails. The image gets no PR yet.
  branches: {
    'renovate/go-1.x': {
      changes: {
        'go.mod': ['-go 1.27.2', '+go 1.27.3'],
      },
      pr: { title: 'chore(deps): update go module directive to v1.27.3', state: 'merged' },
    },
  },
};
