# Review Round <N> — <short purpose>

## Review Pin

| Field | Value |
|---|---|
| Reviewed commit | `<full SHA>` |
| Reviewer | `<reviewer>` |
| Rubric | `<rubric id/version>` |
| Verdict | `accepted | changes_requested | rejected` |
| Current review superseded by | `<commit/report or not applicable>` |

## Findings

### <FINDING-ID> — <title>

- **Original severity:** `P1 | P2 | P3`
- **Invariant / decision:** `<INV/D ID or none>`
- **Evidence:** `<path:line, symbol, schema, test, or command>`
- **Failure trace:** `<concrete steps, or not applicable>`
- **Impact:** `<trust/correctness/operability impact>`
- **Disposition:** `fixed | rejected | deferred`
- **Disposition rationale:** `<why>`
- **Resolving commit:** `<SHA or not applicable>`
- **Canonical authority changed:** `<AUTH-ID or none>`
- **Regression authority:** `<test, fixture, schema guard, mutation target,
  golden vector, or reason automation is impossible>`

## Process Lesson

Record only a durable practice change. Do not turn a one-off correction into a
new competing source of truth.

## Non-Authority Notice

This historical report explains why current contracts look the way they do. It
does not define those contracts.
