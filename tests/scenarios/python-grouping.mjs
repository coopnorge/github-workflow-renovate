import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { pypi } from '../lib/registries.mjs';

// python.json5: non-major updates are grouped into one PR, dagster and dbt
// packages get their own group, and major updates are not automerged.
export default {
  description: 'groups python updates as configured in python.json5',
  // Renovate knows that requests is hosted at psf/requests, and looks up its release notes there.
  github: {
    'psf/requests': {
      tags: [{ name: 'v2.32.3', sha: sha('requests-v2.32.3'), date: daysAgo(60) }],
    },
  },
  http: {
    ...pypi('requests', { '2.31.0': daysAgo(400), '2.32.3': daysAgo(60) }),
    ...pypi('urllib3', { '2.0.7': daysAgo(400), '2.2.3': daysAgo(60) }),
    ...pypi('click', { '8.1.0': daysAgo(400), '9.0.0': daysAgo(60) }),
    ...pypi('dagster', { '1.7.0': daysAgo(400), '1.8.0': daysAgo(60) }),
    ...pypi('dagster-dbt', { '0.23.0': daysAgo(400), '0.24.0': daysAgo(60) }),
  },
  files: {
    'pyproject.toml': dedent`
      [project]
      name = "app"
      version = "0.1.0"
      requires-python = ">=3.12"
      dependencies = [
        "requests==2.31.0",
        "urllib3==2.0.7",
        "click==8.1.0",
        "dagster==1.7.0",
        "dagster-dbt==0.23.0",
      ]
    `,
  },
  branches: {
    'renovate/all-non-major-dependencies': {
      changes: {
        'pyproject.toml': [
          '-  "requests==2.31.0",',
          '-  "urllib3==2.0.7",',
          '+  "requests==2.32.3",',
          '+  "urllib3==2.2.3",',
        ],
      },
      pr: { title: 'chore(deps): update all non-major dependencies', state: 'merged' },
    },
    'renovate/dagster-dbt': {
      changes: {
        'pyproject.toml': [
          '-  "dagster==1.7.0",',
          '-  "dagster-dbt==0.23.0",',
          '+  "dagster==1.8.0",',
          '+  "dagster-dbt==0.24.0",',
        ],
      },
      pr: { title: 'chore(deps): update dagster and dbt to ==1.8.0', state: 'merged' },
    },
    // Major updates are not automerged.
    'renovate/click-9.x': {
      changes: {
        'pyproject.toml': [
          '-  "click==8.1.0",',
          '+  "click==9.0.0",',
        ],
      },
      pr: { title: 'chore(deps): update dependency click to v9', state: 'open' },
    },
  },
};
