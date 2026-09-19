"""Historical D6.2 observations; all authorship in these trees is test-only."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPOSITORY = Path(__file__).resolve().parents[1]
AUDITOR = REPOSITORY / "scripts/governance/genesis/acceptance.mjs"
ADR = "docs/decisions/ADR-0042-test.md"
INDEX = "docs/decisions/INDEX.md"
DATE = "2026-08-15"
RECORDED = "2026-08-15T16:55:25Z"


def git(root: Path, *args: str, at: str = RECORDED) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        env={
            **os.environ,
            "GIT_AUTHOR_DATE": "2026-08-15T16:39:37Z",
            "GIT_COMMITTER_DATE": at,
        },
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


def repository(
    root: Path,
    *,
    lifecycle: str = "Accepted",
    declaration: str = "both",
    at: str = RECORDED,
    original: bool = True,
) -> tuple[str, str]:
    (root / "docs/decisions").mkdir(parents=True)
    git(root, "init", "-q", "-b", "main")
    git(root, "config", "user.name", "Test recorder, not declared owner")
    git(root, "config", "user.email", "fixture@example.invalid")
    git(root, "config", "commit.gpgsign", "false")
    write(root, "Proposed")
    git(root, "add", ".")
    git(root, "commit", "-qm", "TEST proposed decision")
    if original:
        git(root, "checkout", "-qb", "review")
    write(root, lifecycle, declaration)
    git(root, "add", ".")
    git(root, "commit", "-qm", "TEST original transition", at=at)
    transition = git(root, "rev-parse", "HEAD")
    if original:
        git(root, "checkout", "-q", "main")
        git(root, "merge", "--squash", "review")
        # No PR suffix: detection must not depend on a subject convention.
        git(root, "commit", "-qm", "TEST delivery", at="2026-08-18T12:00:00Z")
        git(root, "branch", "-D", "review")
    return transition, git(root, "rev-parse", "HEAD")


def audit(root: Path, source: str) -> dict[str, Any]:
    result = subprocess.run(
        ["node", str(AUDITOR), "--root", str(root), "--source", source],
        cwd=REPOSITORY,
        text=True,
        capture_output=True,
        check=False,
    )
    payload: dict[str, Any] = json.loads(result.stdout)
    assert result.returncode == (0 if payload["ok"] else 1), result.stderr
    return payload


@pytest.mark.parametrize("lifecycle", ["Accepted", "Rejected"])
@pytest.mark.parametrize("declaration", ["header", "index", "both"])
def test_acceptance_audit_original_committer_not_author_or_squash(
    tmp_path: Path, lifecycle: str, declaration: str
) -> None:
    transition, source = repository(tmp_path, lifecycle=lifecycle, declaration=declaration)
    result = audit(tmp_path, source)
    assert result["ok"], result
    observation = result["observations"][0]
    assert observation["selected"]["revision"] == transition
    assert observation["selected"]["at"] == RECORDED
    assert observation["actor"] == "@fixture-owner"
    assert observation["classification"] == "locally-verified"
    assert observation["extractionRule"] == "exact-decision-transition-committer-v1"
    assert observation["selected"]["source"]["revision"] == transition
    assert "not human identity" in observation["manualProvenance"]
    assert source in observation["excludedDeliveryCommits"]
    # Exercise the candidate extractor's actual projection as well as the
    # observer, without constructing or writing any real candidate.
    projection = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {readFileSync} from 'node:fs'; "
            "import {acceptanceProvenance} from './scripts/governance/genesis/extract.mjs'; "
            "console.log(JSON.stringify(acceptanceProvenance(JSON.parse(readFileSync(0,'utf8')))))",
        ],
        cwd=REPOSITORY,
        input=json.dumps(observation),
        text=True,
        capture_output=True,
        check=True,
    )
    acceptance = json.loads(projection.stdout)
    assert acceptance["at"] == RECORDED
    assert acceptance["actor"] == "@fixture-owner"
    assert acceptance["outcome"] == lifecycle.lower()
    assert acceptance["reviewedIdentity"]["value"] == transition


def test_acceptance_audit_refuses_wrong_utc_date_despite_matching_author_date(
    tmp_path: Path,
) -> None:
    _, source = repository(tmp_path, at="2026-08-15T23:55:25-05:00")
    result = audit(tmp_path, source)
    assert result["problems"] == [{"id": "ADR-0042", "reason": "UTC_DATE_MISMATCH"}]
    assert result["observations"][0]["candidates"][0]["at"] == "2026-08-16T04:55:25Z"
    assert result["observations"][0]["selected"] is None


def test_acceptance_audit_never_falls_back_to_first_accepted_on_main(tmp_path: Path) -> None:
    _, source = repository(tmp_path, original=False)
    result = audit(tmp_path, source)
    assert result["problems"] == [{"id": "ADR-0042", "reason": "NO_EXACT_TRANSITION"}]


def test_acceptance_audit_requires_exact_decision_bytes(tmp_path: Path) -> None:
    _, _ = repository(tmp_path)
    with (tmp_path / ADR).open("a", encoding="utf-8") as stream:
        stream.write("\nChanged after transition.\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-qm", "TEST different decision bytes")
    result = audit(tmp_path, git(tmp_path, "rev-parse", "HEAD"))
    assert result["problems"] == [{"id": "ADR-0042", "reason": "NO_EXACT_TRANSITION"}]


def test_acceptance_audit_requires_a_proposed_to_decided_transition(tmp_path: Path) -> None:
    _, source = repository(tmp_path, original=False)
    git(tmp_path, "checkout", "-qb", "not-a-transition")
    (tmp_path / INDEX).write_text(index("Accepted") + "\nUnrelated note.\n", encoding="utf-8")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-qm", "TEST already Accepted")
    result = audit(tmp_path, source)
    assert result["problems"] == [{"id": "ADR-0042", "reason": "NO_EXACT_TRANSITION"}]


def test_acceptance_audit_refuses_ambiguous_originals(tmp_path: Path) -> None:
    transition, source = repository(tmp_path)
    git(tmp_path, "checkout", "-qb", "second-review", transition + "^")
    write(tmp_path, "Accepted")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-qm", "TEST duplicate transition", at="2026-08-15T17:00:00Z")
    result = audit(tmp_path, source)
    assert result["problems"] == [{"id": "ADR-0042", "reason": "AMBIGUOUS_TRANSITION"}]


@pytest.mark.parametrize("field", ["date", "actor"])
def test_acceptance_audit_refuses_conflicting_declarations(tmp_path: Path, field: str) -> None:
    _, _ = repository(tmp_path)
    text = index("Accepted")
    text = (
        text.replace(DATE, "2026-08-16")
        if field == "date"
        else text.replace("@fixture-owner", "@different-fixture-owner")
    )
    (tmp_path / INDEX).write_text(text, encoding="utf-8")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-qm", "TEST conflicting authority records")
    result = audit(tmp_path, git(tmp_path, "rev-parse", "HEAD"))
    assert result["problems"][0]["reason"] == "SOURCE_OBSERVATION_FAILED"
    assert "missing or conflicting" in result["problems"][0]["message"]


def test_acceptance_audit_collects_all_failures_before_stopping(tmp_path: Path) -> None:
    _, _ = repository(tmp_path, at="2026-08-16T12:00:00Z")
    # A second, malformed terminal decision must not hide the first failure.
    second = tmp_path / "docs/decisions/ADR-0043-test.md"
    second.write_text(
        decision("Rejected")
        .replace("ADR-0042", "ADR-0043")
        .replace("- **Status:** Rejected", "- **Status:** Rejected\n- **Status:** Rejected"),
        encoding="utf-8",
    )
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-qm", "TEST second undecidable historical record")
    result = audit(tmp_path, git(tmp_path, "rev-parse", "HEAD"))
    assert {item["id"] for item in result["problems"]} == {"ADR-0042", "ADR-0043"}


def test_acceptance_audit_requires_explicit_exact_source(tmp_path: Path) -> None:
    repository(tmp_path)
    result = subprocess.run(
        ["node", str(AUDITOR), "--root", str(tmp_path), "--source", "main"],
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 1
    assert not result.stdout
    assert "explicit full source commit required" in result.stderr
