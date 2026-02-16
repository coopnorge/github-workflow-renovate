# github-workflow-renovate

This is an example documentation for the example workflow. For a real example,
see
[the README of github-workflow-terraform-validation](https://github.com/coopnorge/github-workflow-terraform-validation/blob/main/README.md).

## Goals

* Demonstrate how an example workflow looks like.
* Demonstrate how to access inputs and secrets in a reusable workflow.

## Usage

### Inputs

```yaml
inputs:
  example-string-input:
    type: string
    default: example-string-input
    required: true
    description: |
      Description of the example string input.
  example-number-input:
    type: number
    default: 42
    required: false
    description: |
      Example number input.
  example-boolean-input:
    type: boolean
    default: false
    required: false
    description: |
      Description of the example boolean input.

secrets:
  example-secret:
    required: false
    description: |
      Example secret.
```

This job can be added to your workflow as follows:

```yaml
jobs:
  # <some other jobs>
  example-ci:
    name: "Example CI"
    uses: coopnorge/github-workflow-renovate/.github/workflows/renovate.yaml@v0
    with:
      example-string-input: Example string
      example-number-input: 12
      example-boolean-input: true
    secrets:
      example-secret: ${{ secrets.EXAMPLE_SECRET }}
  # <some other jobs>
```
