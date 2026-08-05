# ADR-0002: Adopt a hybrid-home deployment profile

- **Status:** Accepted
- **Date:** 2026-08-03
- **Accepted:** 2026-08-05
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0001](ADR-0001-adopt-security-first-architecture.md), [ADR-0007](ADR-0007-route-local-remote-and-cloud-execution-explicitly.md), [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md), [`docs/architecture/system-context.md`](../architecture/system-context.md), [`docs/architecture/local-remote-routing.md`](../architecture/local-remote-routing.md)

## Context

The physical environment is fixed and is not a design variable:

- A **Raspberry Pi 5** (8 GB RAM, 256 GB NVMe, Debian 13 ARM64, Docker Compose)
  in the house. Home Assistant Container will run here later.
- A **VPS** running PostgreSQL/TimescaleDB — the only durable, authoritative
  datastore. **No authoritative database is local to the Pi.**
- An **Exxact GPU workstation** for optional heavyweight inference.
- **Tailscale** connecting the Pi, the VPS, the workstation, and operator
  devices.
- The workspace's **shared platform edge** for public/remote access.
- **Keycloak** as the identity provider, operated externally.
- **Gridwise**, which already provides energy intelligence.

The upstream architecture offers three reference profiles: `self-hosted-vps`,
`aws-managed`, and `hybrid-tailnet`. None of them fits as-is. `hybrid-tailnet`
is closest, but it is written as "AWS-managed plus a mesh", and its stated
posture is that the public edge remains the only way in. That is correct for a
SaaS product and wrong for a house: **the house must keep working when the WAN
is down.**

The requirement that forces this ADR is blunt: *basic household operation must
not require a WAN round-trip, the shared edge, the VPS, or the Exxact machine.*

## Decision

Define and adopt a **hybrid-home** deployment profile, a household variant of
`hybrid-tailnet` with one structural difference: **two ingress paths with
different availability requirements, both fully governed.**

### Path A — remote/public access (shared edge)

`operator device → public internet → shared platform edge (L1–L5) → tailnet → Pi (L6/L7)`

- The shared edge owns L1–L5 for this path.
- Used by browser and mobile access from outside the house, and by any
  integration originating outside the tailnet.
- May be unavailable. When it is, remote access is lost; **household operation
  is not.**

### Path B — local household path (Pi-local enforcement)

`in-home client or Home Assistant Voice → tailnet or LAN → Pi ingress → Pi L6 → Pi L7 → Home Assistant → device`

- The Pi owns L6 and L7 for this path and performs its own local enforcement.
- No mandatory WAN round-trip.
- This is the path that must survive a WAN, shared-edge, or coordination-plane
  outage. Which operations survive, and which fail closed, is decided in
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) and
  classified in
  [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md).

### Layer ownership under this profile

| Layer | Path A (remote) | Path B (local) | Owner |
|---|---|---|---|
| L1 network reachability | shared edge ingress | LAN + tailnet | shared / this repo |
| L2 edge gateway | shared edge gateway | Traefik on the Pi | shared / this repo |
| L3 identity | Keycloak (external, consumed) | Keycloak (external, consumed) | consumed |
| L4 authorization | shared coarse decision **plus** household fine decision | household fine decision | shared / this repo |
| L5 operational guardrails | shared edge (currently `n/a` upstream) | Pi-local guardrails | shared / this repo |
| L6 orchestrator / BFF | **this repo** | **this repo** | this repo |
| L7 service enforcement | **this repo** | **this repo** | this repo |
| L8 semantic / agent | agent runners are clients on both paths | agent runners are clients on both paths | this repo |

### Fixed properties of the profile

- **Tailscale is private connectivity, never identity and never authorization.**
  This is inherited verbatim from `hybrid-tailnet` and is non-negotiable.
- **The VPS holds durable data.** Timeseries, audit, run evidence, and
  automation state live there. The Pi is not authoritative for them.
- **The Exxact workstation is optional.** No household operation may block on it.
- **Gridwise is an upstream energy-intelligence source**, consumed over its own
  interface. This repository does not reimplement energy intelligence.
- **Home Assistant is a device/state substrate**, not an authorization boundary
  and not a policy engine.

## Consequences

**Positive.**

- Household availability is decoupled from WAN, shared-edge, and cloud
  availability by construction rather than by hope.
- Remote access keeps every control the shared edge already provides, without
  the household path inheriting the shared edge's failure modes.
- Layer ownership is explicit, so "who enforces this?" always has an answer.

**Negative.**

- **Two enforcement paths must be kept equivalent.** This is the profile's
  principal risk: a control added to one path and forgotten on the other is a
  bypass. Equivalence must be tested, not assumed.
- The Pi becomes a genuine control plane with L6 and L7 responsibilities on a
  single host, and single-host co-location makes process and container isolation
  load-bearing.
- Durable state on the VPS means the local path is *available* but not
  *authoritative* for history; local operation must tolerate not being able to
  write durably.

**Neutral.**

- The profile is a household specialization, not a new architecture. It adds no
  layers and weakens no contract.

## Alternatives considered

- **Everything through the shared edge (pure `hybrid-tailnet`).** Rejected: a
  WAN or edge outage would take the lights, the thermostat, and the smoke
  response with it. Unacceptable for a house.
- **Everything local, no shared edge.** Rejected: remote access would then be
  either absent or an ad-hoc port-forward, which is exactly the perimeter model
  the architecture rejects. It also discards working shared L1–L5 controls.
- **Run the authoritative database on the Pi.** Rejected: the Pi is a
  consumer-grade device on household power with a single NVMe. It is the wrong
  place for the system of record. Also contradicts the stated environment.
- **Home Assistant as the authorization boundary.** Rejected: Home Assistant is
  a device/state substrate. Making it the policy decision point would collapse
  identity, authorization, and device control into one component — the
  collapsed-concern failure mode.
- **Adopt `self-hosted-vps` unchanged.** Rejected: it has no household node and
  no local-first availability posture at all.

## Security implications

- Two ingress paths mean two places to get enforcement right. The local path
  must not be a weaker sibling of the remote path; it is *closer to the devices*,
  so if anything it warrants tighter controls.
- Co-location on one Pi means a Docker network alone conveys no authority. Every
  hop still requires verifiable evidence. See
  [`docs/architecture/trust-boundaries.md`](../architecture/trust-boundaries.md).
- The tailnet materially reduces exposure but must never be cited as an
  authorization reason. "It came over the tailnet" is a reachability statement.
- The shared edge's L4 is currently **audit-only** upstream, so a `deny` there
  does not stop a request today. Household enforcement cannot be delegated to
  it. See [ADR-0001](ADR-0001-adopt-security-first-architecture.md).

## Availability implications

- **Household operation target:** survives WAN loss, shared-edge loss, VPS loss,
  and Exxact loss.
- **Remote access:** depends on the WAN and the shared edge. Expected to fail
  and to fail visibly.
- **Durable writes:** depend on the VPS. Local operation must degrade to
  buffered or dropped telemetry without blocking a physical action, while audit
  for sensitive actions must not be silently lost — a tension that
  [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) must
  resolve.
- **Authorization availability is the open problem.** A household path that
  depends on a remote policy decision point is not local-first. The mechanism is
  deliberately unresolved; see
  [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md).

## Validation and follow-up obligations

1. Write the profile up as a proper profile document (layer-by-layer mapping,
   observability mapping, failure modes, migration paths, compensating controls)
   in the form the upstream architecture requires, and decide whether it should
   be contributed upstream as a fourth reference profile.
2. Add a **path-equivalence conformance test**: for a representative action set,
   assert that Path A and Path B reach the same decision, including the deny
   cases. Belongs in [`tests/policy-scenarios/`](../../tests/policy-scenarios/).
3. Add a degraded-mode drill to
   [`docs/operations/`](../operations/INDEX.md) that severs the WAN and confirms
   the classification in
   [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md)
   holds in reality.
4. Record the shared-edge dependency for Path A once the shared edge is actually
   used, including its audit-only caveat.

## References

- Upstream `architecture/profiles/hybrid-tailnet.md` @ `v0.3.0`
- Upstream `architecture/profiles/self-hosted-vps.md` @ `v0.3.0`
- [`docs/architecture/system-context.md`](../architecture/system-context.md)
- [`docs/architecture/local-remote-routing.md`](../architecture/local-remote-routing.md)
- [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md)

---

**Accepted and immutable.** Do not edit this ADR. Reverse or amend the decision
by writing a new ADR that supersedes it, and update
[`INDEX.md`](INDEX.md) in the same change.
