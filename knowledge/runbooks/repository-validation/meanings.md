---
type: procedure
owner: human:mikegtech
as_of: 2026-08-20
limitations: Portable projection only. Quotes no expected check count, no sample output, no credential or environment value, and no current repository or CI state. Grants nothing.
status: draft
stale_after: 2027-08-20
governs:
  - CONTRIBUTING.md
  - scripts/README.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-20T08:08:13Z
---

# What each check establishes

Every check answers one narrow question. The useful skill is knowing which
question, because a green result is only evidence about that one.

| Check | Establishes | Does **not** establish |
|---|---|---|
| structural scaffold validation | the repository's shape: navigation files, index integrity, required READMEs, workspace manifests, absence of tracked secrets and generated directories | that anything compiles, or that any behaviour is correct |
| secret scan | that the scanner found no **unallowlisted** secret-shaped value in tracked text, under the validated allowlist policy | that no real credential exists. Detection is shape-based and has blind spots, and an allowlisted line is a governed exception someone justified — not evidence the scanner never saw that shape |
| manifest conformance | what a manifest may **declare**: taxonomy, naming, script surface, dependency direction | what the source actually imports |
| source-import direction | direction as the source really imports it, parsed from the real import nodes | that the manifests declare it correctly |
| dependency policy | declared versions are consistent and follow the catalog | that the resolved tree is what the lockfile says |
| lint · types | style rules hold, and types check | that the code does the right thing |
| tests | the assertions written actually pass | anything about behaviour nobody asserted |
| build | the thing compiles and emits | that it runs correctly |
| knowledge registry conformance | the specification is coherent: entries, statuses, gates, indexes | whether any authored knowledge byte is admissible |
| knowledge content admission | that real authored bytes pass repository admission, and that the review attestation binds the **exact current source digest** | semantic correctness, fidelity to the governing source, or continuing freshness after that source changes. None of those is what it checks |

## Pairs that look redundant and are not

**Declared direction and imported direction are different checks.** A manifest
cannot prove what a file imports, and an import cannot prove what a manifest
declares. A package can import something it never declared, and declare
something it never imports. Neither check substitutes for the other, and passing
one says nothing about the other.

**Governance checks are not compile or test checks.** Structure, secrets,
taxonomy, and registry conformance can all be green in a repository that does
not build. The reverse holds too. Reporting "validation passed" after running
only one family is the most common way a claim outruns its evidence.

## What a local green run proves

That these checks passed **on this machine, at this moment**.

**Local evidence does not substitute for the merge gate.** The repository
enforces the portable checks itself so that a later change cannot merge without
reproducing them. A green local run is useful context to report; it is not a
guarantee that the gate will agree, and stating it as one claims more than the
mechanism supports.
