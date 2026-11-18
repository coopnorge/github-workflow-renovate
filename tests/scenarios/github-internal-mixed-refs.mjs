import { daysAgo, dedent, sha } from '../lib/harness.mjs';

const oldMain = sha('shared-main-old');
const newMain = sha('shared-main-new');

// All internal ref forms for the same repo in one file. Each custom manager must
// only rewrite its own lines, and updates of the same dependency are grouped.
export default {
  description: 'handles @main, @vX and @<sha> # main refs to the same repo in one file',
  github: {
    'coopnorge/github-workflow-shared': {
      tags: [
        { name: 'v1.3.0', sha: sha('shared-v1.3.0'), date: daysAgo(30) },
        { name: 'v1.4.0', sha: sha('shared-v1.4.0'), date: daysAgo(2) },
        { name: 'v1', sha: sha('shared-v1.4.0'), date: daysAgo(2) },
      ],
      branches: [{ name: 'main', sha: newMain, date: daysAgo(1) }],
    },
  },
  files: {
    '.github/workflows/ci.yaml': dedent`
      name: CI
      on: push
      jobs:
        build:
          uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@main
        lint:
          uses: coopnorge/github-workflow-shared/.github/workflows/lint.yaml@v1
        notify:
          uses: coopnorge/github-workflow-shared/.github/workflows/notify.yaml@${oldMain} # main
        release:
          uses: coopnorge/github-workflow-shared/.github/workflows/release.yaml@v1.3.0
    `,
  },
  branches: {
    'renovate/coopnorge-github-workflow-shared-1.x': {
      changes: {
        '.github/workflows/ci.yaml': [
          '-    uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@main',
          '+    uses: coopnorge/github-workflow-shared/.github/workflows/build.yaml@v1.4.0',
          '-    uses: coopnorge/github-workflow-shared/.github/workflows/lint.yaml@v1',
          '+    uses: coopnorge/github-workflow-shared/.github/workflows/lint.yaml@v1.4.0',
          '-    uses: coopnorge/github-workflow-shared/.github/workflows/release.yaml@v1.3.0',
          '+    uses: coopnorge/github-workflow-shared/.github/workflows/release.yaml@v1.4.0',
        ],
      },
      pr: { title: 'chore(deps): update dependency coopnorge/github-workflow-shared to v1.4.0', state: 'merged' },
    },
    'renovate/coopnorge-github-workflow-shared-digest': {
      changes: {
        '.github/workflows/ci.yaml': [
          `-    uses: coopnorge/github-workflow-shared/.github/workflows/notify.yaml@${oldMain} # main`,
          `+    uses: coopnorge/github-workflow-shared/.github/workflows/notify.yaml@${newMain} # main`,
        ],
      },
      pr: { title: `chore(deps): update coopnorge/github-workflow-shared digest to ${newMain.slice(0, 7)}`, state: 'merged' },
    },
  },
};
