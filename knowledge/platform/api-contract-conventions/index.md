---
okf_version: "0.2"
---

# How API surface is authored

Portable reasoning context for adding or changing API surface on a platform where
one definition is expected to produce every downstream artifact. It answers
*where do I author this shape?*, *may I hand-write this type?*, and *what makes an
operation callable from outside?*

This is **context, not authority**. It grants nothing, names no route, and
reproduces no generated document.

| Concept | Read |
|---|---|
| where a contract is authored, and what may not restate it | [authoring.md](authoring.md) |
| how the published document is produced, and why it is a gate | [generation.md](generation.md) |
| the four response shapes, and what a list answer must admit | [envelopes.md](envelopes.md) |
| how an operation becomes callable, and what describing it does not confer | [exposure.md](exposure.md) |
