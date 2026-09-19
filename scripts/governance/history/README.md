# `scripts/governance/history/`

Revision observations for the two-revision governance checker, carrying no
rules.

This adapter answers three questions: does a name resolve to a commit, what
bytes does a path hold at a commit, and has a path ever existed anywhere in a
commit's ancestry. It decides nothing — not which base a comparison may use, not
whether a missing registry is a genesis or a deletion, not whether a lifecycle
moved backwards. Those are governance semantics and live in `../model/history.mjs`,
so a reader asking "why was this refused" has exactly one place to look.

The sibling `../git-tree/` adapter already owns tree and path observations, and
this module uses it rather than growing a second answer to the same question. It
shares that adapter's vocabulary for which Git failures are answers, and exports
the pattern so a conformance test can prove the two never drift apart: two
adapters that classified the same stderr differently would disagree about
whether a required absence was observed or merely not looked for.

Absence and failure stay distinct here for the same reason they do next door.
Several history rules turn on a required absence — the one genesis base carries
no registry — and a checker that satisfies a required absence by failing to look
is worse than one that crashes.
