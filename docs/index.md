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

### Helm image tag detection

Renovate uses the `helm-values` manager to detect Docker image updates in Helm
value files matching `values.yaml`, `values-dev.yaml`, `values-staging.yaml`,
and `values-production.yaml`.

When using environment-specific value files, make sure each file defines all of
the following keys explicitly:

- `image.registry`
- `image.repository`
- `image.tag`

Renovate does not detect inherited image values from a base `values.yaml`, so if
an environment-specific file only overrides part of the image configuration, the
image tag may not be tracked.

The current `image.tag` value also needs to use a tag format that Renovate can
recognize as version-like, parse, and compare for that image. Docker tags are
not true versions, so Renovate applies Docker-specific versioning rules when
deciding whether a tag can be updated.

In practice, this means:

- Renovate only checks for tag upgrades when the current tag looks like a
  version.
- Renovate expects the current tag and newer tags to follow a comparable version
  scheme.
- Renovate preserves version precision, so `1.2` is typically updated to `1.3`
  rather than `1.2.1`.
- Renovate treats the text after the first hyphen as a compatibility suffix, so
  tags such as `1.2.3-alpine` are updated within that same suffix stream.
- Renovate does not support commit-hash-like Docker tags, so tags that look like
  Git SHAs are ignored.

If you change an image from one tagging scheme to another, such as from Git-SHA
tags to date-based tags, Renovate may not detect that transition automatically.
In that case, update the tag manually to the new scheme first.

If an image uses a non-standard tagging scheme, you may need to add a Renovate
`packageRules` override with a different `versioning` strategy, such as `loose`,
`semver`, `pep440`, or `regex`.

### Configuring authentication to coopnorge PyPI repository

The
[shared coopnorge PyPI repository](https://console.cloud.google.com/artifacts/python/engineering-production-af50/europe-north1/engineering-pypi?project=engineering-production-af50)
is hosted in a GCP project managed within the
[coopnorge/engineering-infrastructure](https://github.com/coopnorge/engineering-infrastructure)
repository.

This Renovate workflow sets up the authentication token for the registry, but
the access permissions must first be configured in
[terraform/service_accounts.tf](https://github.com/coopnorge/engineering-infrastructure/blob/main/terraform/service_accounts.tf).
To grant access, add your repository to the `github_auth_to_gcp_sa_mapping`
dictionary as follows:

```hcl
  github_auth_to_gcp_sa_mapping = {
    # ...
    # ...
    # ...
    github-actions-your-repo = {
      sa_name   = module.service_accounts.service_accounts["github-actions"].id
      attribute = "attribute.repository/coopnorge/your-repo"
    }
  }
```

### Inputs

```yaml
inputs:
  post-upgrade-command:
    type: string
    required: false
    description: |
      Command to run after upgrade.
  post-upgrade-env-vars:
    type: string
    required: false
    description: |
      Extra environment variables for post-upgrade tasks.
      Format: KEY=VALUE per line. If no '=', takes the value from current env.
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

## References

- <https://docs.renovatebot.com/docker/>
- <https://docs.renovatebot.com/modules/versioning/docker/>
