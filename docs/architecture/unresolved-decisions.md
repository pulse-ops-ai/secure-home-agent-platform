# Unresolved Decisions

Questions this repository has **deliberately not answered**. They are recorded
here so that nobody silently answers them by writing code.

> **Three acceptances have happened. Exactly one closed anything in this file.**
>
> | Accepted | What | Effect here |
> |---|---|---|
> | 2026-08-05 | the eleven foundational ADRs | none — every item then open stayed open |
> | 2026-08-06 | ADR-0012, the implementation stack | none — and it **added** [U11](#u11) |
> | 2026-08-12 | ADR-0013, the runner adapter SPI | **closed [U6](#u6)** — the first item ever to leave |
>
> The first two acceptances left every item open deliberately, and were granted
> on that basis — not in spite of it. An accepted ADR does **not** authorize
> resolving an item here by implementation; ADR-0013 closed U6 by *answering
> it*, which is the only mechanism this file admits.
>
> The practical consequence: work that depends on an item below is still blocked,
> **`BOUNDED` still behaves as `FAIL CLOSED`** ([U1](#u1)), and **no persistence
> toolkit is selected** ([U11](#u11)). See
> [what acceptance does and does not unblock](../decisions/INDEX.md#what-acceptance-does-and-does-not-unblock)
> and [the ADR-0012 acceptance record](../decisions/INDEX.md#adr-0012-acceptance-record).

**Rules for this file:**

- An item leaves this file only via a **new** ADR. Not via an implementation,
  not via a README, not via a pull-request comment, and not as a side effect of
  any ADR having been accepted.
- If a change requires an answer to an item here, the change is blocked until
  that ADR exists — or the change must work correctly under *every* candidate
  answer.
- Adding an item is cheap and encouraged. Removing one is a governed act.
- A resolved item is **marked resolved in place**, never deleted: its section
  stays, headed by the ADR that answered it. Deleting the section would break
  every inbound reference and erase the question a future reader most needs —
  *what were we unsure about, and what settled it?* The summary table shows its
  state at a glance.

| # | Question | Blocks | Severity |
|---|---|---|---|
| [U1](#u1) | Local OpenFGA replica vs. signed grants vs. bounded cache | any offline household authorization | **critical** |
| [U2](#u2) | Workload-identity mechanism for runner credentials | any agent that calls a governed API | high |
| [U3](#u3) | Which service issues the L6 internal identity envelope | all L7 verification | high |
| [U4](#u4) | `runner-control` placement — Pi vs. VPS | runner substrate implementation | medium |
| [U5](#u5) | Automation persistence and scheduler | automation service | medium |
| [U6](#u6) | The framework-adapter SPI | ~~every adapter~~ | **RESOLVED** — [ADR-0013](../decisions/ADR-0013-define-the-runner-adapter-spi.md), 2026-08-12 |
| [U7](#u7) | OKF validator and toolchain | any real knowledge bundle | medium |
| [U8](#u8) | Whether shared and household OpenFGA share a runtime | household authorization deployment | medium |
| [U9](#u9) | Policy-decision caching semantics | authorization performance and U1 | high |
| [U10](#u10) | Home Assistant credential strategy | action mediation | high |
| [U11](#u11) | Persistence toolkit selection | any schema, migration, or repository work | high |

---

## U1

### Local OpenFGA replica vs. signed grants / capability leases vs. bounded cache

**Severity: critical.** This is the hardest and most consequential open question
in the repository.

**The problem.** [ADR-0002](../decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md)
requires household operation without a WAN round trip.
[ADR-0008](../decisions/ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md)
puts authorization on the sensitive-action path. A central decision point cannot
satisfy both. Something must be able to decide locally.

**Candidates.**

| Candidate | Revocation latency | Key management | Operational cost on a Pi |
|---|---|---|---|
| Local OpenFGA read replica | replication lag | none new | second datastore on the Pi |
| Signed grants / capability leases | lease lifetime | signing key + rotation reachable from the Pi | low storage, real crypto operations |
| Bounded decision cache | cache TTL | none new | trivial |

**Why it is not decided.** All three have the same shape of flaw — local
authority is stale authority, and staleness is a revocation window. The right
choice depends on measured behaviour that does not exist yet: how often
authorization is actually consulted on the local path, how long real outages
last, and how quickly a revocation must take effect for a door lock.

**Evidence needed before deciding.** Real request rates on the local path;
observed outage durations; a stated maximum acceptable revocation window **per
sensitivity class** (this is a household-owner decision, not a technical one);
key-management feasibility on the Pi.

**Interim posture.** `BOUNDED` behaves as `FAIL CLOSED`. See
[`degraded-mode.md`](degraded-mode.md).

**Owner:** requires an ADR. **Do not implement any local authority mechanism
before it exists.**

---

## U2

### Workload-identity mechanism for runner credentials

**The problem.** [ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md)
requires each run to authenticate as an agent principal with a short-lived
credential — never a shared static key. How a sandbox obtains that credential
without becoming able to mint its own is unresolved.

**Candidates.** Client credentials issued per run by `runner-control`;
mTLS with a per-run certificate; a Keycloak token-exchange flow; an
OIDC-style workload-identity federation.

**Constraints.** The credential must be scoped to one run and expire with it. The
sandbox is untrusted, so it must not hold anything that lets it obtain a broader
credential. The mechanism must work when the identity provider is unreachable —
or its failure mode must be classified in
[`degraded-mode.md`](degraded-mode.md).

**Blocks:** any agent that calls a governed API.

---

## U3

### Which service issues the L6 internal identity envelope

**The problem.** Only L6 mints the envelope, and every L7 service verifies it.
Which concrete service plays L6 here is not decided.

**Candidates.** The web BFF (natural for browser traffic, wrong for voice and
agent traffic); `pi-api` as a household L6; a dedicated envelope issuer; two
issuers (one per ingress path — which risks divergence).

**Constraints.** Both ingress paths must converge on the **same** enforcement
semantics ([`local-remote-routing.md`](local-remote-routing.md)). Two issuers
means two sets of claims to keep identical. The issuer holds the signing key and
becomes a high-value target.

**Blocks:** all L7 verification. Nothing can verify an envelope nobody issues.

---

## U4

### `runner-control` placement — Pi vs. VPS

**Trade-off.** On the Pi: works offline, runs close to the household API,
competes for 8 GB of RAM with the control path. On the VPS: more resources,
does not contend with household control, but agent runs stop when the WAN is
down and the local path loses its runner. Both: highest complexity, two
substrates to keep equivalent.

**Constraints.** Coding-agent runs are not household-critical and could live
remotely. Household agent runs are more useful locally. Resource contention on
the Pi is a genuine risk to the control path.

**Not blocking the scaffold**, but it must be settled before the substrate is
built.

---

## U5

### Automation persistence and scheduler implementation

**The problem.** Automations are persisted, triggered, expiring, and
profile-bound ([ADR-0006](../decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)).
Where they are stored and what fires them is undecided.

**Tension.** The VPS is the authoritative datastore, but a VPS outage must not
stop local automations from being evaluated — while a local copy risks
double-firing on recovery.

**Constraints.** Expiration must be enforced even during an outage (an expired
automation must not fire). Missed triggers must not replay unless declared.
Local safety automations are deliberately **not** in this system — they are
deterministic local behaviour with no dependency on it.

---

## U6

### The initial framework-adapter SPI

> **RESOLVED 2026-08-12 by
> [ADR-0013](../decisions/ADR-0013-define-the-runner-adapter-spi.md).** The
> question below is kept as written, because the answer only makes sense
> against it. Nothing here blocks work any longer; read the ADR for what was
> decided and the
> [L6 spike evidence](../spikes/l6-copilot-cli/) for what it was decided on.
>
> The short version: adapters translate and report but never decide or enforce;
> capability narrowing at the adapter and capability enforcement at the
> substrate are **different layers with different proofs**; and the provider's
> own terminal state is observational, never authoritative.

**The problem.** [ADR-0003](../decisions/ADR-0003-use-framework-neutral-runner-profiles.md)
requires adapters, but the interface between substrate and adapter is undefined:
what is passed in, what is returned, how failure and partial progress are
reported, and how cancellation propagates into a runtime that may not support
it.

**Constraint.** The SPI must be expressible by all six intended adapters — three
coding CLIs and three framework runtimes — without a provider name appearing in
a structural position.

**Approach.** Define it against the two most dissimilar adapters (a coding CLI
and a plain deterministic loop) rather than against the most convenient one.

---

## U7

### First OKF validator and toolchain

> **STILL OPEN.** A *proposed* answer exists —
> [ADR-0015](../decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
> — and it is `Proposed`, so **it closes nothing**. An item leaves this file only
> via an **accepted** ADR.
>
> Read it for the proposed direction, not for permission. Two gates stand
> between it and authoring, and both must fall: human acceptance, and the
> implementation gate in its §12 — compile/validate/package/query behind the
> ADR-0010 interfaces, a conformance suite with a failing negative case per
> prohibited-content class, and demonstrated digest reproducibility. Acceptance
> alone is **not** permission to author.

**The problem.** [ADR-0010](../decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
requires compile, validate, package, and query interfaces and a machine-checked
prohibited-content rule. Whether OKF is the right format is unvalidated, and no
toolchain exists.

**Gate.** The validator must exist **before** the first real bundle is authored.
Authoring bundles first would put unvalidated content in the repository and make
the format load-bearing by accident.

---

## U8

### Do the shared and household OpenFGA stores share one runtime?

**Trade-off.** One runtime: less to operate, one place to look, but the household
model's availability is coupled to the shared edge's, and a shared-edge incident
becomes a household incident. Separate runtimes: independent availability and
independent evolution, at the cost of a second store to operate and two models to
keep coherent.

**Interaction.** This is entangled with [U1](#u1) — a local replica implies a
household store that *can* be replicated to the Pi, which points toward
separation.

---

## U9

### Policy-decision caching semantics

**The problem.** May an authorization decision be cached? For how long? For which
actions? How does revocation propagate?

**Why it is hard.** The answer is not uniform. Caching a decision for
"read the living-room temperature" for 60 seconds is unremarkable. Caching one
for "unlock the front door" for 60 seconds is a 60-second revocation window on
physical access.

**Requirement.** Any caching policy must be **per sensitivity class**, with the
window stated explicitly and reviewed as a security parameter.

**Interaction.** A bounded decision cache is one of [U1](#u1)'s candidates; if it
is chosen, U9 becomes part of that answer rather than a separate one.

---

## U10

### Home Assistant credential strategy

**The problem.** [ADR-0004](../decisions/ADR-0004-treat-agents-as-clients.md)
forbids long-lived owner tokens and concentrates Home Assistant credentials in
the action-mediation service. What credential that service actually holds is
undecided.

**Candidates.** A long-lived token for a dedicated, minimally-privileged Home
Assistant user; a per-session token obtained at startup; a Home Assistant user
per capability class; a local integration path that avoids a bearer token
entirely.

**Constraints.** Home Assistant's own permission model is coarse. Whatever is
chosen must be revocable without disrupting household operation, must not be
readable by any runner, and must be scoped as narrowly as Home Assistant allows —
which may not be narrow enough, in which case the compensating control must be
documented.

**Interaction.** The mediation service becomes the highest-value credential
holder in the house. Its surface must be minimal.

---

## U11

### Persistence toolkit selection

**Added by** [ADR-0012](../decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md).

**The problem.** ADR-0012 decides the *boundary* — Zod owns DTOs and API/domain
types, the persistence toolkit owns tables, indexes, constraints, migrations, and
RLS, and PostgreSQL is authoritative. It does **not** choose the toolkit.

**Why it is not decided.** There is no data model, no query workload, and no RLS
design in this repository yet. Choosing between TypeORM, Drizzle, Kysely, and
Prisma now would be a preference dressed as a decision, and the cost of being
wrong is a migration across every repository class.

**Selection criteria**, in priority order:

1. **PostgreSQL RLS compatibility** — can it set the session/transaction context
   RLS needs without fighting a connection pool? This is the highest-stakes
   criterion, because RLS is the defence-in-depth layer beneath application
   authorization.
2. **Query-AST mapping** — can a validated projection AST
   ([`api-contract-model.md`](api-contract-model.md)) be compiled to a safe query
   without string interpolation anywhere?
3. **Migration story** — deterministic, reviewable, reversible, and runnable on a
   VPS without a live-schema-diff step nobody read.
4. **TimescaleDB compatibility** — hypertables and continuous aggregates are
   likely for household telemetry.
5. **Type inference that does not leak** — inferring row types is useful;
   inferring them *into DTOs* is prohibited, so the toolkit must not make that
   the path of least resistance.
6. **Cursor pagination** on a compound sort with a stable tie-breaker.
7. **Operational weight on a Pi and a small VPS.**

**Evidence needed.** The first real household data model — issues #28–#31
(household state, topology, garage-door state) — plus the concrete query shapes
the first list endpoints require.

**Interim posture.** No schema, migration, or repository code until this is
decided. The boundary in ADR-0012 §13 holds regardless of the outcome.

**Owner:** requires an ADR.
