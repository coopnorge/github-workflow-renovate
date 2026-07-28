FROM ghcr.io/renovatebot/renovate:43.285.3@sha256:a1059bb5311c57f518c538665484d2a64517d8a0b23208b53d8cfdc477dab7d5 AS renovate

USER root

ARG GO_VERSION=1.26.5
ARG GOIMPORTS_VERSION=0.42.0

RUN apt-get update && apt-get install -y curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz -o /tmp/go.tgz \
 && rm -rf /usr/local/go \
 && tar -C /usr/local -xzf /tmp/go.tgz \
 && rm /tmp/go.tgz

ENV PATH="/usr/local/go/bin:${PATH}"

RUN GOBIN=/usr/local/go/bin go install golang.org/x/tools/cmd/goimports@v${GOIMPORTS_VERSION}

USER ubuntu
