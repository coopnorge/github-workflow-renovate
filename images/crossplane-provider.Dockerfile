FROM ghcr.io/renovatebot/renovate:43.182.2@sha256:2fe1ed281b43b7082ecffd761940e2d039b1fc46198e69ac80a415545e49f3ae AS renovate

USER root

ARG GO_VERSION=1.26.3
ARG GOIMPORTS_VERSION=0.42.0

RUN apt-get update && apt-get install -y curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz -o /tmp/go.tgz \
 && rm -rf /usr/local/go \
 && tar -C /usr/local -xzf /tmp/go.tgz \
 && rm /tmp/go.tgz

ENV PATH="/usr/local/go/bin:${PATH}"

USER ubuntu

RUN go install golang.org/x/tools/cmd/goimports@v${GOIMPORTS_VERSION}

ENV PATH="/home/ubuntu/go/bin:${PATH}"
