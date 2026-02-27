FROM quay.io/terraform-docs/terraform-docs:0.20.0@sha256:37329e2dc2518e7f719a986a3954b10771c3fe000f50f83fd4d98d489df2eae2 AS tfdocs
FROM ghcr.io/renovatebot/renovate:43.32.1@sha256:03330afaf925f7ce790bb62958cb75fddcbc58300cb1b1ffd19da19d7fa158b7 AS renovate

USER root

ARG GO_VERSION=1.26.0

RUN apt-get update && apt-get install -y curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz -o /tmp/go.tgz \
 && rm -rf /usr/local/go \
 && tar -C /usr/local -xzf /tmp/go.tgz \
 && rm /tmp/go.tgz

ENV PATH="/usr/local/go/bin:${PATH}"

COPY --from=tfdocs /usr/local/bin/terraform-docs /usr/local/bin/terraform-docs

USER ubuntu
