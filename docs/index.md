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

Repositories that use conventional commits (detected by Renovate from the commit
history) get the prefix `chore(deps)` for all dependency updates, including Go
modules, so they are never treated as fixes. Other repositories keep plain
commit messages. A repository can force the prefix by setting
`"semanticCommits": "enabled"` in its own `renovate.json5`.

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

## Regression tests

The `tests/` directory has regression tests for the workflow and the presets.
They run Renovate the way `.github/workflows/renovate.yaml` runs it, against
test repositories, and check the branches and pull requests Renovate creates. CI
runs them when a preset, `renovate.yaml` or `tests/` changes.

Each test:

1. Reads `renovate.yaml` to find the Renovate image, the config file and the
   environment the workflow passes to Renovate.
2. Creates a repository in a local [Gitea](https://about.gitea.com/) instance,
   with the files of a scenario in `tests/scenarios/`.
3. Runs the Renovate image of the workflow with that environment. Gitea replaces
   GitHub as the platform. Requests to GitHub and package registries return the
   mock data of the scenario, so the tests run offline, and presets come from
   local checkout instead of from GitHub.
4. Runs Renovate again, like the scheduled workflow does, until a run changes
   nothing. Between runs, a successful CI status is reported on the Renovate
   branches, so Renovate can auto-merge.
5. Compares the changed lines on each Renovate branch and the pull request
   title, state and body with the scenario. Renovate warnings and errors, and
   requests without mock data, also fail the test.

`renovate-config-validator --strict` also checks the presets.

### Run the tests

```console
cd tests
npm ci
npm test
```

Useful environment variables:

- `RENOVATE_TEST_SCENARIO=github-internal-main-ref,python-grouping` runs only
  these scenarios.
- `RENOVATE_TEST_REF=<commit>` tests `renovate.yaml` and the presets of a commit
  instead of your working tree, for example to find the change that introduced a
  regression.
- `RENOVATE_TEST_KEEP_GITEA=1` keeps Gitea running after the tests, which makes
  the next run faster. Stop it with
  `docker compose -f tests/docker-compose.yaml down -v`.

The Renovate logs and the result of each scenario are in `tests/.output/`.

### Add a scenario

Add a file to `tests/scenarios/`. A scenario has:

- `files`: the files of the repository. Without `.github/renovate.json5`, the
  repository uses the configuration from [Configuration](#configuration).
- `github`: tags, branches and releases of GitHub repositories, for the
  `github-tags`, `github-digest` and `github-releases` data sources.
- `http`: responses for other URLs, such as package registries.
  `tests/lib/registries/` has helpers to build them, with one file per
  ecosystem: `docker.mjs` (Docker Hub), `go.mjs` (Go releases and the Go module
  proxy) and `python.mjs` (PyPI). Requests use `GET`, unless the URL starts with
  another method, such as `HEAD https://...`.
- `osv` (optional): vulnerability advisories per ecosystem, for
  `osvVulnerabilityAlerts`. `tests/lib/registries/osv.mjs` has a helper to build
  them.
- `branches`: the Renovate branches expected at the end, with the changed lines
  of each file, and the expected pull request.
- `workflowInputs` (optional): inputs to `renovate.yaml`, such as
  `extra-env-vars`.

See the existing scenarios for examples. To write the expectations, you can add
a scenario with `branches: {}`, run it, and check the result in
`tests/.output/<scenario>/result.json`.

## References

- <https://docs.renovatebot.com/docker/>
- <https://docs.renovatebot.com/modules/versioning/docker/>
