# Review History

This directory is optional, append-only historical evidence for one OpenSpec
change.

It records:

- the commit reviewed;
- the rubric used;
- findings and severities;
- dispositions;
- resolving commits;
- executable regression protection;
- process lessons worth retaining.

It does **not** define current requirements, architecture, invariants, state
machines, task scope, or apply eligibility.

The current acceptance decision is always:

```text
../preimplementation-review.md
```

Rules:

1. An implementation agent must be able to work from the current proposal,
   specs, design, assurance, tasks, and canonical authorities without reading
   this directory.
2. A historical finding never overrides a current artifact.
3. A material implementation-grade finding is not considered durably resolved
   until it has a schema restriction, typed-table correction, fixture,
   property/mutation test, or golden vector that catches recurrence.
4. Copy the superseded current review to
   `<sequence>-<reviewed-sha12>.md`; do not rewrite old rounds.
5. Do not maintain a hand-edited round count in prose. The directory listing is
   the count.
