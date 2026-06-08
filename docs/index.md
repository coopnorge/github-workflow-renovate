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
  extends: ["github>coopnorge/github-workflow-renovate"],
}
```

For more examples, see the following:

- <https://github.com/coopnorge/cloud-projects/blob/main/.github/renovate.json5>
- <https://github.com/coopnorge/terraform-dataplatform-domain/blob/main/.github/renovate.json5>
- <https://github.com/coopnorge/store-information-service/blob/main/.github/renovate.json5>

### Validating the Renovate config

The `validate-renovate-config` reusable workflow validates your Renovate config
file on pull requests using the same version of Renovate that runs in the
`renovate` workflow.

#### Calling the workflow

Add it to a workflow in your repo, for example `.github/workflows/cicd.yaml`:

```yaml
jobs:
  validate-renovate-config:
    permissions:
      contents: read
      pull-requests: read
    uses: coopnorge/github-workflow-renovate/.github/workflows/validate-renovate-config.yaml@v0
```

The workflow triggers on changes to common Renovate config locations
(`.github/renovate.json5`, `renovate.json5`, `renovate.json`) and the workflow
file itself. No further configuration is required.

If your repo uses non-standard config file locations, override the defaults
using the `config-paths` input — a newline-separated list of file paths or glob
patterns:

```yaml
jobs:
  validate-renovate-config:
    permissions:
      contents: read
      pull-requests: read
    uses: coopnorge/github-workflow-renovate/.github/workflows/validate-renovate-config.yaml@v0
    with:
      config-paths: |
        custom/path/renovate.json5
        *.json5
```

#### Requiring the check to pass before merge

Add the status check to your `.pallet/gitconfig.yaml`. Because this is a
reusable workflow, the check name is prefixed with the name of the job that
calls it (`validate-renovate-config` in the examples above):

```yaml
spec:
  branches:
    protection:
      - id: main
        pattern: main
        requiredStatusChecks:
          checks:
            - "validate-renovate-config / Validate Renovate config"
```

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
      Defaults to `vars.PALLET_WORKLOAD_IDENTITY_PROVIDER`.
  gcp-service-account:
    type: string
    required: false
    description: |
      Email address or unique identifier of the Google Cloud service
      account for which to impersonate and generate credentials.
      Defaults to `vars.PALLET_SERVICE_ACCOUNT`.
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
