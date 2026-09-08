"""EX-TS-002: the TypeScript 6 emitted-output baseline, and what binds it.

A compiler cutover that builds cleanly can still change what it EMITS. `tsc`
exiting 0 says the program typechecked, not that the shipped declarations, the
maps consumers debug through, or the schemas other tools read came out the same.

The baseline is only worth anything if three things hold: it was captured while
the old compiler was still authoritative, it has not been edited since, and it
claims only surfaces that are really emitted. Each is checked here rather than
assumed, because each is exactly what someone would adjust to make a failing
differential pass.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
BASELINE_PATH = REPO / "tests" / "evidence" / "ts6-emit-baseline.json"
TOOL = REPO / "scripts" / "emit-baseline.mjs"

BASELINE_COMPILER = "6.0.3"
PRE_CUTOVER_HEAD = "362c349e18cfb3c63c52fc29a5c70a947a1107f2"

#: The frozen evidence, as an object id. `MUT-TS-EMIT-004` makes recapturing or
#: rewriting it a named hostile case; this is the identity that names it.
BASELINE_BLOB = "e97f80f94b37030f7058f831ba9eb15a89806868"
BASELINE_REL = "tests/evidence/ts6-emit-baseline.json"


@pytest.fixture(scope="module")
def baseline() -> dict[str, Any]:
    parsed: dict[str, Any] = json.loads(BASELINE_PATH.read_text())
    return parsed


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, cwd=REPO, check=True
    ).stdout.strip()


# --- the baseline records the OLD compiler ----------------------------------


def test_the_baseline_was_captured_under_typescript_6(baseline: dict[str, Any]) -> None:
    """The whole point. A baseline captured under the new compiler would agree
    with the new compiler and prove nothing at all."""
    assert baseline["compiler"] == {
        "package": "typescript",
        "version": BASELINE_COMPILER,
        "tscReported": f"Version {BASELINE_COMPILER}",
    }
    assert baseline["proof"] == "EX-TS-002"


def test_the_baseline_is_bound_to_the_pre_cutover_head(baseline: dict[str, Any]) -> None:
    """Bound to a commit, not to a date or a claim.

    That commit is the accepted task-3.4 head: the last tree in which
    TypeScript 6.0.3 was the authoritative compiler.
    """
    assert baseline["capturedAtHead"] == PRE_CUTOVER_HEAD
    assert _git("cat-file", "-t", PRE_CUTOVER_HEAD) == "commit"
    assert _git("merge-base", "--is-ancestor", PRE_CUTOVER_HEAD, "HEAD") == ""


def test_that_head_really_still_pinned_typescript_6(baseline: dict[str, Any]) -> None:
    """Read out of the commit's own tree, not out of the baseline's claim.

    The baseline says which compiler produced it; this proves the repository
    agreed at that commit. A baseline that named 6.0.3 while the tree had
    already moved would be a golden captured under the compiler it is supposed
    to be testing.
    """
    catalog = _git("show", f"{baseline['capturedAtHead']}:pnpm-workspace.yaml")
    assert f"\n  typescript: {BASELINE_COMPILER}\n" in catalog


def test_the_committed_baseline_is_the_frozen_blob(baseline: dict[str, Any]) -> None:
    """Identity of the evidence itself, independent of any history claim.

    Every provenance argument below is about THIS object. Without pinning it,
    a recaptured baseline could inherit the provenance of the one it replaced.
    """
    assert _git("rev-parse", f"HEAD:{BASELINE_REL}") == BASELINE_BLOB


def _rev_list(*args: str) -> list[str]:
    out = _git("rev-list", *args)
    return out.split() if out else []


def _blob_at_each(revs: list[str], rel: str) -> dict[str, str]:
    """The object id of one path at many revisions, in one git call.

    `git log -1 -- <path>` cannot answer this. It walks SIMPLIFIED history and
    reports where the path last changed along one line of it, so a squash
    commit -- which reintroduces every path relative to its single parent --
    is reported as the place these bytes were written. The DAG still holds the
    real answer; it has to be asked directly rather than through simplification.
    """
    if not revs:
        return {}
    query = "".join(f"{rev}:{rel}\n" for rev in revs)
    result = subprocess.run(
        ["git", "cat-file", "--batch-check"],
        input=query,
        capture_output=True,
        text=True,
        cwd=REPO,
        check=True,
    )
    lines = result.stdout.splitlines()
    found: dict[str, str] = {}
    # One output line per input line, in order -- a revision that does not carry
    # the path answers "missing", which is an answer, not an error.
    for rev, line in zip(revs, lines, strict=True):
        parts = line.split()
        if len(parts) == 3 and parts[1] == "blob":
            found[rev] = parts[0]
    return found


def test_the_baseline_existed_in_a_typescript_6_authoritative_ancestor() -> None:
    """Git history is the part nobody can restage — asked of the DAG.

    The invariant is not "the last commit to touch this path pinned 6.0.3". It
    is that these exact bytes existed in a repository state that was still
    TypeScript 6 authoritative and already descended from the captured head.
    A baseline captured after the cutover, or recaptured later to make a
    differential pass, has no such ancestor.

        capturedAtHead 362c349e
              ↓
        an ancestor carrying blob e97f80f9 with `typescript: 6.0.3`
              ↓
        HEAD

    The old formulation read that off `git log -1 -- <path>`, which is
    simplified history. PR #120 was squash-merged, so the squash commit
    introduces this path relative to its only parent and simplification names
    it — while pinning 7.0.2, because by then the cutover had landed. The
    ancestry is intact; only the question was wrong.
    """
    candidates = _rev_list(f"{PRE_CUTOVER_HEAD}..HEAD")
    assert candidates, "no revision descends from the captured head"

    carrying = sorted(
        rev
        for rev, blob in _blob_at_each(candidates, BASELINE_REL).items()
        if blob == BASELINE_BLOB
    )
    assert carrying, (
        f"no ancestor of HEAD descended from {PRE_CUTOVER_HEAD[:12]} carries the frozen "
        f"baseline blob {BASELINE_BLOB[:12]}"
    )

    witnesses = [
        rev
        for rev in carrying
        if f"\n  typescript: {BASELINE_COMPILER}\n" in _git("show", f"{rev}:pnpm-workspace.yaml")
    ]
    assert witnesses, (
        f"the frozen baseline exists in {len(carrying)} ancestor(s), but none of them still "
        f"pinned TypeScript {BASELINE_COMPILER} — so these bytes were written after the "
        "compiler moved"
    )


def test_that_ancestor_search_cannot_find_evidence_that_was_never_there() -> None:
    """The control.

    A baseline recaptured under TypeScript 7 is a DIFFERENT object, so the
    search above must return nothing for a blob no ancestor holds rather than
    falling back to something weaker. Without this, a search that matched
    anything would look like a passing provenance proof.
    """
    candidates = _rev_list(f"{PRE_CUTOVER_HEAD}..HEAD")
    assert candidates, "no revision descends from the captured head"
    never_committed = "0" * 40
    assert [
        rev
        for rev, blob in _blob_at_each(candidates, BASELINE_REL).items()
        if blob == never_committed
    ] == []


# --- the baseline has not been edited ---------------------------------------


def test_the_baseline_matches_its_own_seal(baseline: dict[str, Any]) -> None:
    """MUT-TS-EMIT-001, the tamper half.

    Every digest in the file is covered by one seal over the rest of the file,
    so a single edited byte -- one output digest quietly updated to match a
    drifted TypeScript 7 build -- is detectable without knowing which one moved.
    """
    body = {k: v for k, v in baseline.items() if k != "manifestSha256"}
    recomputed = hashlib.sha256((json.dumps(body, indent=2) + "\n").encode("utf-8")).hexdigest()
    assert recomputed == baseline["manifestSha256"]


def test_an_edited_baseline_is_detected(tmp_path: Path, baseline: dict[str, Any]) -> None:
    """Driven, not asserted. A seal nothing tests is a checksum nobody checks."""
    tampered = json.loads(BASELINE_PATH.read_text())
    member = tampered["members"]["packages/contracts"]
    victim = next(f for f, o in member["outputs"].items() if o["claimed"])
    before = member["outputs"][victim]["sha256"]
    member["outputs"][victim]["sha256"] = "0" * 64
    assert member["outputs"][victim]["sha256"] != before, "the mutation changed nothing"

    target = tmp_path / "tampered.json"
    target.write_text(json.dumps(tampered, indent=2) + "\n")
    result = subprocess.run(
        ["node", str(TOOL), "--verify", str(target)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode != 0
    assert "edited after capture" in result.stdout + result.stderr


# --- the baseline claims only what is really emitted ------------------------


def test_every_claimed_surface_was_actually_emitted(baseline: dict[str, Any]) -> None:
    """No fabricated golden claims.

    An empty claim looks like coverage and proves nothing, so a claimed surface
    must have files behind it and an unclaimed one must say why it is absent.
    """
    for member, record in baseline["members"].items():
        for kind, surface in record["surfaces"].items():
            if surface["claimed"]:
                assert surface["disposition"] == "EMITTED", f"{member}.{kind}"
                assert surface["count"] > 0, f"{member}.{kind} claims nothing"
            else:
                assert surface["disposition"] in {
                    "EMITTED",
                    "NOT_EMITTED_BY_CONFIG",
                }, f"{member}.{kind} is absent for an unexplained reason"


def test_a_member_that_emits_no_declarations_carries_no_declaration_claim(
    baseline: dict[str, Any],
) -> None:
    """The concrete case, named. `apps/web` compiles with `declaration: false`,
    so it has no declarations to be identical to."""
    web = baseline["members"]["apps/web"]
    for kind in ("declaration", "declarationMap"):
        assert web["surfaces"][kind]["disposition"] == "NOT_EMITTED_BY_CONFIG"
        assert web["surfaces"][kind]["optionValue"] is False
    # ...and it does still emit a source map, so it is not silently exempt.
    assert web["surfaces"]["sourceMap"]["disposition"] == "EMITTED"


def test_the_claimed_surfaces_are_the_ones_ex_ts_002_names(baseline: dict[str, Any]) -> None:
    """The BASELINE's own claim flags, which are immutable evidence.

    They record what task 3.1 claimed when the baseline was frozen: `.d.ts`,
    `.d.ts.map`, `.js.map` and generator output, with compiled `.js` recorded as
    observation rather than claimed, because widening a proof obligation was not
    that task's to do.

    They are not the current obligation. D18 re-stated `REQ-TC-002` per emitted
    surface, and `emit-conformance.mjs` now compares that recorded runtime JS
    surface by exact bytes — a stronger requirement than the flag frozen here.
    The flags stay as captured; recapturing them under the new compiler is
    `MUT-TS-EMIT-004`.
    """
    claimed_kinds = {
        kind
        for record in baseline["members"].values()
        for kind, surface in record["surfaces"].items()
        if surface["claimed"]
    }
    assert claimed_kinds == {"declaration", "declarationMap", "sourceMap"}
    assert any(
        not o["claimed"] and o["kind"] == "javascript"
        for record in baseline["members"].values()
        for o in record["outputs"].values()
    ), "compiled JavaScript must still be RECORDED, which is what makes the exact-byte "
    "comparison in emit-conformance.mjs possible at all"


def test_both_real_generators_are_captured(baseline: dict[str, Any]) -> None:
    """Two members really generate; both must carry artifact digests."""
    assert set(baseline["generators"]) == {"packages/contracts", "packages/events"}
    for member, record in baseline["generators"].items():
        assert record["artifacts"], f"{member} generated nothing"
        for artifact in record["artifacts"]:
            assert artifact.startswith("schemas/"), artifact


def test_normalization_neutralized_nothing_under_typescript_6(baseline: dict[str, Any]) -> None:
    """The differential compares raw emitted bytes.

    Both authorized rules exist, and under TypeScript 6 neither fires: this
    repository emits no compiler banner and no absolute path. Recording that
    matters -- if a rule starts firing after the cutover, the difference it
    hides becomes visible as a count rather than as silence.

    The first version of the path rule DID fire, on `/home/runner` inside an
    adapter test. That is a string the author wrote and the compiler copied
    through, not a path the compiler embedded, and normalizing it would have
    been normalizing semantics. The count is what surfaced it.
    """
    normalized = [
        (member, path)
        for member, record in baseline["members"].items()
        for path, output in record["outputs"].items()
        if "normalized" in output
    ] + [
        (member, path)
        for member, record in baseline["generators"].items()
        for path, output in record["artifacts"].items()
        if "normalized" in output
    ]
    assert normalized == [], normalized
