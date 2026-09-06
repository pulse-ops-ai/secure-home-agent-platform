"""Scope-2 task sequencing cannot admit a state the repository refuses.

THE DEFECT THIS COVERS. The accepted Scope-2 graph ordered the compiler cutover
(3.2) before replacement-only lint (3.3) and ESLint retirement (3.4). That does
not compose with the Scope-1 implementation that actually merged:

    pnpm lint
      ├── legacy ESLint            BLOCKING
      └── Oxlint + typed backend   BLOCKING
    ok = legacy.ok && replacement.ok

and the planning package itself records that ``typescript-eslint`` 8.66.0
refuses TypeScript 7. So moving the compiler first breaks the legacy engine
while it is still a required blocking path, and the repository cannot be green
in that state. The task graph was instructing an implementer into a state the
accepted Scope-1 gate refuses.

Prose cannot hold this. The edge is one token in an HTML comment, and restoring
``3.3 prerequisites=3.2`` would silently reinstate the defect. This asserts the
ORDER as a property of the graph, so any edit that lets TypeScript 7 precede
ESLint retirement fails here rather than in a red implementation branch.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
TASKS = REPO / "openspec" / "changes" / "typescript-7-lint-engine-resilience" / "tasks.md"

# The compiler cutover, replacement-only lint, and ESLint retirement.
AUDIT = "3.1"
COMPILER_CUTOVER = "3.2"
REPLACEMENT_ONLY_LINT = "3.3"
ESLINT_RETIREMENT = "3.4"

# The accepted Scope-2 node set: 3.x implementation and 4.x verification.
# Written out so a task that disappears from `tasks.md` fails here rather than
# reducing what every other assertion covers.
EXPECTED_SCOPE_2_TASKS = {
    "3.1",
    "3.2",
    "3.3",
    "3.4",
    "3.5",
    "3.6",
    "3.7",
    "4.1",
    "4.2",
    "4.3",
    "4.4",
    "4.5",
}

TASK_BLOCK = re.compile(
    r"<!--\s*agent-task:\s*(?P<id>[0-9]+\.[0-9]+)\s.*?prerequisites=(?P<prereqs>[^\s]+)\s*-->",
    re.S,
)


def _graph() -> dict[str, set[str]]:
    """Task id -> its declared task prerequisites.

    Non-task prerequisites (``PR-B-merged``, ``scope2-review-epoch``) are
    external gates, not nodes, so they are not edges in this graph.
    """
    graph: dict[str, set[str]] = {}
    for match in TASK_BLOCK.finditer(TASKS.read_text()):
        task = match.group("id")
        # Scope 2 only: 3.x implementation and 4.x verification. Scope 1's
        # tasks are a separate, already-released graph and share no edges.
        if not task.startswith(("3.", "4.")):
            continue
        prereqs = {
            p for p in match.group("prereqs").split(",") if re.fullmatch(r"[0-9]+\.[0-9]+", p)
        }
        graph[task] = prereqs
    return graph


def _ancestors(graph: dict[str, set[str]], task: str) -> set[str]:
    """Everything that must complete before ``task``, transitively."""
    seen: set[str] = set()
    stack = list(graph.get(task, ()))
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        stack.extend(graph.get(current, ()))
    return seen


@pytest.fixture(scope="module")
def graph() -> dict[str, set[str]]:
    parsed = _graph()
    assert parsed, "no agent-task prerequisite blocks were parsed"
    return parsed


def test_the_scope_2_graph_is_acyclic(graph: dict[str, set[str]]) -> None:
    """A cycle would make the order unsatisfiable rather than merely wrong."""
    for task in graph:
        assert task not in _ancestors(graph, task), f"{task} depends on itself"


def test_eslint_retirement_precedes_the_compiler_cutover(
    graph: dict[str, set[str]],
) -> None:
    """THE INVARIANT.

    There must be no admitted state in which TypeScript 7 is the normal
    compiler while legacy ESLint is still a required blocking path. Expressing
    it as reachability makes it true of EVERY valid ordering, not just of the
    one somebody happens to execute.
    """
    before_cutover = _ancestors(graph, COMPILER_CUTOVER)
    assert ESLINT_RETIREMENT in before_cutover, (
        f"{COMPILER_CUTOVER} (TypeScript 7 cutover) does not require "
        f"{ESLINT_RETIREMENT} (ESLint retirement) first, so the graph admits a "
        "state with TypeScript 7.0.2 and typescript-eslint 8.66.0 both in a "
        "blocking lint path"
    )
    assert REPLACEMENT_ONLY_LINT in before_cutover, (
        f"{COMPILER_CUTOVER} does not require {REPLACEMENT_ONLY_LINT} (replacement-only lint) first"
    )


def test_replacement_only_lint_does_not_wait_for_the_compiler(
    graph: dict[str, set[str]],
) -> None:
    """The exact edge that caused the defect.

    ``3.3 prerequisites=3.2`` is what ordered the cutover first. With 3.2 now
    downstream of 3.4, restoring that edge also creates a cycle -- but this
    names the specific regression so the failure says what was reinstated.
    """
    assert COMPILER_CUTOVER not in _ancestors(graph, REPLACEMENT_ONLY_LINT), (
        f"{REPLACEMENT_ONLY_LINT} waits for {COMPILER_CUTOVER}, which reinstates "
        "the compiler-first ordering"
    )
    assert COMPILER_CUTOVER not in _ancestors(graph, ESLINT_RETIREMENT), (
        f"{ESLINT_RETIREMENT} waits for {COMPILER_CUTOVER}"
    )


def test_the_complete_scope_2_node_set_is_parsed(graph: dict[str, set[str]]) -> None:
    """The graph must be the WHOLE scope, not whatever the regex happened to find.

    Every assertion here is about reachability, and reachability over a
    partially-parsed graph is vacuous: a task that silently failed to parse has
    no edges, so nothing about it can fail. Pinning the node set means a
    renamed, deleted, or malformed task block breaks this test instead of
    quietly shrinking what the other tests check.
    """
    assert set(graph) == EXPECTED_SCOPE_2_TASKS, (
        "parsed Scope-2 task set does not match the accepted set; "
        f"missing={sorted(EXPECTED_SCOPE_2_TASKS - set(graph))} "
        f"unexpected={sorted(set(graph) - EXPECTED_SCOPE_2_TASKS)}"
    )


def test_every_scope_2_task_is_reachable_from_the_audit(
    graph: dict[str, set[str]],
) -> None:
    """3.1 freezes the compatibility audit; nothing may precede it.

    No empty-prerequisite escape. The earlier form allowed `not graph[task]`,
    which meant a task that declared no task prerequisites at all satisfied the
    rule -- exactly the shape that would let work start before the audit was
    frozen. 3.1 itself is the only node permitted to have none.
    """
    for task in sorted(graph):
        if task == AUDIT:
            assert not graph[task], (
                f"{AUDIT} must have no task prerequisites; it is the scope entry point"
            )
            continue
        assert AUDIT in _ancestors(graph, task), (
            f"{task} does not transitively depend on the frozen audit {AUDIT}"
        )
