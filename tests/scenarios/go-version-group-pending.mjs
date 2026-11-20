import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { dockerHubImage, golangReleases, imageDigest } from '../lib/registries.mjs';

const released = { '1.27.2': daysAgo(60), '1.27.3': daysAgo(20) };

// Docker Hub dates a tag by its last push, and official images are rebuilt, so
// the golang image can stay younger than minimumReleaseAge after the go.dev
// release date has passed it. The go directive must wait for the image, or the
// build fails with "go.mod requires go >= 1.27.3 (running go 1.27.2;
// GOTOOLCHAIN=local)".
export default {
  description: 'holds the go directive update until the golang image passes minimumReleaseAge',
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
  // The golang image update is still within minimumReleaseAge, so Renovate
  // doesn't create the go version branch yet, and go.mod isn't updated either.
  branches: {},
};
