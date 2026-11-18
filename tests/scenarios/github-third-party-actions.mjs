import { daysAgo, dedent, sha } from '../lib/harness.mjs';

const v421 = sha('checkout-v4.2.1');
const v422 = sha('checkout-v4.2.2');

// Third-party actions stay with the built-in github-actions manager: digest pins
// are bumped and the version comment is kept. Internal coopnorge refs are left
// to the custom managers, so an up-to-date `@v2.1.0` gets no digest pin PR.
export default {
  description: 'bumps digest-pinned third-party actions and leaves internal refs alone',
  github: {
    'actions/checkout': {
      tags: [
        { name: 'v4.2.1', sha: v421, date: daysAgo(200) },
        { name: 'v4.2.2', sha: v422, date: daysAgo(100) },
        { name: 'v4', sha: v422, date: daysAgo(100) },
      ],
    },
    'coopnorge/github-action-setup': {
      tags: [{ name: 'v2.1.0', sha: sha('setup-v2.1.0'), date: daysAgo(30) }],
    },
  },
  files: {
    '.github/workflows/ci.yaml': dedent`
      name: CI
      on: push
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@${v421} # v4.2.1
            - uses: coopnorge/github-action-setup@v2.1.0
    `,
  },
  branches: {
    'renovate/actions-checkout-4.x': {
      changes: {
        '.github/workflows/ci.yaml': [
          `-      - uses: actions/checkout@${v421} # v4.2.1`,
          `+      - uses: actions/checkout@${v422} # v4.2.2`,
        ],
      },
      pr: { title: 'chore(deps): update actions/checkout action to v4.2.2', state: 'merged' },
    },
  },
};
