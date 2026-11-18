import { daysAgo, dedent, sha } from '../lib/harness.mjs';

const oldMain = sha('shared-main-old');
const newMain = sha('shared-main-new');

// #334, #335, #340: `@<sha> # main` refs of internal coopnorge workflows are
// bumped to the latest commit on main. The workflow path and the `# main`
// comment are kept, and the PR links to the commit diff.
export default {
  description: 'bumps internal @<sha> # main refs to the latest main commit',
  github: {
    'coopnorge/github-workflow-shared': {
      tags: [{ name: 'v1.4.0', sha: sha('shared-v1.4.0'), date: daysAgo(20) }],
      branches: [{ name: 'main', sha: newMain, date: daysAgo(1) }],
    },
  },
  files: {
    '.github/workflows/notify.yaml': dedent`
      name: Notify
      on: push
      jobs:
        notify:
          uses: coopnorge/github-workflow-shared/.github/workflows/notify.yaml@${oldMain} # main
    `,
  },
  branches: {
    'renovate/coopnorge-github-workflow-shared-digest': {
      changes: {
        '.github/workflows/notify.yaml': [
          `-    uses: coopnorge/github-workflow-shared/.github/workflows/notify.yaml@${oldMain} # main`,
          `+    uses: coopnorge/github-workflow-shared/.github/workflows/notify.yaml@${newMain} # main`,
        ],
      },
      pr: {
        title: `chore(deps): update coopnorge/github-workflow-shared digest to ${newMain.slice(0, 7)}`,
        state: 'merged',
        bodyIncludes: [
          `| [coopnorge/github-workflow-shared](https://github.com/coopnorge/github-workflow-shared) ([changes](https://github.com/coopnorge/github-workflow-shared/compare/${oldMain}..${newMain})) | digest |`,
        ],
        bodyExcludes: ['](/compare/'],
      },
    },
  },
};
