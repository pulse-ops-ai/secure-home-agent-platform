# knowledge/

**Portable knowledge bundles** — slow-moving, human-authored, reviewable context
that agents read to *understand* the house.

> **Status: specification only, and empty on purpose.** No bundle exists. No
> schema is asserted. The format is **experimental** — see
> [ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md).
> The validator must exist **before** the first real bundle is authored.
>
> **`knowledge/` is not runtime-authoritative**
> — the ADR-0010 toolchain does not exist. The FORMAT is decided
> ([ADR-0015](../docs/decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md),
> which resolved [U7](../docs/architecture/unresolved-decisions.md#u7)); the
> toolchain is not built, which is what `blockedByToolchain` records.

## Start here

| Document | What it is |
|---|---|
| [`INDEX.md`](INDEX.md) | the **registry** — every knowledge module and set, and their status |
| [`catalog.json`](catalog.json) | the machine-readable source the registry is a view of |
| [`../docs/architecture/knowledge-selection-model.md`](../docs/architecture/knowledge-selection-model.md) | how a profile **selects** knowledge and what a run records about it |

## Module, set, bundle

Three concepts, kept distinct:

```text
knowledge module   one independently versioned body of portable knowledge
knowledge set      a named, profile-oriented composition of allowed modules
packaged bundle    the immutable, digest-addressed artifact delivered to a run
```

A profile selects a **set** by name and version. It never references a repository
file path. No packaged bundle exists.

## What knowledge is

Facts that are not in any database and do not change minute to minute: which
HVAC zone serves which rooms, what the equipment is and what its limits are,
what a tariff structure means, which runbook applies when the heat pump locks
out, who owns a decision, and how stale a fact is.

## Permitted content

| Group | Contains |
|---|---|
| [`platform/`](platform/) | platform self-description: how it works, how it is governed, how it degrades |
| [`household/`](household/) | what the house *is* and what its signals *mean* |
| [`runbooks/`](runbooks/) | ordered procedures — validation, triage, escalation |

Individual modules are listed in [`INDEX.md`](INDEX.md). A module-shaped
directory that is not registered there is a **validation failure**: a module no
profile can select is invisible, and invisible things do not get reviewed.

Plus, in any bundle: device **semantics** (what a device *is* and is for),
policies as documentation, runbooks, known limitations, ownership, and
freshness metadata.

## Prohibited content — never, in any bundle

- **secrets**, tokens, keys, or credentials
- **live device state** or any current reading
- **current presence** or occupancy
- **authorization tuples**, grants, or anything the decision point owns
- **mutable automation state**
- **camera media** or any recording
- **raw personal telemetry**

This list is **machine-checked**. A bundle that violates it is not published —
it is not a warning
([ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)).

### The boundary that is easy to get wrong

| Knowledge | Not knowledge |
|---|---|
| "The upstairs zone is served by a 3-ton heat pump rated to 15 °F" | "The upstairs is currently 71 °F" |
| "The front door has a smart lock" | "The front door is currently unlocked" |
| "Peak pricing runs 16:00–21:00 on weekdays" | "The current rate is $0.34/kWh" |
| "Alice is a household administrator" — **no** | authorization is owned by the decision point, not by knowledge |

**Semantics, not state. Meaning, not readings.**

## Knowledge is never an authority

An agent reads knowledge to **understand**. It may not use it to authorize, to
evaluate safety, or to substitute for reading live state.

**If knowledge and live state disagree, live state wins** and the discrepancy is
reported.

## Required metadata

Every bundle declares **owner**, **as-of date**, and **stated limitations**. A
fact with no owner and no date is not knowledge; it is a rumour with formatting.

## Access is through an interface, never a file read

Four future interfaces isolate the format so it can be replaced:

| Interface | Responsibility |
|---|---|
| **compile** | source knowledge → internal representation |
| **validate** | schema conformance **and** the prohibited-content rules |
| **package** | a versioned, addressable, integrity-checkable bundle |
| **query** | the only way an agent or service reads knowledge |

**No agent, service, or profile reads a bundle file directly.** Direct reads
would make an unvalidated format load-bearing.

## What does not belong here

- Anything on the prohibited list.
- **Code** — the toolchain will live in a package or service, not here.
- **Schemas** — [`../schemas/`](../schemas/).
- **Architecture documentation** — [`../docs/`](../docs/). Knowledge is context
  *for agents*; docs are context *for humans and coding agents*.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`AGENTS.md`](AGENTS.md) ·
[ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Validation

**Today** — [`scripts/check-knowledge.mjs`](../scripts/check-knowledge.mjs)
validates the *specification*: that every registered module exists and carries
its metadata, that every module directory is registered, that sets reference only
registered modules and never file paths, that no status claims a published
artifact, that each README agrees with the catalog, and that no specification
directory contains authored content.

```sh
node scripts/check-knowledge.mjs
```

**This is not the ADR-0010 validator.** It checks that the registry is coherent.
It does not machine-check prohibited content, because there is no content — and
it enforces that there is none.

**Future** — `validate` runs in CI and fails on any prohibited content, missing
metadata, or schema violation. Also a repository check that nothing imports a
bundle file directly.
