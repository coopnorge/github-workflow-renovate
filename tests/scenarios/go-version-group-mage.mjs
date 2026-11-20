import { daysAgo, dedent, sha } from '../lib/harness.mjs';
import { dockerHubImage, golangReleases, imageDigest } from '../lib/registries.mjs';

const released = { '1.27.3': daysAgo(60), '1.27.4': daysAgo(30) };
const setupGo = sha('setup-go-v7.0.0');

// coopnorge/mage with Go 1.27.4 released. The files and the Renovate config
// below are trimmed copies from coopnorge/mage.
//
// mage refers to the golang image as `docker.io/library/golang`. The go
// version group in go.json5 only matches `golang`, so the image is updated in
// mage's own "Go and Golangci-lint versions" group, together with the Go
// version of the setup-mage action. The go directive in go.mod is updated in a
// separate PR.
export default {
  description: 'keeps the go directive of coopnorge/mage out of its golang tooling image PR',
  github: {
    'golang/go': {
      tags: Object.entries(released).map(([version, date]) => ({ name: `go${version}`, sha: sha(`go${version}`), date })),
    },
    'actions/setup-go': {
      tags: [{ name: 'v7.0.0', sha: setupGo, date: daysAgo(90) }],
    },
    // Renovate's github-actions manager also reads setup-go's go-version, and looks
    // it up in the actions/go-versions releases.
    'actions/go-versions': {
      releases: Object.entries(released).map(([version, date], index) => ({ name: `${version}-${1000 + index}`, date })),
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
    '.github/renovate.json5': dedent`
      {
          "$schema": "https://docs.renovatebot.com/renovate-schema.json",
          "extends": [
              "github>coopnorge/github-workflow-renovate",
          ],
          "customManagers": [
              // docker.io/library/golang version in GitHub Actions workflows, kept in sync with tools.Dockerfile
              {
                  "customType": "regex",
                  "managerFilePatterns": ["/^\\\\.github/(workflows|actions)/.+\\\\.yaml$/"],
                  "matchStrings": [
                      "go-version:\\\\s+\\"(?<currentValue>[\\\\d.]+)\\"\\\\s+# renovate: datasource=docker depName=docker.io/library/golang"
                  ],
                  "datasourceTemplate": "docker",
                  "depNameTemplate": "docker.io/library/golang",
                  "versioningTemplate": "semver",
              },
          ],
          "packageRules": [
              {
                  "description": "Group Go Docker dependencies",
                  "matchDatasources": ["docker"],
                  "matchPackageNames": [
                    "docker.io/library/golang",
                    "golangci/golangci-lint"
                  ],
                  "groupName": "Go and Golangci-lint versions",
                  "minimumReleaseAge": "7 days",
              },
          ],
      }
    `,
    'go.mod': dedent`
      module github.com/coopnorge/mage

      go 1.27.3
    `,
    'internal/devtool/tools.Dockerfile': dedent`
      FROM docker.io/library/golang:1.27.3@${imageDigest('golang:1.27.3')} AS golang
    `,
    '.github/actions/setup-mage/action.yaml': dedent`
      name: Setup mage
      runs:
        using: composite
        steps:
          - uses: actions/setup-go@${setupGo} # v7.0.0
            with:
              go-version: "1.27.3" # renovate: datasource=docker depName=docker.io/library/golang
    `,
  },
  branches: {
    'renovate/go-version': {
      changes: {
        'go.mod': ['-go 1.27.3', '+go 1.27.4'],
      },
      pr: { title: 'chore(deps): update go module directive to v1.27.4', state: 'merged' },
    },
    'renovate/go-and-golangci-lint-versions': {
      changes: {
        '.github/actions/setup-mage/action.yaml': [
          '-        go-version: "1.27.3" # renovate: datasource=docker depName=docker.io/library/golang',
          '+        go-version: "1.27.4" # renovate: datasource=docker depName=docker.io/library/golang',
        ],
        'internal/devtool/tools.Dockerfile': [
          `-FROM docker.io/library/golang:1.27.3@${imageDigest('golang:1.27.3')} AS golang`,
          `+FROM docker.io/library/golang:1.27.4@${imageDigest('golang:1.27.4')} AS golang`,
        ],
      },
      pr: { state: 'merged' },
    },
  },
};
