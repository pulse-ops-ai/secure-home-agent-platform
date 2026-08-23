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
# Every input is pinned: the external base by immutable digest, and every
# named package to an exact archive version — so rebuilding this definition
# through the governed build path yields the same identity while the pinned
# archive inputs remain published, and any archive movement fails the build
# or the digest comparison LOUDLY, never silently. (The snapshot service
# refuses the governed builder's address space, so a frozen snapshot is not
# an available mechanism; the narrowed claim is recorded in the child
# design.)

FROM docker.io/library/debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258

# Exact archive versions, resolved from the trixie archive on 2026-08-23.
# Moving a pin is a reviewed change that moves every digest built from it;
# a vanished pin fails `apt-get install` rather than drifting.
ARG CA_CERTIFICATES_VERSION=20250419
ARG TINI_VERSION=0.19.0-3+b7
# Fixed so layer metadata cannot carry build wall-clock into the identity.
ARG SOURCE_DATE_EPOCH=0

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      "ca-certificates=${CA_CERTIFICATES_VERSION}" \
      "tini=${TINI_VERSION}"; \
    apt-get clean; \
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
