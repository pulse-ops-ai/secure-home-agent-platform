# secure-home-gates-toolchain — the governed gate toolchain, outside the
# runner lineage.
#
# This image runs repository gates, not agents, so it deliberately does NOT
# derive from secure-home-runner-base (deriving it would put a non-runner
# into the ADR-0011 lineage) and carries NO provider agent runtime and no
# credential. Its contents are the toolchain surface the merge gate and
# scripts/check.sh actually invoke — nothing speculative.
#
# Network posture, stated exactly: every toolchain below is resident in the
# image, so gate execution needs no run-time toolchain fetch. That is
# SUITABILITY for the later network-isolated gate posture (constitution
# INV-009, enforced at L9); it is not a claim that any network enforcement
# exists today. Repository checkouts and warmed dependency stores arrive as
# read-only mounts at execution time — the image carries toolchains, never
# repository state.

FROM docker.io/library/debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258

ARG TARGETARCH
ARG SOURCE_DATE_EPOCH=0

# Exact archive versions, resolved from the trixie archive on 2026-08-23 —
# same pin-or-fail-loudly posture as runner-base (the snapshot service
# refuses the governed builder's address space; see the child design).
ARG CA_CERTIFICATES_VERSION=20250419
ARG GIT_VERSION=1:2.47.3-0+deb13u1
ARG CURL_VERSION=8.14.1-2+deb13u4

# The gate toolchain pins, matching the merge gate exactly
# (.github/workflows/checks.yml: NODE_VERSION / UV_VERSION; package.json:
# packageManager). Checksums from the published release artifacts, resolved
# 2026-08-23.
ARG NODE_VERSION=24.18.1
ARG NODE_SHA256_AMD64=9f5eb6ac21845a66c493c91a253b1da32fd684e89e9b7202d4936982336be4ca
ARG NODE_SHA256_ARM64=df224555a083b918e46260cc969838501b9f9a87140c1195e5b9597b56d5dae2
ARG PNPM_VERSION=11.18.0
ARG UV_VERSION=0.12.1
ARG UV_SHA256_AMD64=90b2f223fb69d19db49e117da601f64978593417988530aa733d456141b4bcbb
ARG UV_SHA256_ARM64=769d373e146692c639b5fbaae33b331c297a32e03d30448772051902df52bbf4

ENV COREPACK_HOME=/opt/corepack \
    UV_PYTHON_INSTALL_DIR=/opt/uv/python

RUN set -eux; \
    apt-get update; \
    # git and ca-certificates: the shell gates (validate-scaffold,
    # scan-secrets, check.sh) need git + coreutils; TLS trust is needed at
    # BUILD time here and by nothing at gate run time. curl is build-only.
    apt-get install -y --no-install-recommends \
      "ca-certificates=${CA_CERTIFICATES_VERSION}" \
      "git=${GIT_VERSION}" \
      "curl=${CURL_VERSION}"; \
    \
    case "$TARGETARCH" in \
      amd64) node_arch=x64;   node_sha="$NODE_SHA256_AMD64"; uv_triple=x86_64-unknown-linux-gnu;  uv_sha="$UV_SHA256_AMD64" ;; \
      arm64) node_arch=arm64; node_sha="$NODE_SHA256_ARM64"; uv_triple=aarch64-unknown-linux-gnu; uv_sha="$UV_SHA256_ARM64" ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    \
    curl -fsSLo /tmp/node.tgz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.gz"; \
    echo "${node_sha}  /tmp/node.tgz" | sha256sum -c -; \
    tar -xzf /tmp/node.tgz -C /usr/local --strip-components=1; \
    rm /tmp/node.tgz; \
    node --version; \
    \
    # pnpm at the repository's exact packageManager pin, cached into the
    # image via corepack at BUILD time so first use never fetches.
    corepack enable; \
    corepack install -g "pnpm@${PNPM_VERSION}"; \
    pnpm --version; \
    \
    curl -fsSLo /tmp/uv.tgz "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${uv_triple}.tar.gz"; \
    echo "${uv_sha}  /tmp/uv.tgz" | sha256sum -c -; \
    tar -xzf /tmp/uv.tgz -C /tmp; \
    install -m 0755 "/tmp/uv-${uv_triple}/uv" /usr/local/bin/uv; \
    install -m 0755 "/tmp/uv-${uv_triple}/uvx" /usr/local/bin/uvx; \
    rm -rf "/tmp/uv-${uv_triple}" /tmp/uv.tgz; \
    uv --version; \
    \
    # The managed CPython the repository's uv workspace requires (>=3.13).
    # The exact patch is the deterministic resolution of "3.13" by the pinned
    # uv release, surfaced here in the build log as evidence.
    uv python install 3.13; \
    uv python find 3.13; \
    \
    apt-get purge -y curl; \
    apt-get autoremove -y; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /var/log/apt /var/log/dpkg.log \
      /var/log/alternatives.log /var/cache/ldconfig/aux-cache \
      /root/.npm /root/.cache /tmp/*

RUN set -eux; \
    groupadd --gid 10001 gates; \
    useradd --uid 10001 --gid 10001 --create-home --home-dir /home/gates \
      --shell /usr/sbin/nologin gates; \
    sed -ri 's/^(gates:[^:]*):[0-9]+:/\1:1:/' /etc/shadow; \
    mkdir -p /repo; \
    chown gates:gates /repo

LABEL org.opencontainers.image.title="secure-home-gates-toolchain" \
      org.opencontainers.image.description="Governed repository gate toolchain: git, Node, pnpm, uv, managed CPython — resident in the image so gate execution needs no run-time toolchain fetch. Outside the runner lineage; no agent runtime, no credential." \
      io.secure-home.lineage="gates-toolchain"

USER gates
WORKDIR /repo
