# github-workflow-renovate

Reusable workflow for renovate. Uses
[official renovate GitHub action](https://github.com/renovatebot/github-action)
with custom configuration.

## Goals

- Have a ready-to-use reusable action to run renovate.
- Provide a reusable foundation teams can extend with Renovate best practices.

## Usage

### Renovate config file

The renovate config is expected at `.github/renovate.json5`.

### Configuration

Use the following default configuration in `.github/renovate.json5`:

```json5
{
  $schema: "https://docs.renovatebot.com/renovate-schema.json",
  extends: ["config:recommended"],
  labels: ["dependencies", "renovate", "{{depName}}"],
  prHourlyLimit: 5,
  automerge: true,
  automergeStrategy: "squash",
  minimumReleaseAge: "14 days",
  rebaseWhen: "conflicted",
  postUpdateOptions: ["gomodTidy", "gomodUpdateImportPaths"],
  lockFileMaintenance: {
    enabled: false,
  },
  osvVulnerabilityAlerts: true,
  vulnerabilityAlerts: {
    enabled: true,
  },
}
```

For more examples, see the following:

- <https://github.com/coopnorge/cloud-projects/blob/main/.github/renovate.json5>
- <https://github.com/coopnorge/terraform-dataplatform-domain/blob/main/.github/renovate.json5>
- <https://github.com/coopnorge/store-information-service/blob/main/.github/renovate.json5>

### Custom containers

Custom containers may be required if you are using the input
`post-upgrade-command`. The container needs to have renovate image as base and
additional tools available in path. The Dockerfile for the custom container is
expected at `devtools/renovate.Dockerfile`. If this file exists, it is used. If
this file does not exist, the latest version of the default renovate image is
used.

### Policy bot config update for auto-merge

If you have auto-merge workflows, configure policy-bot with the username
`renovate-coop-norge[bot]` to allow auto-merging.

### Inputs

```yaml
inputs:
  post-upgrade-command:
    type: string
    required: false
    description: |
      Command to run after upgrade.
  config-file:
    type: string
    default: .github/renovate.json5
    required: false
    description: |
      Configuration file to use.
  extra-env-vars:
    type: string
    required: false
    description: |
      Extra environment variables to set.
      Format: KEY=VALUE per line.
  log-level:
    type: string
    default: info
    required: false
    description: |
      Log level.
      Supported: trace, debug, info, warn, error, fatal
      Default: info
  gcp-workload-identity-provider:
    type: string
    required: false
    description: |
      Full identifier of the Workload Identity Provider,
      e.g. projects/889992792607/locations/global/workloadIdentityPools/github-actions/providers/github-actions-provider
      Defaults to `env.PALLET_WORKLOAD_IDENTITY_PROVIDER`.
  gcp-service-account:
    type: string
    required: false
    description: |
      Email address or unique identifier of the Google Cloud service
      account for which to impersonate and generate credentials.
      Defaults to `env.PALLET_SERVICE_ACCOUNT`.
```

This job can be added to your workflow as follows:

```yaml
on:
  workflow_dispatch:
    inputs:
      log-level:
        description: "Override default log level"
        required: false
        default: "debug"
        type: string

  schedule:
    - cron: "0 4 * * *"

jobs:
  renovate:
    permissions:
      contents: write
      pull-requests: write
      id-token: write
      issues: write
    uses: coopnorge/github-workflow-renovate/.github/workflows/renovate.yaml@v0
    secrets: inherit
    with:
      log-level: ${{ inputs.log-level }}
```
