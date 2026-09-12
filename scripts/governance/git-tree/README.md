# `scripts/governance/git-tree/`

Repository observations for the governance-state model, carrying no rules.

This adapter answers what the repository contains — root presence and absence,
scoped tree contents, blob identity, Git modes, and whether a commit is
reachable from the current history. It decides nothing: not which identity class
an evidence record must use, not whether an unreachable object is fatal, not
whether a stage rule applies to a given reviewed-identity form. Those are
governance semantics and live in `../model/`, so that a reader asking "why was
this refused" has exactly one place to look.

Reachability is reported as an observation, never as a judgement, and no branch
name takes part in it.
