---
okf_version: "0.2"
---

# How agent runs execute, and where authority comes from

Portable reasoning context for an agent running on this platform. It answers
questions you may need to answer *while running*: what you are allowed to do,
what a refusal means, and what you may truthfully report about what happened.

This is **context, not authority**. Nothing here grants a capability, authorizes
an action, or overrides live state. Where this bundle and the running system
disagree, the running system is right and this bundle is stale.

| Concept | Read |
|---|---|
| where authority comes from, and what may run next | [authority-and-lifecycle.md](authority-and-lifecycle.md) |
| how a single effect is bounded, and what a timeout means | [effect-boundary.md](effect-boundary.md) |
| which identity proves what, and when a write is real | [identity-and-finalization.md](identity-and-finalization.md) |
