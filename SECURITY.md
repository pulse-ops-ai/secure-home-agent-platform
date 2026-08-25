# Security Policy

`secure-home-agent-platform` controls physical household systems. A defect here
can unlock a door, disable an alarm, or open a garage. Security reporting and
security review are therefore treated as first-class, not as an afterthought.

## Reporting a vulnerability

Report privately. **Do not open a public GitHub issue for a suspected
vulnerability.**

- Preferred: GitHub private vulnerability reporting on this repository
  (**Security → Report a vulnerability**).
- Alternative: contact the repository owner directly.

Please include the affected path, the trust boundary you believe is crossed
(see [`docs/architecture/trust-boundaries.md`](docs/architecture/trust-boundaries.md)),
and a reproduction or reasoning chain. If the finding involves a physical-safety
action (lock, garage, alarm, valve, HVAC), say so in the first line.

## Current status: landed code, no runtime

At the time of writing this repository contains documentation, governance,
workspace scaffolding, **and landed but inert platform code**: the runner
domain contracts, the trusted runner core, L4 `runner-control` orchestration
(behind ports — no container launch), the knowledge toolchain, the runner
image definitions ([`deploy/images/`](deploy/images/) — digest-locked
Dockerfiles and their lineage lock, built and verified only in CI, published
nowhere, referenced by no profile, launched by nothing), and the L7 coding
adapters ([`agents/adapters/coding/`](agents/adapters/coding/) — pure
translation to the frozen adapter SPI, zero runtime dependencies, exercised
only by the conformance suite against stub CLIs, invoked by no platform
code path).

There is still **no deployed service, no published or activated runner
image, no Home Assistant integration, and no credential material**.
Vulnerability reports against this repository are therefore reports about
*contracts, landed code, and supply-chain inputs* — for example, a
documented flow that would permit an agent to bypass an enforcement point, a
defect in landed decision logic that a future activation would inherit, or a
pinned image input that does not match its recorded identity.

## What is in scope

- Architecture contracts that would, if implemented as written, permit a trust
  boundary to be crossed without verifiable evidence.
- Any ADR or architecture document that grants an agent runtime insider status,
  a privileged back-channel, or direct device authority.
- Secrets, tokens, private keys, real device identifiers, or household
  personally-identifying data committed to this repository.
- Scaffolding that would cause a future implementation to fail *open* on a
  sensitive action.

## What is out of scope

- Vulnerabilities in upstream projects (Home Assistant, Keycloak, OpenFGA,
  Traefik, Tailscale, Docker). Report those upstream.
- The reference implementations in
  [`pulse-ops-ai/platform-edge`](https://github.com/pulse-ops-ai/platform-edge)
  and
  [`pulse-ops-ai/security-first-platform-architecture`](https://github.com/pulse-ops-ai/security-first-platform-architecture).
  Report those in their own repositories.

## Hard rules for contributors and agents

These are enforced by review, and partially by
[`scripts/validate-scaffold.sh`](scripts/validate-scaffold.sh):

1. **No secrets in the repository.** Not in code, not in documentation, not in
   examples, not in test fixtures. Placeholders must be obviously fake and must
   not resemble a real token.
2. **No live device control from this repository.** No component here may hold a
   Home Assistant long-lived owner token. See
   [`ADR-0004`](docs/decisions/ADR-0004-treat-agents-as-clients.md).
3. **No privileged back-channels.** Agents re-enter the platform through
   governed API enforcement points. See
   [`docs/architecture/identity-and-authorization-flow.md`](docs/architecture/identity-and-authorization-flow.md).
4. **Sensitive actions fail closed.** When authorization cannot be decided, a
   sensitive household action must not proceed. See
   [`docs/architecture/degraded-mode.md`](docs/architecture/degraded-mode.md).
5. **Network position is not authority.** Membership in the tailnet or a Docker
   network is a reachability fact, never an identity or an authorization.

## Security review obligations

Any pull request that touches trust boundaries, identity, authorization, the
runner model, the safety policy surface, or the degraded-mode posture must state
in its description which of the above rules it affects and how it preserves
them. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
