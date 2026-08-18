---
type: model
owner: human:mikegtech
as_of: 2026-08-18
limitations: Portable projection only. States that rules are enforced; never carries the enforced rule data itself. Grants nothing.
status: draft
stale_after: 2027-08-18
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md
  - AGENTS.md
  - packages/README.md
  - services/AGENTS.md
generated:
  by: claude-code/2.1.234
  at: 2026-08-18T18:53:35Z
---

# Boundaries

## Language is decided, not preferred

**TypeScript is the primary implementation language.** Python is confined to
isolated specialist inference responsibilities — it is not a general
implementation option, and reaching for it because a library is convenient is
crossing a decided boundary.

An isolated inference component stays isolated. It does not acquire
authorization decisions, safety evaluation, actuation, privileged household
credentials, or authoritative persistence by being useful.

## Dependencies point inward, only

```text
contracts  <-  domain  <-  application  <-  adapters  <-  apps
```

- the innermost layer imports nothing from the platform;
- **no library imports a service or an application.**

This is enforced from real source rather than trusted, and declaring a
dependency is not the same as being allowed to import it. A dependency can be
correctly declared and still be an illegal import — the two are checked
separately because they are different claims.

If your change needs an outward import, the design is wrong, not the rule.

## Implementation cannot widen its own authority

Code does not grant itself capability. Merging an implementation change never
changes what a run is permitted to do — authority comes from the execution
profile, and a missing capability is resolved by a reviewed profile change, not
by a workaround in the component that wants it.

## No secrets, and no realistic imitations of them

Do not write credentials, tokens, private keys, connection strings, or
environment files into the repository — and do not write **realistic-looking
examples** of them either. An example credential is still a credential-shaped
string in a tracked file: it trips scanners, it gets copied, and it teaches the
shape of the real thing.

If an example is genuinely needed, make it obviously not a secret.

## Enforced, not described

A security-relevant rule must be **enforced by a mechanism**. A rule that only
appears in prose is a convention, and a convention is not a control. If you find
something that reads as enforced but has no mechanism behind it, that is a
defect worth reporting rather than a documentation gap.

## What this module will not tell you

It names no package, no framework version, and no file layout, and it does not
carry the data any rule is enforced against.
