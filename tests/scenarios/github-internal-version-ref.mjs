import { daysAgo, dedent, sha } from '../lib/harness.mjs';

// #313: floating (@v1) and outdated exact (@v1.3.0) refs of internal coopnorge
// workflows/actions are bumped to the latest exact tag, keeping the path.
export default {
  description: 'bumps internal @vX refs to the latest exact tag',
  github: {
    'coopnorge/github-workflow-shared': {
      tags: [
        { name: 'v1.3.0', sha: sha('shared-v1.3.0'), date: daysAgo(30) },
        { name: 'v1.4.0', sha: sha('shared-v1.4.0'), date: daysAgo(2) },
        { name: 'v1', sha: sha('shared-v1.4.0'), date: daysAgo(2) },
      ],
    },
    'coopnorge/github-action-setup': {
      tags: [
        { name: 'v0.4.0', sha: sha('setup-v0.4.0'), date: daysAgo(40) },
        { name: 'v0.5.1', sha: sha('setup-v0.5.1'), date: daysAgo(3) },
        { name: 'v0', sha: sha('setup-v0.5.1'), date: daysAgo(3) },
      ],
    },
  },
  files: {
    '.github/workflows/ci.yaml': dedent`
      name: CI
      on: push
      jobs:
        build:
          uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@v1
        test:
          runs-on: ubuntu-latest
          steps:
            - uses: coopnorge/github-action-setup@v0
    `,
    '.github/workflows/release.yaml': dedent`
      name: Release
      on: push
      jobs:
        release:
          uses: coopnorge/github-workflow-shared/.github/workflows/release.yaml@v1.3.0
    `,
  },
  branches: {
    'renovate/coopnorge-github-workflow-shared-1.x': {
      changes: {
        '.github/workflows/ci.yaml': [
          '-    uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@v1',
          '+    uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@v1.4.0',
        ],
        '.github/workflows/release.yaml': [
          '-    uses: coopnorge/github-workflow-shared/.github/workflows/release.yaml@v1.3.0',
          '+    uses: coopnorge/github-workflow-shared/.github/workflows/release.yaml@v1.4.0',
        ],
      },
      pr: { title: 'chore(deps): update dependency coopnorge/github-workflow-shared to v1.4.0', state: 'merged' },
    },
    'renovate/coopnorge-github-action-setup-0.x': {
      changes: {
        '.github/workflows/ci.yaml': [
          '-      - uses: coopnorge/github-action-setup@v0',
          '+      - uses: coopnorge/github-action-setup@v0.5.1',
        ],
      },
      pr: { title: 'chore(deps): update dependency coopnorge/github-action-setup to v0.5.1', state: 'merged' },
    },
  },
};
