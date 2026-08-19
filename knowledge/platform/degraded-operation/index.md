---
okf_version: "0.2"
---

# When parts of the platform are unreachable

Portable reasoning context for a run that meets an outage. It answers *how is
degraded behaviour decided?*, *is a bounded classification permission?*, and
*what is the correct thing to do when the answer is no?*

This is **context, not authority**. It carries no policy table, no current
service health, and nothing that would let a run act during an outage.

| Concept | Read |
|---|---|
| how degraded behaviour is classified, and the four outcomes | [classification.md](classification.md) |
| why a bounded classification is not a yes today | [bounded.md](bounded.md) |
| what a refusal during an outage means, and what it does not | [refusal.md](refusal.md) |
