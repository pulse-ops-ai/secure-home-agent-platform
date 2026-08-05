# deploy/tailscale/

Tailnet connectivity and ACL documentation.

> **Status: no configuration exists.** The Pi's tailnet membership is not managed
> from this repository yet.

## The rule that governs this entire directory

> **Tailscale is private connectivity. It is never identity and never
> authorization.**

Inherited verbatim from the upstream hybrid profile
([ADR-0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md)).
Tailnet membership authenticates a **device**. It says nothing about which
household member or which agent is making a request, and nothing about whether
that request is permitted.

Anything in this repository that reads "it came over the tailnet, so it is
trusted" is a defect.

## What will belong here

- Documentation of the tailnet topology: Pi, VPS, Exxact workstation, operator
  devices.
- ACL documentation — which node may reach which, and why.
- Subnet-router and tag conventions.
- Failure-mode documentation for a coordination-plane outage.

## What does not belong here

- **Auth keys, tokens, or node keys.** Ever.
- **Real tailnet addresses, hostnames, or device identifiers.**
- **Authorization logic.** ACLs constrain reachability. Permission is decided at
  L4.
- **Anything suggesting the tailnet is a trust boundary that conveys identity.**

## Boundary rules

1. **Reachability only.** An ACL narrows the network surface; it never grants a
   permission.
2. **Operator and workload nodes are separated.** Workload-to-workload tailnet
   paths are kept minimal.
3. **A coordination-plane outage must not break household operation.** Existing
   connections persist; new joins fail. Local household operation does not depend
   on the tailnet at all — the LAN path must work.
4. **The tailnet is not the household path's requirement.** In-home clients and
   Home Assistant Voice reach the Pi locally.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
[ADR-0002](../../docs/decisions/ADR-0002-adopt-hybrid-home-deployment-profile.md)

## Validation

Future: an ACL review procedure, plus a check that no code path treats tailnet
membership as an authorization signal.
