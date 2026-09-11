# Frozen audit evidence

Deterministic records of probes that cannot be re-executed by ordinary CI,
because re-executing them would require changing the repository in ways the
current task is not authorized to make.

`ts7-compatibility-audit.json` is task 3.1's TypeScript 7.0.2 compatibility
probe. TypeScript 7 is deliberately **not** in the repository dependency graph
yet — task 3.2 installs it through the normal path and re-proves these results.
Until then this file records exactly which files the successful probe covered.

That precision is the point. A probe result that says "everything passed" ages
into a claim about whatever files happen to exist later. The tests beside these
records bind the frozen identities to the current repository surface and to the
fixture bytes, so a file that is added, renamed, substituted or edited makes the
evidence visibly stale instead of silently inherited.
