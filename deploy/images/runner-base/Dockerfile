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
# Every input is immutable: the external base is digest-pinned, and every apt
# byte comes from one frozen snapshot, so rebuilding this definition through
# the governed build path yields the same identity.

FROM docker.io/library/debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258

# The one governed apt source: a frozen snapshot. Moving this timestamp is a
# reviewed change that moves every digest built from it.
ARG DEBIAN_SNAPSHOT=20260819T205155Z
# Fixed so layer metadata cannot carry build wall-clock into the identity.
ARG SOURCE_DATE_EPOCH=0

RUN set -eux; \
    # apt's native per-source Snapshot field (apt >= 2.7.10; Debian 13):
    # the STOCK sources and keyrings stay authoritative, and every fetch is
    # served from the frozen snapshot via the CDN — the raw snapshot host
    # rate-limits and its stale validity windows would otherwise make old
    # snapshots unfetchable. The grep asserts the pin landed in BOTH stanzas
    # (debian and debian-security), so a changed stock layout fails loudly
    # instead of silently building from moving mirrors.
    sed -i "s|^Components: main$|Components: main\nSnapshot: ${DEBIAN_SNAPSHOT}|" \
      /etc/apt/sources.list.d/debian.sources; \
    test "$(grep -c "^Snapshot: ${DEBIAN_SNAPSHOT}\$" /etc/apt/sources.list.d/debian.sources)" = 2; \
    printf 'Acquire::Check-Valid-Until "false";\nAcquire::Retries "5";\n' \
      > /etc/apt/apt.conf.d/99secure-home-snapshot; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      tini; \
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
