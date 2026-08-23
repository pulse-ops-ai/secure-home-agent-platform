# secure-home-runner-claude — the reference derived runner image.
#
# Exactly one provider runtime on top of the exact pinned base, plus only
# what that runtime requires (ADR-0011: one coding agent per derived image;
# a second runtime here is prohibited, not discouraged). No credential, no
# provider configuration, no knowledge content: credentials are provisioned
# at run time from the profile (never baked), and knowledge reaches a run
# through the platform's own resolution — never through image bytes.
#
# The FROM below is a LOGICAL name with no registry resolution path: the
# governed build supplies it as a named build context pinned to the exact
# base digest recorded in deploy/images/image-lock.yaml. It cannot resolve
# by accident, and the lock's parent_digest is the only authority for what
# it resolves to.

FROM secure-home-runner-base

ARG TARGETARCH
ARG SOURCE_DATE_EPOCH=0

# Exact archive versions, resolved from the trixie archive on 2026-08-23 —
# same pin-or-fail-loudly posture as runner-base.
ARG GIT_VERSION=1:2.47.3-0+deb13u1
ARG CURL_VERSION=8.14.1-2+deb13u4

# The runtime engine, pinned to the repository's own Node version and
# verified against the published release checksums (nodejs.org SHASUMS256,
# resolved 2026-08-23).
ARG NODE_VERSION=24.18.1
ARG NODE_SHA256_AMD64=9f5eb6ac21845a66c493c91a253b1da32fd684e89e9b7202d4936982336be4ca
ARG NODE_SHA256_ARM64=df224555a083b918e46260cc969838501b9f9a87140c1195e5b9597b56d5dae2

# The one runtime this image exists to carry. Version and integrity resolved
# from registry.npmjs.org on 2026-08-23 and recorded in image-lock.yaml; the
# tarball bytes are verified against the recorded sha512 BEFORE installation,
# so the registry's mutable metadata is not on the build trust path. The
# runtime ships its executable as a per-platform package at the same version;
# the matching platform package is pinned and verified the same way.
ARG CLAUDE_CODE_VERSION=2.1.241
ARG CLAUDE_CODE_SHA512_B64=S7DWEmJJAsI5taAUjhKm6soXcFJYIVeTH6Lg9kmp3yntFllCP612hGwZ7thOGh8r7YaRUH9+1jCX5A9QGazsxg==
ARG CLAUDE_CODE_SHA512_B64_AMD64=yHcPvq6iSblC7Mj05yjWBJOfSC3scyyEYazdX/QRUmXmqYXc1hh8LGZaaZPGv+UFXOJZhpPnNCbyVLdMLFCr4Q==
ARG CLAUDE_CODE_SHA512_B64_ARM64=tHsJhjwcoFyKTCQfYCclKjLtbnbbGKvcrzxUhMb6NDlPw9RrawmjSWUAdla7PtEVPaJsGkjGo4O2MQTlYIT+PA==

USER root

RUN set -eux; \
    apt-get update; \
    # git: repository operation is this runtime's function. curl: build-time
    # fetch only, purged below so the runtime surface stays minimal.
    apt-get install -y --no-install-recommends \
      "git=${GIT_VERSION}" \
      "curl=${CURL_VERSION}"; \
    \
    case "$TARGETARCH" in \
      amd64) node_arch=x64;   node_sha="$NODE_SHA256_AMD64";  cli_pkg=linux-x64;   cli_sha_b64="$CLAUDE_CODE_SHA512_B64_AMD64" ;; \
      arm64) node_arch=arm64; node_sha="$NODE_SHA256_ARM64";  cli_pkg=linux-arm64; cli_sha_b64="$CLAUDE_CODE_SHA512_B64_ARM64" ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    \
    curl -fsSLo /tmp/node.tgz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.gz"; \
    echo "${node_sha}  /tmp/node.tgz" | sha256sum -c -; \
    tar -xzf /tmp/node.tgz -C /usr/local --strip-components=1; \
    rm /tmp/node.tgz; \
    node --version; \
    \
    sha512_hex() { printf '%s' "$1" | base64 -d | od -A n -t x1 | tr -d ' \n'; }; \
    curl -fsSLo /tmp/cli.tgz "https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-${CLAUDE_CODE_VERSION}.tgz"; \
    echo "$(sha512_hex "$CLAUDE_CODE_SHA512_B64")  /tmp/cli.tgz" | sha512sum -c -; \
    curl -fsSLo /tmp/cli-platform.tgz "https://registry.npmjs.org/@anthropic-ai/claude-code-${cli_pkg}/-/claude-code-${cli_pkg}-${CLAUDE_CODE_VERSION}.tgz"; \
    echo "$(sha512_hex "$cli_sha_b64")  /tmp/cli-platform.tgz" | sha512sum -c -; \
    # --offline: nothing beyond the two verified tarballs may be resolved.
    # If a future version grows a required dependency, this line FAILS rather
    # than silently pulling unpinned bytes.
    npm install -g --offline --no-fund --no-audit /tmp/cli.tgz /tmp/cli-platform.tgz; \
    rm /tmp/cli.tgz /tmp/cli-platform.tgz; \
    # Wiring assertion, local and network-free: the installed launcher must
    # resolve its platform executable and report the pinned version.
    claude --version; \
    \
    apt-get purge -y curl; \
    apt-get autoremove -y; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /var/log/apt /var/log/dpkg.log \
      /var/log/alternatives.log /var/cache/ldconfig/aux-cache \
      /root/.npm /tmp/*

LABEL org.opencontainers.image.title="secure-home-runner-claude" \
      org.opencontainers.image.description="Reference derived runner image: the exact pinned secure-home-runner-base plus one pinned Claude Code runtime and only what it requires. No second runtime, no credential, no knowledge content." \
      io.secure-home.lineage="runner-derived" \
      io.secure-home.runtime.name="claude-code" \
      io.secure-home.runtime.version="2.1.241"

USER runner
WORKDIR /workspace
