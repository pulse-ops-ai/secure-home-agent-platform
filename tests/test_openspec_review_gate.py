"""The governed-spec-driven-v2 pre-apply review gate.

The gate is the only thing standing between "a review file exists" and "these
exact planning bytes were accepted". Every test here builds a real Git
repository with real commits and runs the real Node script as a subprocess --
no mocked Git, because the properties under test (ancestry, drift, staged vs
committed) are Git's, and a mock would only prove the mock.

Refusal CODES are asserted, never merely a nonzero exit: a gate that refuses
for the wrong reason sends someone to fix the wrong thing.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "openspec-review-gate.mjs"

REQUIRED_SECTIONS = [
    "Review Pin",
    "Independent Review Statement",
    "Reviewed Artifact Manifest",
    "Review Method",
    "Architecture Acceptance Checks",
    "Severity Calibration",
    "Findings",
    "Authority Allocation Assessment",
    "Repository Feasibility",
    "Invariant Stability",
    "Review-Finding Regression Promotion",
    "Verdict",
    "Apply Eligibility",
]

MARKERS = {
    "Findings": [
        "**Unresolved P1 findings:** `none`",
        "**Unassigned P2/P3 findings:** `0`",
    ],
    "Authority Allocation Assessment": ["**Authority allocation complete:** `YES`"],
    "Invariant Stability": ["**Invariant set changed by this review:** `NO`"],
    "Verdict": ["**ARCHITECTURE_ACCEPTED**"],
    "Apply Eligibility": ["**Apply eligible:** `YES`"],
}

GOOD_TIMESTAMP = "2026-08-26T09:15:00Z"


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        env={
            "PATH": "/usr/bin:/bin",
            "HOME": str(repo),
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@e",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@e",
        },
    )
    return result.stdout


def _gate(repo: Path, mode: str, change: str = "demo") -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(SCRIPT), mode, "--change", change],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def _refusal(result: subprocess.CompletedProcess[str]) -> str:
    """The refusal code, or a readable failure when the gate did not refuse."""
    assert result.returncode != 0, f"gate accepted when it should have refused:\n{result.stdout}"
    match = re.search(r"REVIEW_GATE_REFUSED \[([A-Z_0-9]+)\]", result.stderr)
    assert match is not None, f"no refusal code in:\n{result.stderr}"
    return match.group(1)


def _planning_repo(tmp_path: Path, *, schema: str = "governed-spec-driven-v2") -> Path:
    repo = tmp_path / "repo"
    change = repo / "openspec" / "changes" / "demo"
    (change / "specs" / "capability").mkdir(parents=True)
    (repo / "scripts").mkdir(parents=True, exist_ok=True)
    (repo / "scripts" / "openspec-review-gate.mjs").write_text(SCRIPT.read_text())

    (change / ".openspec.yaml").write_text(f"schema: {schema}\n")
    for name in ("proposal", "design", "assurance", "tasks"):
        (change / f"{name}.md").write_text(f"# {name}\n\nplanning content\n")
    (change / "specs" / "capability" / "spec.md").write_text("# spec\n\nADDED requirement\n")

    _git(repo, "init", "-q")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "planning")
    return repo


def _manifest(repo: Path) -> dict[str, Any]:
    result = _gate(repo, "manifest")
    assert result.returncode == 0, result.stdout + result.stderr
    body = re.search(r"<!--\s*openspec-review-gate\s*([\s\S]*?)-->", result.stdout)
    assert body is not None
    parsed: dict[str, Any] = json.loads(body.group(1))
    return parsed


def _review_text(
    gate: dict[str, Any],
    *,
    sections: list[str] | None = None,
    markers: dict[str, list[str]] | None = None,
    extra: str = "",
) -> str:
    block = "<!-- openspec-review-gate\n" + json.dumps(gate, indent=2) + "\n-->\n"
    placed = MARKERS if markers is None else markers
    out = ["# Pre-Implementation Review: demo\n", block, extra]
    for heading in REQUIRED_SECTIONS if sections is None else sections:
        out.append(f"\n## {heading}\n\n")
        for line in placed.get(heading, []):
            out.append(f"{line}\n")
        if heading not in placed:
            out.append("n/a\n")
    return "".join(out)


def _accepted_gate(gate: dict[str, Any], **overrides: object) -> dict[str, Any]:
    accepted = {
        **gate,
        "reviewer": "human:independent-reviewer",
        "reviewed_at": GOOD_TIMESTAMP,
        "verdict": "ARCHITECTURE_ACCEPTED",
        "unresolved_p1_count": 0,
        "unassigned_p2_p3_count": 0,
        "invariant_set_changed": False,
        "authority_allocation_complete": True,
    }
    accepted.update(overrides)
    return accepted


def _accept(repo: Path, **kwargs: object) -> None:
    """Write and COMMIT an accepting review over the current planning pin."""
    gate = _accepted_gate(_manifest(repo), **kwargs.pop("gate_overrides", {}))  # type: ignore[arg-type]
    review = repo / "openspec" / "changes" / "demo" / "preimplementation-review.md"
    review.write_text(_review_text(gate, **kwargs))  # type: ignore[arg-type]
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "accepting review")


# ── positive control ─────────────────────────────────────────────────────────


def test_a_committed_accepted_review_over_clean_planning_verifies(tmp_path: Path) -> None:
    """Without this, a gate that refused everything would look perfect."""
    repo = _planning_repo(tmp_path)
    _accept(repo)
    result = _gate(repo, "verify")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "REVIEW_GATE_VALID" in result.stdout


# ── drift protections ────────────────────────────────────────────────────────


def test_manifest_refuses_a_dirty_worktree(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    (repo / "openspec" / "changes" / "demo" / "design.md").write_text("# design\n\nedited\n")
    assert _refusal(_gate(repo, "manifest")) == "MANIFEST_REQUIRES_CLEAN_WORKTREE"


def test_planning_byte_drift_after_the_pin_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    (repo / "openspec" / "changes" / "demo" / "design.md").write_text("# design\n\ntampered\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "tamper")
    assert _refusal(_gate(repo, "verify")) == "ARTIFACT_BYTES_DRIFT"


def test_adding_a_delta_spec_after_the_pin_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    (repo / "openspec" / "changes" / "demo" / "specs" / "capability" / "extra.md").write_text(
        "# x\n"
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "add spec")
    assert _refusal(_gate(repo, "verify")) == "ARTIFACT_SET_DRIFT"


def test_removing_a_planning_artifact_after_the_pin_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    _git(repo, "rm", "-q", "openspec/changes/demo/specs/capability/spec.md")
    _git(repo, "commit", "-qm", "remove spec")
    assert _refusal(_gate(repo, "verify")) == "NO_DELTA_SPECS"


def test_an_unrelated_repository_change_after_the_pin_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    (repo / "src").mkdir()
    (repo / "src" / "app.ts").write_text("export const x = 1\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "implementation")
    assert _refusal(_gate(repo, "verify")) == "REPOSITORY_DRIFT_AFTER_REVIEW"


def test_a_change_selecting_the_wrong_schema_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path, schema="governed-spec-driven-v1")
    assert _refusal(_gate(repo, "manifest")) == "WRONG_CHANGE_SCHEMA"


def test_a_missing_planning_artifact_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _git(repo, "rm", "-q", "openspec/changes/demo/tasks.md")
    _git(repo, "commit", "-qm", "remove tasks")
    assert _refusal(_gate(repo, "manifest")) == "PLANNING_FILE_MISSING"


def test_a_symlinked_delta_spec_is_refused(tmp_path: Path) -> None:
    """The gate claims path containment; this is the claim, exercised."""
    repo = _planning_repo(tmp_path)
    outside = repo / "outside.md"
    outside.write_text("# outside\n")
    link = repo / "openspec" / "changes" / "demo" / "specs" / "capability" / "linked.md"
    link.symlink_to(outside)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "symlink")
    assert _refusal(_gate(repo, "manifest")) == "SPEC_SYMLINK_REFUSED"


# ── review-parser regressions ────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("owning", "marker", "code"),
    [
        ("Findings", "**Unresolved P1 findings:** `none`", "HUMAN_P1_COUNT_MISMATCH"),
        ("Findings", "**Unassigned P2/P3 findings:** `0`", "HUMAN_ASSIGNMENT_COUNT_MISMATCH"),
        (
            "Authority Allocation Assessment",
            "**Authority allocation complete:** `YES`",
            "HUMAN_AUTHORITY_STATUS_MISMATCH",
        ),
        (
            "Invariant Stability",
            "**Invariant set changed by this review:** `NO`",
            "HUMAN_INVARIANT_STATUS_MISMATCH",
        ),
    ],
)
def test_a_marker_moved_out_of_its_owning_section_is_refused(
    tmp_path: Path, owning: str, marker: str, code: str
) -> None:
    """The exact defect found in review: these were document-scoped.

    Each marker is moved into Review Method -- which owns none of them -- and
    its real section is left without it. The document still contains the marker;
    the owning section does not.
    """
    repo = _planning_repo(tmp_path)
    markers = {key: [m for m in value if m != marker] for key, value in MARKERS.items()}
    markers["Review Method"] = [*markers.get("Review Method", []), marker]
    _accept(repo, markers=markers)
    assert _refusal(_gate(repo, "verify")) == code


def test_apply_eligible_after_the_apply_section_is_refused(tmp_path: Path) -> None:
    """Slicing from a heading to EOF let a later section answer for it."""
    repo = _planning_repo(tmp_path)
    markers = {key: list(value) for key, value in MARKERS.items()}
    markers["Apply Eligibility"] = []
    sections = [*REQUIRED_SECTIONS, "Review History"]
    markers["Review History"] = ["**Apply eligible:** `YES`"]
    _accept(repo, markers=markers, sections=sections)
    assert _refusal(_gate(repo, "verify")) == "APPLY_ELIGIBILITY_MISMATCH"


def test_a_marker_duplicated_into_another_section_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    markers = {key: list(value) for key, value in MARKERS.items()}
    markers["Review Method"] = ["**Apply eligible:** `YES`"]
    _accept(repo, markers=markers)
    assert _refusal(_gate(repo, "verify")) == "MARKER_OUTSIDE_OWNING_SECTION"


def test_a_duplicated_required_section_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    sections = [*REQUIRED_SECTIONS, "Findings"]
    _accept(repo, sections=sections)
    assert _refusal(_gate(repo, "verify")) == "DUPLICATE_REVIEW_SECTION"


def test_required_sections_out_of_order_are_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    sections = list(REQUIRED_SECTIONS)
    sections[6], sections[7] = sections[7], sections[6]
    _accept(repo, sections=sections)
    assert _refusal(_gate(repo, "verify")) == "REVIEW_SECTION_ORDER"


def test_a_heading_inside_a_fenced_block_cannot_satisfy_a_section(tmp_path: Path) -> None:
    """An example block is illustration, not a section."""
    repo = _planning_repo(tmp_path)
    sections = [s for s in REQUIRED_SECTIONS if s != "Invariant Stability"]
    fenced = (
        "\n```markdown\n## Invariant Stability\n\n"
        "**Invariant set changed by this review:** `NO`\n```\n"
    )
    _accept(repo, sections=sections, extra=fenced)
    assert _refusal(_gate(repo, "verify")) == "REVIEW_SECTION_MISSING"


def test_two_verdict_tokens_are_refused(tmp_path: Path) -> None:
    """The template ships REVIEW_REQUIRED; adding acceptance beneath it must fail."""
    repo = _planning_repo(tmp_path)
    markers = {key: list(value) for key, value in MARKERS.items()}
    markers["Verdict"] = ["**REVIEW_REQUIRED**", "**ARCHITECTURE_ACCEPTED**"]
    _accept(repo, markers=markers)
    assert _refusal(_gate(repo, "verify")) == "HUMAN_VERDICT_MISMATCH"


def test_a_non_accepting_verdict_token_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    markers = {key: list(value) for key, value in MARKERS.items()}
    markers["Verdict"] = ["**FOCUSED_CLOSURE_REQUIRED**"]
    _accept(repo, markers=markers, gate_overrides={"verdict": "ARCHITECTURE_ACCEPTED"})
    assert _refusal(_gate(repo, "verify")) == "REVIEW_NOT_ACCEPTED"


def test_a_backticked_verdict_mention_in_prose_is_not_a_verdict(tmp_path: Path) -> None:
    """Prose may discuss the tokens; only a bold line of its own decides."""
    repo = _planning_repo(tmp_path)
    markers = {key: list(value) for key, value in MARKERS.items()}
    markers["Verdict"] = [
        "**ARCHITECTURE_ACCEPTED**",
        "",
        "`ARCHITECTURE_ACCEPTED` is permitted with assigned P2/P3 findings.",
    ]
    _accept(repo, markers=markers)
    assert _gate(repo, "verify").returncode == 0


# ── commit-boundary regressions ──────────────────────────────────────────────


def _write_review_only(repo: Path) -> None:
    gate = _accepted_gate(_manifest(repo))
    (repo / "openspec" / "changes" / "demo" / "preimplementation-review.md").write_text(
        _review_text(gate)
    )


def test_an_accepted_review_left_unstaged_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _write_review_only(repo)
    assert _refusal(_gate(repo, "verify")) == "VERIFY_REQUIRES_CLEAN_WORKTREE"


def test_an_accepted_review_left_staged_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _write_review_only(repo)
    _git(repo, "add", "-A")
    assert _refusal(_gate(repo, "verify")) == "VERIFY_REQUIRES_CLEAN_WORKTREE"


def test_an_untracked_file_during_verify_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    (repo / "scratch.txt").write_text("notes\n")
    assert _refusal(_gate(repo, "verify")) == "VERIFY_REQUIRES_CLEAN_WORKTREE"


def test_the_review_must_be_a_committed_fact_not_a_worktree_edit(tmp_path: Path) -> None:
    """The reachable half of the commit-boundary requirement.

    `verify` runs at the pre-apply boundary, so an accepted review that exists
    only in someone's worktree must not satisfy it. The script also carries
    REVIEW_NOT_COMMITTED and REVIEW_UNCHANGED_SINCE_PIN; both are documented in
    the source as defence in depth and neither is reachable today -- the first
    is shadowed by this clean-worktree requirement, and the second would need a
    commit to contain its own hash. They are not asserted here because a test
    that cannot fail proves nothing.
    """
    repo = _planning_repo(tmp_path)
    _write_review_only(repo)
    assert _refusal(_gate(repo, "verify")) == "VERIFY_REQUIRES_CLEAN_WORKTREE"

    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "accepting review")
    assert _gate(repo, "verify").returncode == 0


# ── timestamp ────────────────────────────────────────────────────────────────


def test_manifest_emits_a_timestamp_placeholder_not_the_current_time(tmp_path: Path) -> None:
    """manifest runs BEFORE the review, so it cannot know when review happened."""
    repo = _planning_repo(tmp_path)
    assert _manifest(repo)["reviewed_at"] == "REPLACE_WITH_RFC3339_TIMESTAMP"


def test_the_timestamp_placeholder_is_refused_at_verify(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"reviewed_at": "REPLACE_WITH_RFC3339_TIMESTAMP"})
    # The gate-shape check reaches it first, with the more specific code.
    assert _refusal(_gate(repo, "verify")) == "PLACEHOLDER_REVIEWED_AT"


@pytest.mark.parametrize(
    "value",
    [
        "2026-08-26",
        "August 26 2026",
        "2026-08-26 09:15:00",
        "26/08/2026T09:15:00Z",
        "2026-13-01T00:00:00Z",
    ],
)
def test_a_non_rfc3339_timestamp_is_refused(tmp_path: Path, value: str) -> None:
    """Date.parse accepts several of these; RFC 3339 does not."""
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"reviewed_at": value})
    assert _refusal(_gate(repo, "verify")) == "INVALID_REVIEWED_AT"


@pytest.mark.parametrize("value", ["2026-08-26T09:15:00Z", "2026-08-26T09:15:00.123+02:00"])
def test_a_valid_rfc3339_timestamp_passes(tmp_path: Path, value: str) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"reviewed_at": value})
    assert _gate(repo, "verify").returncode == 0


# ── determinism ──────────────────────────────────────────────────────────────


def test_artifact_order_is_locale_independent(tmp_path: Path) -> None:
    """localeCompare() is host-dependent; the manifest is compared for exact
    ordered equality, so ordering must come from the bytes."""
    repo = _planning_repo(tmp_path)
    specs = repo / "openspec" / "changes" / "demo" / "specs" / "capability"
    for name in ("Zeta.md", "alpha.md", "Ábaco.md", "beta.md"):
        (specs / name).write_text(f"# {name}\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "unicode specs")

    orders = []
    for locale in ("C", "en_US.UTF-8", "tr_TR.UTF-8"):
        result = subprocess.run(
            ["node", str(SCRIPT), "manifest", "--change", "demo"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=True,
            env={**os.environ, "LC_ALL": locale, "LANG": locale},
        )
        body = re.search(r"<!--\s*openspec-review-gate\s*([\s\S]*?)-->", result.stdout)
        assert body is not None
        orders.append([a["path"] for a in json.loads(body.group(1))["reviewed_artifacts"]])

    assert orders[0] == orders[1] == orders[2], f"artifact order is locale-dependent: {orders}"


# ── the manifest must describe the pinned commit, not the working directory ──


def _ignore(repo: Path, pattern: str) -> None:
    """Ignore a path the way a real .gitignore would, without adding a file.

    `.git/info/exclude` is used deliberately: a tracked `.gitignore` would
    itself change the planning package, and the defect under test is precisely
    a file that `git ls-files --others --exclude-standard` cannot see.
    """
    exclude = repo / ".git" / "info" / "exclude"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    with exclude.open("a") as handle:
        handle.write(f"{pattern}\n")


def test_an_ignored_untracked_delta_spec_never_enters_the_manifest(tmp_path: Path) -> None:
    """The blocker: ignored files are invisible to the clean-worktree check.

    Discovery used readdir, so an ignored spec could be digested into
    reviewed_artifacts while existing in no commit -- the manifest would name
    bytes that are nowhere in reviewed_commit.
    """
    repo = _planning_repo(tmp_path)
    _ignore(repo, "ghost.md")
    (repo / "openspec" / "changes" / "demo" / "specs" / "capability" / "ghost.md").write_text(
        "# ghost\n"
    )
    assert _git(repo, "status", "--porcelain").strip() == "", "the fixture must look clean to git"
    assert _refusal(_gate(repo, "manifest")) == "PLANNING_FILE_NOT_TRACKED"


def test_an_ignored_untracked_required_artifact_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _git(repo, "rm", "-q", "openspec/changes/demo/tasks.md")
    _git(repo, "commit", "-qm", "remove tasks")
    _ignore(repo, "tasks.md")
    (repo / "openspec" / "changes" / "demo" / "tasks.md").write_text("# tasks\n")
    assert _git(repo, "status", "--porcelain").strip() == ""
    assert _refusal(_gate(repo, "manifest")) == "PLANNING_FILE_NOT_TRACKED"


def test_verify_refuses_a_planning_package_holding_an_untracked_artifact(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    _ignore(repo, "ghost.md")
    (repo / "openspec" / "changes" / "demo" / "specs" / "capability" / "ghost.md").write_text(
        "# ghost\n"
    )
    assert _git(repo, "status", "--porcelain").strip() == ""
    assert _refusal(_gate(repo, "verify")) == "PLANNING_FILE_NOT_TRACKED"


def test_every_manifest_artifact_exists_in_the_reviewed_commit(tmp_path: Path) -> None:
    """The positive form of the same property, checked against Git itself."""
    repo = _planning_repo(tmp_path)
    gate = _manifest(repo)
    commit = gate["reviewed_commit"]
    for artifact in gate["reviewed_artifacts"]:
        blob = _git(repo, "cat-file", "-e", f"{commit}:openspec/changes/demo/{artifact['path']}")
        assert blob == "", f"{artifact['path']} is not in {commit}"


# ── reviewed_at must be a real calendar instant ─────────────────────────────


@pytest.mark.parametrize(
    "value",
    [
        "2026-02-29T00:00:00Z",  # 2026 is not a leap year
        "2026-02-30T00:00:00Z",  # Date.parse normalises this to 2 March
        "2026-04-31T00:00:00Z",
        "2026-00-10T00:00:00Z",
        "2026-08-26T24:00:00Z",
        "2026-08-26T09:61:00Z",
        "2026-08-26T09:15:00+24:00",
    ],
)
def test_an_impossible_calendar_instant_is_refused(tmp_path: Path, value: str) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"reviewed_at": value})
    assert _refusal(_gate(repo, "verify")) == "INVALID_REVIEWED_AT"


@pytest.mark.parametrize(
    "value",
    ["2024-02-29T00:00:00Z", "2000-02-29T12:00:00Z", "2026-08-26T23:59:60Z"],
)
def test_a_real_calendar_instant_passes(tmp_path: Path, value: str) -> None:
    """Leap day in a leap year, a century leap year, and a leap second."""
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"reviewed_at": value})
    assert _gate(repo, "verify").returncode == 0, value
