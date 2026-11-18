import { daysAgo, dedent, sha } from '../lib/harness.mjs';

// #313: internal coopnorge workflows/actions referenced with `@main` are
// pinned to the latest exact tag, keeping the workflow path.
export default {
  description: 'pins internal @main refs to the latest exact tag',
  github: {
    'coopnorge/github-workflow-shared': {
      tags: [
        { name: 'v0.9.0', sha: sha('shared-v0.9.0'), date: daysAgo(90) },
        { name: 'v1.3.0', sha: sha('shared-v1.3.0'), date: daysAgo(30) },
        { name: 'v1.4.0', sha: sha('shared-v1.4.0'), date: daysAgo(2) },
        { name: 'v1', sha: sha('shared-v1.4.0'), date: daysAgo(2) },
      ],
      branches: [{ name: 'main', sha: sha('shared-main'), date: daysAgo(1) }],
    },
    'coopnorge/github-action-setup': {
      tags: [
        { name: 'v2.0.0', sha: sha('setup-v2.0.0'), date: daysAgo(40) },
        { name: 'v2.1.0', sha: sha('setup-v2.1.0'), date: daysAgo(3) },
      ],
      branches: [{ name: 'main', sha: sha('setup-main'), date: daysAgo(1) }],
    },
  },
  files: {
    '.github/workflows/ci.yaml': dedent`
      name: CI
      on: push
      jobs:
        build:
          uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@main
        test:
          runs-on: ubuntu-latest
          steps:
            - uses: coopnorge/github-action-setup@main
    `,
  },
  branches: {
    'renovate/coopnorge-github-workflow-shared-1.x': {
      changes: {
        '.github/workflows/ci.yaml': [
          '-    uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@main',
          '+    uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@v1.4.0',
        ],
      },
      pr: { title: 'chore(deps): update dependency coopnorge/github-workflow-shared to v1', state: 'merged' },
    },
    'renovate/coopnorge-github-action-setup-2.x': {
      changes: {
        '.github/workflows/ci.yaml': [
          '-      - uses: coopnorge/github-action-setup@main',
          '+      - uses: coopnorge/github-action-setup@v2.1.0',
        ],
      },
      pr: { title: 'chore(deps): update dependency coopnorge/github-action-setup to v2', state: 'merged' },
    },
  },
};
