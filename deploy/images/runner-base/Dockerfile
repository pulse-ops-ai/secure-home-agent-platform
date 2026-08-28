# secure-home-runner-base — the provider-neutral untrusted workload substrate.
#
# This image is WHERE a workload executes, and nothing more. Decision-bearing
# orchestration — authority acquisition, profile decisions, policy
# interpretation, gate membership, classification, lifecycle and finalization
# authority, evidence sealing — lives in trusted platform code OUTSIDE every
# image (services/runner-control, L4), and physical enforcement is L9. The
# image owns only a minimal OS surface, process bootstrap, and two filesystem
# conventions the substrate mounts into. No provider CLI, no framework
# runtime, no SDK, no credential handling: a provider or framework name
# anywhere in this file is a lineage violation (ADR-0011).
#
# REPRODUCIBILITY. Every input is pinned as an ARTIFACT, not as a request:
# the external base by immutable digest, and every package by SHA-256 and byte
# size in this image's projection of the shared closure authority
# (deploy/images/debian-closure.lock.json). Nothing here resolves a dependency
# at build time, so nothing in the closure can move while the definition
# stands still.
#
# An earlier revision pinned only the two NAMED packages by version and let
# `apt-get install` resolve the rest. That closure was never pinned: the
# archive moved openssl 3.5.6 -> 3.5.7 under an unchanged Dockerfile, the
# image digest moved with it, and every derived image's parent pin broke. The
# identity gate caught it, which is what it is for. Pinning the named
# packages alone is insufficient and must not be reintroduced.
#
# The snapshot service refuses the governed builder's address space, so a
# frozen archive snapshot is not an available mechanism; the manifest is the
# fallback, and the narrowed claim is recorded in the child design.
#
# COST, ACCEPTED DELIBERATELY. Debian removes superseded .deb files from the
# pool, so a pinned artifact eventually stops being fetchable and the build
# FAILS LOUDLY. Taking a security update therefore becomes a reviewed
# manifest bump that moves every digest built from it — which is the point.
# Silent pickup is the failure mode being removed, not a feature being kept.

FROM docker.io/library/debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258

# Supplied by the builder per platform; selects this build's manifest.
ARG TARGETARCH
# Fixed so layer metadata cannot carry build wall-clock into the identity.
ARG SOURCE_DATE_EPOCH=0

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
    # are restored, and the substrate's requested packages stay manual.
    apt-mark auto $(awk '{print $3}' "${manifest}"); \
    if [ -n "${manual_before}" ]; then apt-mark manual ${manual_before}; fi; \
    apt-mark manual ca-certificates tini; \
    apt-get clean; \
    # The .deb files never enter a layer: fetched, verified, installed, and
    # removed inside this one instruction.
    cd /; \
    rm -rf /tmp/pkg; \
    # Nondeterministic file CONTENT is removed, not just retimed: apt/dpkg
    # logs and the ldconfig aux-cache embed wall-clock and host facts.
    rm -rf /var/lib/apt/lists/* /var/log/apt /var/log/dpkg.log \
      /var/log/alternatives.log /var/cache/ldconfig/aux-cache

RUN set -eux; \
    groupadd --gid 10001 runner; \
    useradd --uid 10001 --gid 10001 --create-home --home-dir /home/runner \
      --shell /usr/sbin/nologin runner; \
    # shadow's lastchg field is "days since epoch at build" — normalize it so
    # the account metadata does not re-identify the image daily.
    sed -ri 's/^(runner:[^:]*):[0-9]+:/\1:1:/' /etc/shadow; \
    # The two substrate conventions. /workspace is the workload's working
    # tree; /run/platform is where the substrate mounts event/evidence
    # plumbing at launch. Both are empty by construction: a convention cannot
    # decide anything, which is exactly why it is all the image may own.
    mkdir -p /workspace /run/platform; \
    chown runner:runner /workspace /run/platform

LABEL org.opencontainers.image.title="secure-home-runner-base" \
      org.opencontainers.image.description="Provider-neutral untrusted workload substrate. Minimal OS, process bootstrap, and substrate mount conventions only — no agent runtime, no framework, no credential handling, no decision-bearing platform code." \
      io.secure-home.lineage="runner-base"

USER runner
WORKDIR /workspace

# tini as PID 1: signal forwarding and zombie reaping for an arbitrary
# workload. Deliberately no CMD — this image is inert; only the platform
# launcher (L9, not yet landed) supplies a command.
ENTRYPOINT ["/usr/bin/tini", "--"]
