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

# ca-certificates, git and curl are no longer named by version here: their
# exact artifacts, and their whole dependency closure, are pinned by SHA-256
# in packages.<arch>.manifest. A version ARG beside that would be a second,
# weaker spelling of the same pin.

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
# pnpm's npm tarball, pinned by content rather than fetched by version.
ARG PNPM_SHA256=29c35ca8d2a287988fdee3e0f36e07d9b93783f567b579b7fd5b798a4563dd81
# The CPython artifact itself. "3.13" is a range; this is a build.
ARG PYTHON_VERSION=3.13.15
ARG PYTHON_RELEASE=20260825
ARG PYTHON_SHA256_AMD64=8af9a8214c71b2dd698005e39fab87aad02a994330508857da4e6d1ba7e6ddb6
ARG PYTHON_SHA256_ARM64=e5d0df1a6070a8614d808496e5ea28c727480e40ffcce1a94697a067f1690aa8

ENV UV_PYTHON=/opt/python/bin/python3

# packages.<arch>.manifest is this image's projection of the shared authority
# at deploy/images/debian-closure.lock.json — one line per artifact, columns
# <sha256> <size> <package> <version> <filename>. The build consumes exactly
# that set; scripts/check-images.mjs refuses any drift between the two.
COPY packages.amd64.manifest packages.arm64.manifest /tmp/pkg/

RUN set -eux; \
    cd /tmp/pkg; \
    manifest="packages.${TARGETARCH}.manifest"; \
    manual_before="$(apt-mark showmanual)"; \
    apt-get update; \
    # `download`, never `install`. apt fetches EXACTLY the package=version
    # pairs named and resolves nothing, so the closure cannot silently grow;
    # a version that has left the archive fails here rather than being
    # substituted. The pairs are read as columns, never parsed out of a
    # filename — the pool drops the epoch that apt's own filename keeps.
    apt-get download -o APT::Sandbox::User=root $(awk '{print $3 "=" $4}' "${manifest}"); \
    # Content-addressed acceptance. Every artifact apt produced must BE one
    # of the reviewed ones, matched by hash and renamed to its reviewed name.
    # Anything else — an extra dependency, a substituted build — fails here
    # rather than being installed.
    for f in *.deb; do \
      h="$(sha256sum "$f" | cut -d' ' -f1)"; \
      want="$(awk -v h="$h" '$1 == h { print $5 }' "${manifest}")"; \
      [ -n "${want}" ] || { echo "unreviewed artifact: $f ($h)" >&2; exit 1; }; \
      [ "$f" = "${want}" ] || mv "$f" "${want}"; \
    done; \
    # Every reviewed artifact is present, and nothing beyond them.
    [ "$(ls -1 *.deb | wc -l)" = "$(wc -l < "${manifest}")" ] || \
      { echo "artifact count does not match the manifest" >&2; exit 1; }; \
    # Byte size, checked independently of the hash: a zero-length or truncated
    # artifact can never pass, whatever else agrees.
    while read -r sha size pkg ver name; do \
      actual="$(stat -c %s "${name}")"; \
      [ "${actual}" = "${size}" ] || \
        { echo "size mismatch ${name}: ${actual} != ${size}" >&2; exit 1; }; \
    done < "${manifest}"; \
    # The hash check in its canonical form, before anything is unpacked.
    # The checksum list is PROJECTED FROM THE SELECTED MANIFEST into a file
    # with a canonical name, and that exact file is what is verified — so the
    # verification cannot be satisfied by an unrelated checksum command that
    # happens to sit in the same instruction (node, uv, pnpm, CPython, the
    # runtime tarballs). scripts/check-images.mjs proves this binding.
    awk '{print $1 "  " $5}' "${manifest}" > /tmp/pkg/.sums; \
    sha256sum -c /tmp/pkg/.sums; \
    dpkg --install $(awk '{print $5}' "${manifest}"); \
    # dpkg does not maintain APT's auto/manual dependency marks. Reconstruct
    # the state apt-get install would have established without resolving
    # anything: the selected closure is auto, pre-existing manual packages
    # are restored, and the gate's runtime-required packages stay manual.
    apt-mark auto $(awk '{print $3}' "${manifest}"); \
    if [ -n "${manual_before}" ]; then apt-mark manual ${manual_before}; fi; \
    apt-mark manual ca-certificates git; \
    # git and ca-certificates: the shell gates (validate-scaffold,
    # scan-secrets, check.sh) need git + coreutils; TLS trust is needed at
    # BUILD time here and by nothing at gate run time. curl is build-only.
    # All three arrive as reviewed artifacts, with their whole closure.
    cd /; \
    rm -rf /tmp/pkg; \
    \
    case "$TARGETARCH" in \
      amd64) node_arch=x64;   node_sha="$NODE_SHA256_AMD64"; uv_triple=x86_64-unknown-linux-gnu;  uv_sha="$UV_SHA256_AMD64";  py_triple=x86_64-unknown-linux-gnu;  python_sha="$PYTHON_SHA256_AMD64" ;; \
      arm64) node_arch=arm64; node_sha="$NODE_SHA256_ARM64"; uv_triple=aarch64-unknown-linux-gnu; uv_sha="$UV_SHA256_ARM64"; py_triple=aarch64-unknown-linux-gnu; python_sha="$PYTHON_SHA256_ARM64" ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    \
    curl -fsSLo /tmp/node.tgz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.gz"; \
    echo "${node_sha}  /tmp/node.tgz" | sha256sum -c -; \
    tar -xzf /tmp/node.tgz -C /usr/local --strip-components=1; \
    rm /tmp/node.tgz; \
    node --version; \
    \
    # pnpm at the repository's exact packageManager pin. `corepack install`
    # named it by VERSION and fetched whatever the registry served; the
    # tarball is now pinned by SHA-256 like every other artifact here and
    # installed offline, so the pin is on bytes rather than on a name.
    curl -fsSLo /tmp/pnpm.tgz \
      "https://registry.npmjs.org/pnpm/-/pnpm-${PNPM_VERSION}.tgz"; \
    echo "${PNPM_SHA256}  /tmp/pnpm.tgz" | sha256sum -c -; \
    npm install -g --offline --no-fund --no-audit /tmp/pnpm.tgz; \
    rm /tmp/pnpm.tgz; \
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
    # The CPython the repository's uv workspace requires (>=3.13).
    # `uv python install 3.13` asked for a RANGE and took whatever the newest
    # 3.13.x happened to be; the interpreter is now a pinned artifact fetched
    # and verified exactly like node and uv, and uv is pointed at it through
    # UV_PYTHON so it never downloads one.
    curl -fsSLo /tmp/python.tgz \
      "https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${py_triple}-install_only_stripped.tar.gz"; \
    echo "${python_sha}  /tmp/python.tgz" | sha256sum -c -; \
    mkdir -p /opt; \
    tar -xzf /tmp/python.tgz -C /opt; \
    rm /tmp/python.tgz; \
    # The interpreter must be the exact patch that was reviewed, not merely
    # something that satisfies >=3.13.
    test "$(/opt/python/bin/python3 -c 'import platform; print(platform.python_version())')" \
      = "${PYTHON_VERSION}"; \
    # uv must RESOLVE the pinned interpreter rather than fetch one of its
    # own. `uv python find <version>` deliberately is not used: it searches
    # managed installations and PATH and ignores UV_PYTHON, so it would fail
    # on a correctly pinned image and pass on one that had downloaded its own.
    test "$(uv python find "${UV_PYTHON}")" = "${UV_PYTHON}"; \
    \
    apt-get purge -y curl; \
    apt-get autoremove -y; \
    # Regression guard: curl's private library must not survive merely because
    # dpkg installed the reviewed closure without APT auto marks. git uses the
    # separately named libcurl3t64-gnutls package.
    test "$(dpkg-query -W -f='${Status}' libcurl4t64 2>/dev/null || true)" != 'install ok installed'; \
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
