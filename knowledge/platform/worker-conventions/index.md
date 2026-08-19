---
okf_version: "0.2"
---

# What a background worker owes the platform

Portable reasoning context for implementing or changing a worker on a platform
where the household control path shares a small machine with everything else. It
answers *what must my worker implement before it is complete?*, *where does it
live?*, and *what may it never own?*

This is **context, not authority**. It grants nothing, names no broker, and
carries no live worker state.

| Concept | Read |
|---|---|
| the standard runtime contract, and why it is composed rather than inherited | [contract.md](contract.md) |
| where a worker lives, and what makes it a service rather than a library | [placement.md](placement.md) |
| what a worker may never own, and why the limit is not negotiable | [boundary.md](boundary.md) |
