"""D12 temporal audit through the production CLI; fixture authors are not owners."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import UTC
from pathlib import Path
from typing import Any

import pytest

REPOSITORY = Path(__file__).resolve().parents[1]
AUDITOR = REPOSITORY / "scripts/governance/genesis/acceptance.mjs"
ADR = "docs/decisions/ADR-0042-test.md"
INDEX = "docs/decisions/INDEX.md"
DESIGN = "openspec/changes/governance-state-substrate/design.md"
DATE = "2026-08-15"
COMMITTER = "2026-08-15T16:55:25Z"
M = "83e6cd8fa7d2d05ab246a39de039129b4056966d"
S = "c82fda72927464d813ec769aee53f4079ebe3b20"


@pytest.fixture(scope="module", autouse=True)
def historical_objects() -> None:
    subprocess.run(
        [
            "node",
            str(REPOSITORY / "tests/fixtures/governance/genesis/objects.mjs"),
            str(REPOSITORY),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def git(root: Path, *args: str, at: str = COMMITTER) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        env={**os.environ, "GIT_AUTHOR_DATE": "2026-08-15T16:39:37Z", "GIT_COMMITTER_DATE": at},
        text=True,
        capture_output=True,
        check=True,
    ).stdout.strip()


def decision(lifecycle: str, declaration: str = "both") -> str:
    text = "# ADR-0042: Test decision\n\n- **Status:** " + lifecycle
    text += "\n- **Date:** 2026-08-14\n"
    if lifecycle != "Proposed" and declaration != "index":
        text += f"- **{lifecycle}:** {DATE}\n- **Decider:** @fixture-owner\n"
    return text + "\n---\n\n## Decision\n\nInert test bytes only.\n"


def index(lifecycle: str, declaration: str = "both") -> str:
    if lifecycle == "Proposed" or declaration == "header":
        return "# Decisions\n"
    kind = "acceptance" if lifecycle == "Accepted" else "rejection"
    return (
        f"# Decisions\n\n### ADR-0042 {kind} record\n\n| | |\n|---|---|\n"
        f"| **{lifecycle}** | {DATE} |\n"
        f"| **{lifecycle} by** | @fixture-owner (test only) |\n"
    )


def write(root: Path, lifecycle: str, declaration: str = "both") -> None:
    (root / ADR).write_text(decision(lifecycle, declaration), encoding="utf-8")
    (root / INDEX).write_text(index(lifecycle, declaration), encoding="utf-8")


def commit(root: Path, message: str = "TEST source") -> str:
    git(root, "add", ".")
    git(root, "commit", "-qm", message)
    return git(root, "rev-parse", "HEAD")


def selection(root: Path, transition: str, at: str) -> str:
    path = root / DESIGN
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# Isolated TEST reviewed-selection source, not human attestation\n\n"
        "| ADR(s) | decisionDate | Original transition | gitCommitterAt |\n"
        "| --- | --- | --- | --- |\n"
        f"| ADR-0042 | \x60{DATE}\x60 | \x60{transition}\x60 | \x60{at}\x60 |\n",
        encoding="utf-8",
    )
    return commit(root)


def repository(
    root: Path,
    *,
    lifecycle: str = "Accepted",
    declaration: str = "both",
    at: str = COMMITTER,
    message: str = "TEST exact lifecycle transition",
) -> tuple[str, str]:
    (root / "docs/decisions").mkdir(parents=True)
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.name", "Test recorder, not declared owner")
    git(root, "config", "user.email", "fixture@example.invalid")
    git(root, "config", "commit.gpgsign", "false")
    write(root, "Proposed")
    commit(root, "TEST proposed decision")
    git(root, "checkout", "-qb", "review")
    write(root, lifecycle, declaration)
    git(root, "add", ".")
    git(root, "commit", "-qm", message, at=at)
    transition = git(root, "rev-parse", "HEAD")
    utc = git(root, "show", "-s", "--format=%ct", transition)
    # The expected UTC value is observed independently using Python for fixtures.
    from datetime import datetime

    encoded = datetime.fromtimestamp(int(utc), UTC).isoformat().replace("+00:00", "Z")
    git(root, "checkout", "-q", "main")
    git(root, "merge", "--squash", "review")
    git(root, "commit", "-qm", "TEST main delivery", at="2026-08-18T12:00:00Z")
    git(root, "branch", "-D", "review")
    return transition, selection(root, transition, encoded)


def audit(
    root: Path, source: str, *, selection_source: str | None = None, auditor: Path = AUDITOR
) -> dict[str, Any]:
    command = ["node", str(auditor), "--root", str(root), "--source", source]
    if selection_source:
        command += ["--selection-source", selection_source]
    result = subprocess.run(command, cwd=REPOSITORY, text=True, capture_output=True)
    payload: dict[str, Any] = json.loads(result.stdout)
    assert result.returncode == (0 if payload["ok"] else 1), result.stderr
    return payload


@pytest.mark.parametrize("lifecycle", ["Accepted", "Rejected"])
@pytest.mark.parametrize("declaration", ["header", "index", "both"])
@pytest.mark.parametrize("at", [COMMITTER, "2026-08-16T04:55:25Z", "2026-08-14T01:23:45Z"])
def test_ex_g33_g34_g35_generic_date_precision(
    tmp_path: Path,
    lifecycle: str,
    declaration: str,
    at: str,
) -> None:
    transition, source = repository(tmp_path, lifecycle=lifecycle, declaration=declaration, at=at)
    result = audit(tmp_path, source)
    assert result["ok"], result
    row = result["observations"][0]
    assert row["transition"]["identity"]["value"] == transition
    assert row["transition"]["gitCommitterAt"] == at
    assert row["transition"]["gitAuthorAt"] == "2026-08-15T16:39:37Z"
    assert row["decisionDate"] == DATE
    assert row["actor"] == "@fixture-owner"
    assert row["classification"] == "locally-verified"
    assert row["extractionRule"] == "governed-decision-date-transition-v1"
    differs = at[:10] != DATE
    assert row["committerUtcDateDiffers"] is differs
    assert (row["disposition"] is not None) is differs
    assert "human authorship" in result["manualProvenance"]
    assert "recordedAt" not in json.dumps(row)
    assert "recordingDateDiffers" not in json.dumps(row)
    assert "recording-latency" not in json.dumps(row)


def test_ex_g35_real_complete_corpus_and_exact_bridge() -> None:
    old = audit(REPOSITORY, M, selection_source=S)
    current = audit(REPOSITORY, S)
    assert old["ok"] and current["ok"], (old["problems"], current["problems"])
    assert len(old["observations"]) == 21
    assert len(current["observations"]) == 23
    for result in [old, current]:
        assert [r["adrId"] for r in result["observations"] if r["committerUtcDateDiffers"]] == [
            "ADR-0022"
        ]
    rows = {row["adrId"]: row for row in current["observations"]}
    assert set(rows) == {f"ADR-{n:04}" for n in [*range(1, 20), 21, 22, 23, 24]}
    assert rows["ADR-0015"]["decisionDate"] == "2026-08-15"
    assert (
        rows["ADR-0015"]["transition"]["identity"]["value"]
        == "a5cc2a739bd9602e30376400a46ebf7b5bab10f1"
    )
    assert rows["ADR-0015"]["transition"]["gitCommitterAt"] == "2026-08-15T16:55:25Z"
    assert rows["ADR-0022"]["decisionDate"] == "2026-09-01"
    assert (
        rows["ADR-0022"]["transition"]["identity"]["value"]
        == "4334a7b040b14911b7b0894aeb14717b0418ee84"
    )
    assert rows["ADR-0022"]["transition"]["gitCommitterAt"] == "2026-09-02T08:03:21Z"
    for subject in ["ADR-0023", "ADR-0024"]:
        assert (
            rows[subject]["transition"]["identity"]["value"]
            == "fc7d44ff48de015afd14faa7836fe11c58c457aa"
        )
        assert rows[subject]["decisionDate"] == "2026-09-19"


@pytest.mark.parametrize("field", ["date", "actor", "missing", "malformed", "duplicate"])
def test_adv_g103_conflicting_or_missing_declaration(tmp_path: Path, field: str) -> None:
    repository(tmp_path)
    text = index("Accepted")
    if field == "date":
        text = text.replace(DATE, "2026-08-16")
    elif field == "actor":
        text = text.replace("@fixture-owner", "@different-owner")
    elif field == "missing":
        (tmp_path / ADR).write_text(decision("Accepted", "index"), encoding="utf-8")
        text = "# No decision declaration\n"
    elif field == "malformed":
        text = text.replace(DATE, "2026-08-15T00:00:00Z")
    else:
        text += f"| **Accepted** | {DATE} |\n"
    (tmp_path / INDEX).write_text(text, encoding="utf-8")
    result = audit(tmp_path, commit(tmp_path))
    assert not result["ok"]
    assert {p["id"] for p in result["problems"]} == {"ADR-0042"}


@pytest.mark.parametrize(
    "case", ["missing-object", "changed-bytes", "already-decided", "missing-selection"]
)
def test_adv_g101_g104_exact_object_and_selection(tmp_path: Path, case: str) -> None:
    transition, _ = repository(tmp_path)
    if case == "missing-object":
        source = selection(tmp_path, "9" * 40, COMMITTER)
    elif case == "missing-selection":
        (tmp_path / DESIGN).write_text("# No reviewed selection\n", encoding="utf-8")
        source = commit(tmp_path)
    elif case == "changed-bytes":
        with (tmp_path / ADR).open("a", encoding="utf-8") as stream:
            stream.write("\nAltered decided bytes\n")
        source = commit(tmp_path)
    else:
        selected = git(tmp_path, "rev-parse", "HEAD")
        source = selection(tmp_path, selected, COMMITTER)
    result = audit(tmp_path, source)
    assert not result["ok"], (transition, result)


def test_adv_g103_explicit_transition_message_conflict(tmp_path: Path) -> None:
    _, source = repository(tmp_path, message="ADR-0042 accepted 2026-08-16 by fixture")
    assert not audit(tmp_path, source)["ok"]


def test_exact_transition_ignores_local_git_replacement(tmp_path: Path) -> None:
    transition, source = repository(tmp_path)
    original = audit(tmp_path, source)
    # The replacement claims a later, already-decided source tree. Exact object
    # observations must still read the bound original, not this local fiction.
    git(tmp_path, "replace", transition, source)
    assert audit(tmp_path, source) == original


def test_adv_g108_collects_every_terminal_failure(tmp_path: Path) -> None:
    repository(tmp_path)
    (tmp_path / INDEX).write_text(index("Accepted").replace(DATE, "2026-08-16"), encoding="utf-8")
    second = tmp_path / "docs/decisions/ADR-0043-test.md"
    second.write_text(
        decision("Rejected")
        .replace("ADR-0042", "ADR-0043")
        .replace("- **Status:** Rejected", "- **Status:** Rejected\n- **Status:** Rejected"),
        encoding="utf-8",
    )
    result = audit(tmp_path, commit(tmp_path))
    assert {p["id"] for p in result["problems"]} == {"ADR-0042", "ADR-0043"}
    assert not result["ok"]


def test_acceptance_audit_requires_explicit_exact_source(tmp_path: Path) -> None:
    repository(tmp_path)
    result = subprocess.run(
        ["node", str(AUDITOR), "--root", str(tmp_path), "--source", "main"],
        text=True,
        capture_output=True,
    )
    assert result.returncode == 1 and not result.stdout
    assert "explicit full source commit required" in result.stderr


@pytest.mark.parametrize(
    "mutation",
    [
        "equality",
        "git-date",
        "author-substitution",
        "first-main",
        "fabricated-instant",
        "actual-time",
        "agreement",
        "coverage",
    ],
)
def test_temporal_mut_g18_g19_g21_audit_kills(tmp_path: Path, mutation: str) -> None:
    root = tmp_path / "subject-repository"
    transition, source = repository(root, at="2026-08-16T04:55:25Z")
    assert audit(root, source)["ok"]
    module = "governance/model/decision-evidence.mjs"
    if mutation == "equality":
        anchor = (
            "  const committerUtcDateDiffers = "
            "commit.gitCommitterAt.slice(0, 10) !== declared.decisionDate"
        )
        replacement = (
            anchor + "\n  if (committerUtcDateDiffers) throw new Error('mutant equality rule')"
        )
    elif mutation == "git-date":
        anchor, replacement = (
            "decisionDate: declared.decisionDate,",
            "decisionDate: commit.gitCommitterAt.slice(0, 10),",
        )
    elif mutation == "author-substitution":
        anchor, replacement = (
            "gitCommitterAt: commit.gitCommitterAt,",
            "gitCommitterAt: commit.gitAuthorAt,",
        )
    elif mutation == "first-main":
        anchor = "  const commit = context.readCommit(selection.revision)"
        replacement = (
            "  selection = {...selection, "
            "revision: context.commitsChangingPath(snapshot.commit, path)[0]}\n" + anchor
        )
    elif mutation == "fabricated-instant":
        anchor, replacement = (
            "decisionDate: declared.decisionDate,",
            "decisionDate: declared.decisionDate + 'T12:00:00Z',",
        )
    elif mutation == "actual-time":
        anchor = "Local verification establishes exact objects, bytes and encoded Git metadata only"
        replacement = "Git metadata proves actual recording time and recording latency"
    elif mutation == "agreement":
        (root / INDEX).write_text(index("Accepted").replace(DATE, "2026-08-16"), encoding="utf-8")
        source = commit(root)
        assert not audit(root, source)["ok"]
        anchor = (
            "if (distinct.length !== 1) throw new Error('missing or conflicting ' + description)"
        )
        replacement = "if (distinct.length === 0) throw new Error('missing ' + description)"
    else:
        (root / ADR).write_text(
            decision("Accepted").replace("- **Accepted:** " + DATE, "- **Accepted:** invalid"),
            encoding="utf-8",
        )
        source = commit(root)
        assert not audit(root, source)["ok"]
        anchor = "if (status === 'Proposed') continue"
        replacement = "if (status === 'Proposed' || id === 'ADR-0042') continue"
    subject = tmp_path / "mutant"
    shutil.copytree(REPOSITORY / "scripts", subject / "scripts")
    target = subject / "scripts" / module
    original = target.read_text(encoding="utf-8")
    assert original.count(anchor) == 1 and anchor != replacement
    target.write_text(original.replace(anchor, replacement, 1), encoding="utf-8")
    mutated = audit(root, source, auditor=subject / "scripts/governance/genesis/acceptance.mjs")
    if mutation in {"equality", "first-main"}:
        assert not mutated["ok"]
    elif mutation in {"agreement", "coverage"}:
        assert mutated["ok"], mutated
    elif mutation == "actual-time":
        assert "encoded Git metadata only" not in mutated["manualProvenance"]
    else:
        row = mutated["observations"][0]
        assert row["transition"]["identity"]["value"] == transition
        assert (row["decisionDate"], row["transition"]["gitCommitterAt"]) != (
            DATE,
            "2026-08-16T04:55:25Z",
        )
