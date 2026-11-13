# Governance state

Generated from `governance/state.json`. Do not edit by hand.

## Decisions

| Decision | Lifecycle | Decision date | Resolves |
| --- | --- | --- | --- |
| ADR-0001 | Accepted | 2026-08-05 | — |
| ADR-0002 | Accepted | 2026-08-05 | — |
| ADR-0003 | Accepted | 2026-08-05 | — |
| ADR-0004 | Accepted | 2026-08-05 | — |
| ADR-0005 | Accepted | 2026-08-05 | — |
| ADR-0006 | Accepted | 2026-08-05 | — |
| ADR-0007 | Accepted | 2026-08-05 | — |
| ADR-0008 | Accepted | 2026-08-05 | — |
| ADR-0009 | Accepted | 2026-08-05 | — |
| ADR-0010 | Accepted | 2026-08-05 | — |
| ADR-0011 | Accepted | 2026-08-05 | — |
| ADR-0012 | Accepted | 2026-08-06 | — |
| ADR-0013 | Accepted | 2026-08-12 | U6 |
| ADR-0014 | Accepted | 2026-08-15 | — |
| ADR-0015 | Accepted | 2026-08-15 | U7 |
| ADR-0016 | Accepted | 2026-08-16 | — |
| ADR-0017 | Accepted | 2026-08-17 | — |
| ADR-0018 | Accepted | 2026-08-17 | — |
| ADR-0019 | Accepted | 2026-08-21 | — |
| ADR-0020 | Proposed | — | U4 |
| ADR-0021 | Accepted | 2026-08-28 | — |
| ADR-0022 | Accepted | 2026-09-01 | — |
| ADR-0023 | Accepted | 2026-09-19 | — |
| ADR-0024 | Accepted | 2026-09-19 | — |

## Questions

| Question | Title | Severity | State | Resolved by |
| --- | --- | --- | --- | --- |
| U1 | Local OpenFGA replica vs. signed grants vs. bounded cache | critical | Open | — |
| U10 | Home Assistant credential strategy | high | Open | — |
| U11 | Persistence toolkit selection | high | Open | — |
| U2 | Workload-identity mechanism for runner credentials | high | Open | — |
| U3 | Which service issues the L6 internal identity envelope | high | Open | — |
| U4 | `runner-control` placement — Pi vs. VPS | medium | Open | — |
| U5 | Automation persistence and scheduler | medium | Open | — |
| U6 | The framework-adapter SPI | medium | Resolved | ADR-0013 |
| U7 | OKF validator and toolchain | medium | Resolved | ADR-0015 |
| U8 | Whether shared and household OpenFGA share a runtime | medium | Open | — |
| U9 | Policy-decision caching semantics | high | Open | — |

## Program

| Node | Kind | Delivery | Readiness | Unsatisfied |
| --- | --- | --- | --- | --- |
| runner/GATE-U4 | gate | — | Unsatisfied | — |
| runner/GATE-U6 | gate | — | Satisfied | — |
| runner/L10 | implementation-landing | Planned | NotReady | runner/L8, runner/L9 |
| runner/L2 | implementation-landing | Complete | Ready | — |
| runner/L3 | implementation-landing | Complete | Ready | — |
| runner/L4 | implementation-landing | Complete | Ready | — |
| runner/L5 | implementation-landing | Complete | Ready | — |
| runner/L6 | spike-landing | Complete | Ready | — |
| runner/L7 | implementation-landing | Complete | Ready | — |
| runner/L8 | implementation-landing | Planned | Ready | — |
| runner/L9 | implementation-landing | Planned | NotReady | runner/GATE-U4, runner/L8 |

## Historical program context

L1 is the post-ratification human program-materialization event (issues #19, #27 and #51–#58), not a lifecycle-less active node. L2 and L6 are roots under D6.3a.

L2←L1 · L3←L2 · L4←L3 · L5←L4 · L6←L1 · L7←L5+GATE-U6(+L6) · L8←L7 · L9←L8+GATE-U4 · L10←L8+L9

D6.4 records issue #19 saying L5 is next and L7 waits on L5, with #53/#55 open, while repository delivery is complete. Seed delivery from the bound repository evidence; issue status is neither delivery proof nor authorization. Historical interpretation and MAN-G03 association await the real PR-3 owner ceremony. Decision dates and actors come from governed structural records; encoded Git timestamps are supporting metadata, not human acts or actual recording-time evidence. ADR-0022 post-ADR-0021 manual acceptance is immutable historical-process inconsistency evidence, neither precedent nor retroactive authorization. ADR-0023/ADR-0024 retain their original pre-transition RFC3339 bridge envelopes and source in the immutable historical receipt; the one-shot bridge is consumed and expired, not a runtime authorization primitive.

## Frozen migration inventory

| Disposition | Count |
| --- | --- |
| generated-region | 2 |
| stable-pointer | 72 |
| historical-record | 66 |
| retained-semantic-prose | 10 |
| not-a-governance-consumer | 32 |
