# secure-home-runner-copilot — the Copilot derived runner image.
#
# Exactly one provider runtime on top of the exact pinned base, plus only
# what that runtime requires (ADR-0011: one coding agent per derived image;
# a second runtime here is prohibited, not discouraged). No credential, no
# provider configuration, no knowledge content: credentials are provisioned
# at run time from the profile (never baked), and knowledge reaches a run
# through the platform's own resolution — never through image bytes.
#
# The pinned version is 1.0.79 deliberately, not the registry's latest:
# it is the version the L6 spike evidence (docs/spikes/l6-copilot-cli/)
# was gathered against, and the paired adapter's normalization basis must
# match the binary this image carries.
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

# The runtime engine, pinned to the repository's own Node version and
# verified against the published release checksums (nodejs.org SHASUMS256,
# resolved 2026-08-23). The Copilot CLI ships its own embedded runtime for
# execution; this Node exists to run npm for the offline install and the
# npm-generated launcher shim.
ARG NODE_VERSION=24.18.1
ARG NODE_SHA256_AMD64=9f5eb6ac21845a66c493c91a253b1da32fd684e89e9b7202d4936982336be4ca
ARG NODE_SHA256_ARM64=df224555a083b918e46260cc969838501b9f9a87140c1195e5b9597b56d5dae2

# The one runtime this image exists to carry. Version and integrity resolved
# from registry.npmjs.org on 2026-08-23 and recorded in image-lock.yaml; the
# tarball bytes are verified against the recorded sha512 BEFORE installation,
# so the registry's mutable metadata is not on the build trust path. The
# runtime ships its executable as a per-platform package at the same version;
# the matching platform package is pinned and verified the same way.
# The explicit runtime installation declaration: exact well-known ARG names
# the lineage checker validates against the lock registration, and which the
# install step below CONSUMES — the mechanical tie between "registered" and
# "installed" is that this identity flows into an executed build instruction.
ARG RUNTIME_PACKAGE=@github/copilot
ARG RUNTIME_VERSION=1.0.79
ARG COPILOT_SHA512_B64=uHBm2BYbKJgyfiKp1WokX7QUNHGvzEX0zaGeb3qM3CybP06rsJrX3JgQe95qwwma6vQz0ah9gV68ERW2JqaKRA==
ARG COPILOT_SHA512_B64_AMD64=wzotZfvHkItutciLFMXZT2k9Qiii4Ta8tsVDCMQ7CP8hPxV91FyJ1yf3+FFSSfPvWrfYM6BOAiqIuX+LjgRuiw==
ARG COPILOT_SHA512_B64_ARM64=qqaNkvi92Wg+4OZk/kTWC2nUG72G0vV6eRAo5+PnKaPmjdX1GsI0a+lPxXPEbzX0zYLi/8yrUyANwyyNEsGgXA==

# The runtime's ONE required helper dependency (platform-package selection),
# exact-version pinned and verified like everything else. Not a second
# runtime: it carries no provider identity and installs no executable
# surface — it exists so the offline install below can resolve the
# runtime's declared dependency without touching mutable registry metadata.
ARG DETECT_LIBC_VERSION=2.1.2
ARG DETECT_LIBC_SHA512_B64=Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==

# packages.<arch>.manifest is this image's projection of the shared authority
# at deploy/images/debian-closure.lock.json — one line per artifact, columns
# <sha256> <size> <package> <version> <filename>. The build consumes exactly
# that set; scripts/check-images.mjs refuses any drift between the two.
COPY packages.amd64.manifest packages.arm64.manifest /tmp/pkg/

USER root

RUN set -eux; \
    cd /tmp/pkg; \
    manifest="packages.${TARGETARCH}.manifest"; \
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
    # git: repository operation is this runtime's function. curl: build-time
    # fetch only, purged below so the runtime surface stays minimal. Both
    # arrive as reviewed artifacts, with their whole closure.
    cd /; \
    rm -rf /tmp/pkg; \
    \
    case "$TARGETARCH" in \
      amd64) node_arch=x64;   node_sha="$NODE_SHA256_AMD64";  cli_pkg=linux-x64;   cli_sha_b64="$COPILOT_SHA512_B64_AMD64" ;; \
      arm64) node_arch=arm64; node_sha="$NODE_SHA256_ARM64";  cli_pkg=linux-arm64; cli_sha_b64="$COPILOT_SHA512_B64_ARM64" ;; \
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
    pkg_base="${RUNTIME_PACKAGE#*/}"; \
    curl -fsSLo /tmp/cli.tgz "https://registry.npmjs.org/${RUNTIME_PACKAGE}/-/${pkg_base}-${RUNTIME_VERSION}.tgz"; \
    echo "$(sha512_hex "$COPILOT_SHA512_B64")  /tmp/cli.tgz" | sha512sum -c -; \
    curl -fsSLo /tmp/cli-platform.tgz "https://registry.npmjs.org/${RUNTIME_PACKAGE}-${cli_pkg}/-/${pkg_base}-${cli_pkg}-${RUNTIME_VERSION}.tgz"; \
    echo "$(sha512_hex "$cli_sha_b64")  /tmp/cli-platform.tgz" | sha512sum -c -; \
    curl -fsSLo /tmp/detect-libc.tgz "https://registry.npmjs.org/detect-libc/-/detect-libc-${DETECT_LIBC_VERSION}.tgz"; \
    echo "$(sha512_hex "$DETECT_LIBC_SHA512_B64")  /tmp/detect-libc.tgz" | sha512sum -c -; \
    # --offline: nothing beyond the three verified tarballs may be resolved.
    # detect-libc is installed EXPLICITLY because it is a required dependency
    # of the runtime: offline npm cannot resolve its semver range from the
    # registry, so the exact verified tarball lands as a sibling global
    # package that Node module resolution satisfies the requirement from.
    # If a future version grows another required dependency, this line FAILS
    # rather than silently pulling unpinned bytes.
    npm install -g --offline --no-fund --no-audit /tmp/cli.tgz /tmp/cli-platform.tgz /tmp/detect-libc.tgz; \
    rm /tmp/cli.tgz /tmp/cli-platform.tgz /tmp/detect-libc.tgz; \
    # Wiring assertion, local and network-free: the installed launcher must
    # resolve its platform executable and report the pinned version.
    copilot --version; \
    \
    apt-get purge -y curl; \
    apt-get autoremove -y; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /var/log/apt /var/log/dpkg.log \
      /var/log/alternatives.log /var/cache/ldconfig/aux-cache \
      /root/.npm /tmp/*

LABEL org.opencontainers.image.title="secure-home-runner-copilot" \
      org.opencontainers.image.description="Copilot derived runner image: the exact pinned secure-home-runner-base plus one pinned GitHub Copilot CLI runtime and only what it requires. No second runtime, no credential, no knowledge content." \
      io.secure-home.lineage="runner-derived" \
      io.secure-home.runtime.name="copilot" \
      io.secure-home.runtime.version="1.0.79"

USER runner
WORKDIR /workspace
