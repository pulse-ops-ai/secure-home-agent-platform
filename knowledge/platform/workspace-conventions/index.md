---
okf_version: "0.2"
---

# How the workspace is assembled, and how a change lands

Portable reasoning context for changing a workspace that is governed by
mechanisms rather than by convention. It answers *where does a dependency version
come from?*, *why did CI run that?*, and *what may I not do to the lockfile?*

This is **context, not authority**. It grants nothing and names no version.

| Concept | Read |
|---|---|
| dependency governance, and the jobs it splits between mechanisms | [dependencies.md](dependencies.md) |
| what runs in CI, and why some gates never skip | [gates.md](gates.md) |
