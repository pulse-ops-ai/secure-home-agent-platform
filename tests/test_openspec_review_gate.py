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

import hashlib
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


SCOPE = "scope-one"
BASE = "base-ref"


def _gate(
    repo: Path,
    mode: str,
    change: str = "demo",
    *,
    scope: str | None = SCOPE,
    epoch: int | None = 1,
    base: str | None = BASE,
    base_sha: str | None = "AUTO",
    extra: list[str] | None = None,
) -> subprocess.CompletedProcess[str]:
    args = ["node", str(SCRIPT), mode, "--change", change]
    if base is not None:
        args += ["--base", base]
    if base_sha is not None:
        args += ["--base-sha", base_sha]
    if mode == "manifest":
        if scope is not None:
            args += ["--scope", scope]
        if epoch is not None:
            args += ["--epoch", str(epoch)]
    args += extra or []
    if base_sha == "AUTO":
        # The authoritative-SHA path, which is how CI proves freshness from
        # pull_request.base.sha. Substituted here so every existing test keeps
        # exercising the same shape a real caller uses.
        resolved = subprocess.run(
            ["git", "rev-parse", f"{base}^{{commit}}"] if base else ["git", "rev-parse", "HEAD"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
        args = [a if a != "AUTO" else resolved for a in args]
    return subprocess.run(args, cwd=repo, capture_output=True, text=True, check=False)


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
    for name in ("proposal", "design", "assurance"):
        (change / f"{name}.md").write_text(f"# {name}\n\nplanning content\n")
    # tasks.md OWNS release scope. The review only refers to the id.
    (change / "tasks.md").write_text(
        f"# tasks\n\n## Scope one\n\n<!-- review-scope: {SCOPE} -->\n\n- [ ] do the work\n"
    )
    (change / "specs" / "capability" / "spec.md").write_text("# spec\n\nADDED requirement\n")

    _git(repo, "init", "-q", "-b", "fixture")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "planning")
    _git(repo, "branch", "-f", BASE, "HEAD")
    return repo


def _bare_origin(tmp_path: Path) -> Path:
    """A bare origin whose HEAD really points at `main`.

    `git init --bare` leaves HEAD on the host git's default branch, which is
    `master` on the GitHub runner and `main` on newer local installs.
    """
    origin = tmp_path / "origin.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", "-b", "main", str(origin)],
        check=True,
        capture_output=True,
    )
    return origin


def _base(repo: Path) -> None:
    """A stable ref standing in for `origin/main`, pointing at the planning commit."""
    _git(repo, "branch", "-f", BASE, "HEAD")


def _manifest(repo: Path, *, scope: str = SCOPE, epoch: int = 1) -> dict[str, Any]:
    result = _gate(repo, "manifest", scope=scope, epoch=epoch)
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
            [
                "node",
                str(SCRIPT),
                "manifest",
                "--change",
                "demo",
                "--scope",
                SCOPE,
                "--epoch",
                "1",
                "--base",
                BASE,
                "--base-sha",
                _git(repo, "rev-parse", f"{BASE}^{{commit}}").strip(),
            ],
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
    """The original blocker, now closed by construction rather than by refusal.

    Discovery used readdir, so an ignored spec could be digested into
    reviewed_artifacts while existing in no commit -- the manifest would name
    bytes that are nowhere in reviewed_commit. Enumeration now comes from the
    committed tree, so the file is not merely REFUSED, it is never seen.
    """
    repo = _planning_repo(tmp_path)
    _ignore(repo, "ghost.md")
    (repo / "openspec" / "changes" / "demo" / "specs" / "capability" / "ghost.md").write_text(
        "# ghost\n"
    )
    assert _git(repo, "status", "--porcelain").strip() == "", "the fixture must look clean to git"

    gate = _manifest(repo)
    paths = [artifact["path"] for artifact in gate["reviewed_artifacts"]]
    assert not any("ghost" in path for path in paths), (
        f"an uncommitted file reached the reviewed manifest: {paths}"
    )
    # And every path that DID reach it is in the pinned commit.
    for path in paths:
        assert (
            _git(repo, "cat-file", "-e", f"{gate['reviewed_commit']}:openspec/changes/demo/{path}")
            == ""
        )


def test_an_ignored_untracked_required_artifact_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _git(repo, "rm", "-q", "openspec/changes/demo/tasks.md")
    _git(repo, "commit", "-qm", "remove tasks")
    _ignore(repo, "tasks.md")
    (repo / "openspec" / "changes" / "demo" / "tasks.md").write_text(
        f"# tasks\n\n<!-- review-scope: {SCOPE} -->\n"
    )
    assert _git(repo, "status", "--porcelain").strip() == ""
    # Either refusal proves the property: the ignored worktree copy cannot
    # stand in for a committed artifact. Reading governed bytes from the object
    # store reaches PLANNING_FILE_MISSING first, which is the more direct
    # statement -- the file is simply not in the commit.
    assert _refusal(_gate(repo, "manifest")) in {
        "PLANNING_FILE_NOT_TRACKED",
        "PLANNING_FILE_MISSING",
    }


def test_an_untracked_artifact_cannot_disturb_an_accepted_review(tmp_path: Path) -> None:
    """An ignored file appearing later must not change what was reviewed.

    Before, it would have been digested and produced ARTIFACT_SET_DRIFT against
    the accepted manifest -- a refusal, but for a file that was never part of
    the change. Now it is invisible, so the accepted review still verifies.
    """
    repo = _planning_repo(tmp_path)
    _accept(repo)
    _ignore(repo, "ghost.md")
    (repo / "openspec" / "changes" / "demo" / "specs" / "capability" / "ghost.md").write_text(
        "# ghost\n"
    )
    assert _git(repo, "status", "--porcelain").strip() == ""
    result = _gate(repo, "verify")
    assert result.returncode == 0, result.stdout + result.stderr


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


# ── repeatable review epochs ────────────────────────────────────────────────


def _archive_current_round(repo: Path, epoch: int) -> None:
    """Move the accepted current review into history, byte-for-byte.

    The name carries the reviewed sha12 because admission is mechanical: the
    gate parses the round's own block and requires it to agree with the name.
    """
    change = repo / "openspec" / "changes" / "demo"
    reviews = change / "reviews"
    reviews.mkdir(exist_ok=True)
    current = change / "preimplementation-review.md"
    text = current.read_text()
    block = re.search(r"<!--\s*openspec-review-gate\s*([\s\S]*?)-->", text)
    assert block is not None, "the accepted review carries no gate block"
    gate = json.loads(block.group(1))
    (reviews / f"{epoch}-{gate['reviewed_commit'][:12]}.md").write_text(text)
    current.unlink()


def test_a_second_review_epoch_reopens_the_boundary_after_scope_one_lands(
    tmp_path: Path,
) -> None:
    """The whole point of epochs, end to end.

    Epoch 1 authorizes scope 1. Real implementation drift then lands -- drift
    that makes the epoch-1 review unusable, which is asserted rather than
    assumed. Epoch 2 establishes a fresh boundary for scope 2 over the new
    bytes, and the epoch-1 review survives only as history.
    """
    repo = _planning_repo(tmp_path)
    tasks = repo / "openspec" / "changes" / "demo" / "tasks.md"
    tasks.write_text(
        f"# tasks\n\n## Scope one\n\n<!-- review-scope: {SCOPE} -->\n\n"
        "- [ ] land scope one\n\n## Scope two\n\n<!-- review-scope: scope-two -->\n\n"
        "- [ ] land scope two\n"
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "two release scopes")
    _git(repo, "branch", "-f", BASE, "HEAD")

    _accept(repo)
    assert _gate(repo, "verify").returncode == 0, "epoch 1 must authorize scope 1"

    # Real implementation drift for scope 1.
    (repo / "src").mkdir()
    (repo / "src" / "scope_one.ts").write_text("export const one = 1\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "implement scope one")

    # The epoch-1 review is now unusable, and that is what makes epoch 2 needed.
    assert _refusal(_gate(repo, "verify")) == "REPOSITORY_DRIFT_AFTER_REVIEW"

    # New boundary: archive epoch 1, pin epoch 2 for the next scope.
    _archive_current_round(repo, 1)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "archive review epoch 1")
    _git(repo, "branch", "-f", BASE, "HEAD")

    gate = _accepted_gate(_manifest(repo, scope="scope-two", epoch=2))
    (repo / "openspec" / "changes" / "demo" / "preimplementation-review.md").write_text(
        _review_text(gate)
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "accepting review epoch 2")

    result = _gate(repo, "verify")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "epoch=2" in result.stdout
    assert "scope=scope-two" in result.stdout

    # The implementation file is NOT a planning artifact merely because the
    # epoch advanced.
    assert all("src/" not in a["path"] for a in gate["reviewed_artifacts"])
    # And the historical round is still exactly the bytes that were accepted.
    rounds = sorted((repo / "openspec" / "changes" / "demo" / "reviews").glob("1-*.md"))
    assert len(rounds) == 1, rounds
    assert "review_epoch" in rounds[0].read_text()


@pytest.mark.parametrize(
    ("epoch", "code"),
    [(1, "REVIEW_EPOCH_SEQUENCE"), (3, "REVIEW_EPOCH_SEQUENCE"), (0, "INVALID_REVIEW_EPOCH")],
)
def test_a_duplicate_skipped_or_invalid_epoch_is_refused(
    tmp_path: Path, epoch: int, code: str
) -> None:
    """With epoch 1 admitted, only epoch 2 is next."""
    repo = _planning_repo(tmp_path)
    _accept(repo)
    _archive_current_round(repo, 1)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "archive epoch 1")
    _git(repo, "branch", "-f", BASE, "HEAD")
    assert _refusal(_gate(repo, "manifest", epoch=epoch)) == code


def test_a_current_review_whose_epoch_disagrees_with_history_is_refused(
    tmp_path: Path,
) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"review_epoch": 4})
    assert _refusal(_gate(repo, "verify")) == "REVIEW_EPOCH_SEQUENCE"


def test_an_unknown_scope_id_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"scope_id": "no-such-scope"})
    assert _refusal(_gate(repo, "verify")) == "SCOPE_NOT_DECLARED"


def test_a_duplicated_scope_declaration_is_refused(tmp_path: Path) -> None:
    """One scope, one id: a repeated marker makes `scope_id` ambiguous."""
    repo = _planning_repo(tmp_path)
    tasks = repo / "openspec" / "changes" / "demo" / "tasks.md"
    tasks.write_text(tasks.read_text() + f"\n<!-- review-scope: {SCOPE} -->\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "duplicate scope")
    _git(repo, "branch", "-f", BASE, "HEAD")
    assert _refusal(_gate(repo, "manifest")) == "DUPLICATE_REVIEW_SCOPE"


def test_a_scope_marker_inside_a_fence_does_not_declare_a_scope(tmp_path: Path) -> None:
    """Documentation showing the marker must not declare a release scope."""
    repo = _planning_repo(tmp_path)
    tasks = repo / "openspec" / "changes" / "demo" / "tasks.md"
    tasks.write_text(
        "# tasks\n\n```markdown\n<!-- review-scope: documented-example -->\n```\n\n"
        f"<!-- review-scope: {SCOPE} -->\n"
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "documented example")
    _git(repo, "branch", "-f", BASE, "HEAD")
    assert _gate(repo, "manifest").returncode == 0
    assert _refusal(_gate(repo, "manifest", scope="documented-example")) == "SCOPE_NOT_DECLARED"


# ── the review is bound to an exact target base ─────────────────────────────


def test_the_base_is_recorded_as_an_exact_commit_not_a_ref(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    gate = _manifest(repo)
    head = _git(repo, "rev-parse", "HEAD").strip()
    assert gate["reviewed_base_commit"] == head
    assert BASE not in json.dumps(gate), "a mutable ref must never be the recorded authority"


def test_base_drift_after_the_review_is_refused(tmp_path: Path) -> None:
    """The gate pinned the planning branch but not the base it was reviewed against."""
    repo = _planning_repo(tmp_path)
    _accept(repo)
    assert _gate(repo, "verify").returncode == 0

    # The target branch advances underneath the accepted review.
    _git(repo, "checkout", "-q", BASE)
    (repo / "unrelated.md").write_text("# landed on the base\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "base moves")
    _git(repo, "checkout", "-q", "fixture")

    result = _gate(repo, "verify")
    assert _refusal(result) == "REVIEW_BASE_DRIFT"
    # And it must say a fresh epoch may be a FOCUSED review, not an audit.
    assert "focused base-freshness review" in result.stderr


def test_a_missing_or_unresolvable_base_never_demotes_to_inference(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    assert _refusal(_gate(repo, "verify", base=None)) == "BASE_REF_REQUIRED"
    assert _refusal(_gate(repo, "verify", base="no-such-ref")) == "BASE_REF_UNRESOLVABLE"
    assert _refusal(_gate(repo, "manifest", base="no-such-ref")) == "BASE_REF_UNRESOLVABLE"


def test_a_base_not_incorporated_into_head_is_refused(tmp_path: Path) -> None:
    """The reviewed work must actually sit on the base it claims."""
    repo = _planning_repo(tmp_path)
    _git(repo, "checkout", "-q", "--orphan", "elsewhere")
    (repo / "other.md").write_text("# unrelated history\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "unrelated root")
    _git(repo, "branch", "-f", "detached-base", "HEAD")
    _git(repo, "checkout", "-q", "fixture")
    assert _refusal(_gate(repo, "manifest", base="detached-base")) == "BASE_NOT_INCORPORATED"


# ── the v1 contract must not be reinterpreted under v2 rules ────────────────


def test_a_v1_contract_block_is_refused(tmp_path: Path) -> None:
    """A v1 review never considered a scope or a base; reading it as v2 would
    treat it as though it had."""
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"contract": "preimplementation-review-v1"})
    assert _refusal(_gate(repo, "verify")) == "WRONG_GATE_CONTRACT"


# ── the architecture-review stopping rule ───────────────────────────────────


def test_assigned_p2_p3_findings_do_not_block_architecture_acceptance(
    tmp_path: Path,
) -> None:
    """v2 is not an all-findings-must-be-zero process.

    Architecture may be accepted with P2/P3 findings when each is assigned to an
    executable task, proof obligation, or explicitly deferred landing. Only
    UNASSIGNED non-P1 findings and unresolved P1s block.
    """
    repo = _planning_repo(tmp_path)
    markers = {key: list(value) for key, value in MARKERS.items()}
    markers["Findings"] = [
        "| P2 | digest ordering is locale-dependent | assigned to task 4 |",
        "| P3 | refusal message names the wrong section | assigned to task 7 |",
        "",
        "**Unresolved P1 findings:** `none`",
        "**Unassigned P2/P3 findings:** `0`",
    ]
    _accept(repo, markers=markers)
    result = _gate(repo, "verify")
    assert result.returncode == 0, result.stdout + result.stderr


def test_an_unassigned_non_p1_finding_blocks_acceptance(tmp_path: Path) -> None:
    """The other half: assignment is what makes a P2 acceptable, not silence."""
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"unassigned_p2_p3_count": 2})
    assert _refusal(_gate(repo, "verify")) == "UNASSIGNED_NON_P1_FINDINGS"


def test_an_unresolved_p1_blocks_acceptance(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo, gate_overrides={"unresolved_p1_count": 1})
    assert _refusal(_gate(repo, "verify")) == "UNRESOLVED_P1"


# ── admission is a state transition, not a naming convention ────────────────


def test_a_fabricated_history_file_cannot_manufacture_an_epoch(tmp_path: Path) -> None:
    """`reviews/1-fake.md` containing `# round 1` used to admit epoch 1.

    Enumeration was filesystem readdir over any `<n>-*.md`, and nothing looked
    inside. That let epoch 2 be claimed with no accepted epoch 1 at all.
    """
    repo = _planning_repo(tmp_path)
    reviews = repo / "openspec" / "changes" / "demo" / "reviews"
    reviews.mkdir()
    (reviews / "1-abcdefabcdef.md").write_text("# round 1\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "fabricated history")
    _git(repo, "branch", "-f", BASE, "HEAD")
    assert _refusal(_gate(repo, "manifest", epoch=2)) == "UNADMISSIBLE_REVIEW_HISTORY"


def test_an_ignored_history_file_cannot_manufacture_an_epoch(tmp_path: Path) -> None:
    """The same class the planning-artifact fix closed, on the history side."""
    repo = _planning_repo(tmp_path)
    _ignore(repo, "1-abcdefabcdef.md")
    reviews = repo / "openspec" / "changes" / "demo" / "reviews"
    reviews.mkdir()
    (reviews / "1-abcdefabcdef.md").write_text("# round 1\n")
    assert _git(repo, "status", "--porcelain").strip() == ""
    # Enumerating the committed tree means an uncommitted round is simply not
    # there, so epoch 2 has no predecessor.
    assert _refusal(_gate(repo, "manifest", epoch=2)) == "REVIEW_EPOCH_SEQUENCE"


@pytest.mark.parametrize(
    ("mutation", "fragment"),
    [
        ({"review_epoch": 7}, "review_epoch is 7"),
        ({"verdict": "REVIEW_REQUIRED"}, "verdict is REVIEW_REQUIRED"),
        ({"contract": "preimplementation-review-v1"}, "contract must be"),
    ],
)
def test_a_history_round_whose_block_disagrees_is_not_admitted(
    tmp_path: Path, mutation: dict[str, Any], fragment: str
) -> None:
    """A round must be a real accepted review that agrees with its own name."""
    repo = _planning_repo(tmp_path)
    _accept(repo)
    _archive_current_round(repo, 1)
    reviews = repo / "openspec" / "changes" / "demo" / "reviews"
    round_file = next(reviews.glob("1-*.md"))
    text = round_file.read_text()
    block = re.search(r"<!--\s*openspec-review-gate\s*([\s\S]*?)-->", text)
    assert block is not None, "the accepted review carries no gate block"
    gate = json.loads(block.group(1))
    gate.update(mutation)
    round_file.write_text(
        re.sub(
            r"<!--\s*openspec-review-gate\s*[\s\S]*?-->",
            "<!-- openspec-review-gate\n" + json.dumps(gate, indent=2) + "\n-->",
            text,
            count=1,
        )
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "tamper with history")
    _git(repo, "branch", "-f", BASE, "HEAD")
    result = _gate(repo, "manifest", epoch=2)
    assert _refusal(result) == "UNADMISSIBLE_REVIEW_HISTORY"
    assert fragment in result.stderr


def test_a_misnamed_history_round_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    reviews = repo / "openspec" / "changes" / "demo" / "reviews"
    reviews.mkdir()
    (reviews / "1-round.md").write_text("# round\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "misnamed round")
    _git(repo, "branch", "-f", BASE, "HEAD")
    assert _refusal(_gate(repo, "manifest", epoch=2)) == "MALFORMED_REVIEW_HISTORY"


# ── committed objects are the byte authority ────────────────────────────────


def test_skip_worktree_cannot_substitute_planning_bytes(tmp_path: Path) -> None:
    """git reports a skip-worktree file as clean while its bytes differ.

    Verified directly: `git update-index --skip-worktree a.md`, edit a.md,
    `git status --porcelain` and `git diff --name-only` are both empty while the
    worktree holds B and HEAD holds A. Hashing the worktree would have pinned a
    commit containing A while digesting B.
    """
    repo = _planning_repo(tmp_path)
    design = "openspec/changes/demo/design.md"
    _git(repo, "update-index", "--skip-worktree", design)
    (repo / design).write_text("# design\n\nsubstituted bytes\n")
    assert _git(repo, "status", "--porcelain").strip() == "", "git must report this clean"

    # The flag itself is refused, because the worktree-clean claim is false.
    assert _refusal(_gate(repo, "manifest")) == "HIDDEN_INDEX_FLAGS"

    # And with the flag cleared, the digest is the COMMITTED blob's, not the
    # worktree's -- which is still holding the substituted bytes.
    _git(repo, "update-index", "--no-skip-worktree", design)
    _git(repo, "checkout", "--", design)
    gate = _manifest(repo)
    committed = _git(repo, "rev-parse", "HEAD").strip()
    for artifact in gate["reviewed_artifacts"]:
        blob = subprocess.run(
            ["git", "show", f"{committed}:openspec/changes/demo/{artifact['path']}"],
            cwd=repo,
            capture_output=True,
            check=True,
        ).stdout
        assert hashlib.sha256(blob).hexdigest() == artifact["sha256"], artifact["path"]


def test_the_manifest_digest_equals_the_git_blob_not_the_worktree(tmp_path: Path) -> None:
    """The assertion the earlier existence check did not make."""
    repo = _planning_repo(tmp_path)
    gate = _manifest(repo)
    for artifact in gate["reviewed_artifacts"]:
        blob = subprocess.run(
            ["git", "show", f"{gate['reviewed_commit']}:openspec/changes/demo/{artifact['path']}"],
            cwd=repo,
            capture_output=True,
            check=True,
        ).stdout
        assert hashlib.sha256(blob).hexdigest() == artifact["sha256"], artifact["path"]


# ── base freshness must be proven, never assumed ────────────────────────────


def test_a_base_with_no_freshness_proof_is_refused(tmp_path: Path) -> None:
    """A local remote-tracking ref can be arbitrarily stale."""
    repo = _planning_repo(tmp_path)
    _accept(repo)
    assert _refusal(_gate(repo, "verify", base_sha=None)) == "BASE_FRESHNESS_REQUIRED"


def test_a_stale_local_base_is_refused_against_the_authoritative_sha(tmp_path: Path) -> None:
    """GitHub main advanced; the local ref did not. Both used to resolve the
    same stale SHA and the gate passed."""
    repo = _planning_repo(tmp_path)
    _accept(repo)
    authoritative = "b" * 40
    result = _gate(repo, "verify", base_sha=authoritative)
    assert _refusal(result) == "REVIEW_BASE_STALE"
    assert "behind the real target branch" in result.stderr


def test_an_unreachable_remote_refuses_rather_than_assuming_freshness(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    result = _gate(repo, "verify", base_sha=None, extra=["--remote", "nosuchremote/main"])
    assert _refusal(result) == "BASE_FRESHNESS_UNPROVEN"


def test_a_live_remote_matching_the_base_is_accepted(tmp_path: Path) -> None:
    """The control: a genuinely current base must still pass."""
    origin = _bare_origin(tmp_path)
    repo = _planning_repo(tmp_path)
    _accept(repo)
    _git(repo, "remote", "add", "origin", str(origin))
    _git(repo, "push", "-q", "origin", f"{BASE}:refs/heads/main")
    result = _gate(repo, "verify", base_sha=None, extra=["--remote", "origin/main"])
    assert result.returncode == 0, result.stdout + result.stderr
    assert "freshness=--remote origin/main" in result.stdout


def test_a_live_remote_ahead_of_the_local_base_is_refused(tmp_path: Path) -> None:
    """The real scenario: the branch advanced and nobody fetched."""
    origin = _bare_origin(tmp_path)
    repo = _planning_repo(tmp_path)
    _accept(repo)
    _git(repo, "remote", "add", "origin", str(origin))
    _git(repo, "push", "-q", "origin", f"{BASE}:refs/heads/main")

    # Someone else lands on main. The local ref is untouched.
    other = tmp_path / "other"
    # --branch main explicitly: a bare repository's HEAD still points at the host
    # git's default branch -- master on the GitHub runner -- so a plain clone
    # checks out the wrong branch and the later push is a non-fast-forward.
    # Leaving that platform-dependent is what made this pass locally and fail in CI.
    subprocess.run(
        ["git", "clone", "-q", "--branch", "main", str(origin), str(other)],
        check=True,
        capture_output=True,
    )
    _git(other, "config", "user.email", "t@e")
    (other / "landed.md").write_text("# landed elsewhere\n")
    _git(other, "add", "-A")
    _git(other, "commit", "-qm", "someone else lands")
    _git(other, "push", "-q", "origin", "HEAD:main")

    result = _gate(repo, "verify", base_sha=None, extra=["--remote", "origin/main"])
    assert _refusal(result) == "REVIEW_BASE_STALE"
    assert "stale" in result.stderr


# ── the repository squash-merges, so prove the epoch flow survives it ───────


def test_a_squash_merged_planning_package_needs_a_fresh_epoch(tmp_path: Path) -> None:
    """This repository squash-merges pull requests.

    A squash merge produces a NEW commit on main whose only parent is the old
    main -- the reviewed branch commit is not an ancestor of it. The gate's
    "reviewed_commit is an ancestor of HEAD" rule therefore refuses a
    carried-over epoch, and that rule is deliberately NOT weakened. The epoch
    model is what makes it recoverable: archive the old round, take a fresh
    epoch for the same scope against the real squash-merge base.

    Written so the first dogfood of v2 on a real change is not the first time
    anyone finds out how it behaves through the actual merge strategy.
    """
    repo = _planning_repo(tmp_path)
    _accept(repo)
    assert _gate(repo, "verify").returncode == 0, "epoch 1 on the planning branch"

    planning_head = _git(repo, "rev-parse", "HEAD").strip()
    review_text = (
        repo / "openspec" / "changes" / "demo" / "preimplementation-review.md"
    ).read_text()
    pre_merge_base = _git(repo, "rev-parse", f"{BASE}^{{commit}}").strip()

    # Squash merge: a brand-new commit whose single parent is the old base and
    # whose tree is the branch's. Nothing from the branch is an ancestor of it.
    _git(repo, "checkout", "-q", "-B", "trunk", pre_merge_base)
    _git(repo, "read-tree", planning_head)
    _git(repo, "checkout-index", "-a", "-f")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "squash merge the planning package (#N)")
    squashed = _git(repo, "rev-parse", "HEAD").strip()

    parents = _git(repo, "rev-list", "--parents", "-n", "1", squashed).split()
    assert len(parents) == 2, f"a squash merge has exactly one parent: {parents}"
    assert planning_head not in parents
    assert (
        subprocess.run(
            ["git", "merge-base", "--is-ancestor", planning_head, squashed],
            cwd=repo,
            capture_output=True,
            check=False,
        ).returncode
        != 0
    ), "the reviewed branch commit must NOT be an ancestor of the squashed commit"

    # The base is now the squashed commit; implementation branches off it.
    _git(repo, "branch", "-f", BASE, squashed)
    _git(repo, "checkout", "-q", "-b", "implement-scope-one", squashed)

    # The pre-merge epoch cannot authorize here. Two independent rules are
    # violated -- the base advanced onto the squash commit, and the reviewed
    # commit is not an ancestor (asserted against git above). Which one the gate
    # reports first is an ordering detail; that it refuses is the contract.
    assert _refusal(_gate(repo, "verify")) in {
        "REVIEW_BASE_DRIFT",
        "REVIEWED_COMMIT_NOT_ANCESTOR",
    }

    # Recover the governed way: archive the pre-merge round, take a fresh epoch
    # for the SAME scope against the real squash-merge base.
    change = repo / "openspec" / "changes" / "demo"
    (change / "reviews").mkdir(exist_ok=True)
    block = re.search(r"<!--\s*openspec-review-gate\s*([\s\S]*?)-->", review_text)
    assert block is not None
    reviewed = json.loads(block.group(1))["reviewed_commit"]
    (change / "reviews" / f"1-{reviewed[:12]}.md").write_text(review_text)
    (change / "preimplementation-review.md").unlink()
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "archive the pre-merge review round")

    gate = _accepted_gate(_manifest(repo, scope=SCOPE, epoch=2))
    (change / "preimplementation-review.md").write_text(_review_text(gate))
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "accepting review epoch 2 after the squash merge")

    result = _gate(repo, "verify")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "epoch=2" in result.stdout
    assert f"scope={SCOPE}" in result.stdout, "the same scope, a later boundary"


def test_supplying_both_freshness_sources_is_refused(tmp_path: Path) -> None:
    """They are alternative AUTHORITIES, not a preference order.

    Silently preferring one would let a caller pass a real remote alongside a
    hand-written SHA and have the SHA decide without saying so.
    """
    repo = _planning_repo(tmp_path)
    _accept(repo)
    result = _gate(repo, "verify", extra=["--remote", "origin/main"])
    assert _refusal(result) == "CONFLICTING_FRESHNESS_SOURCES"


# ── verifying a commit that was never written to disk ───────────────────────


def test_the_gate_verifies_a_ref_that_is_not_checked_out(tmp_path: Path) -> None:
    """The property that removes untrusted code from the privileged runner.

    CodeQL flagged the boundary workflow for executing untrusted code: it
    checked out the pull request and then ran tooling in that workspace. The
    structural answer is to never place the pull request on disk at all -- fetch
    its objects and verify the ref. Every governed read already came from git
    objects; this proves the last one, spec enumeration, does too.
    """
    upstream = _planning_repo(tmp_path)
    _accept(upstream)
    assert _gate(upstream, "verify").returncode == 0, "the control, in the repo itself"
    reviewed = _git(upstream, "rev-parse", "HEAD").strip()
    base_sha = _git(upstream, "rev-parse", f"{BASE}^{{commit}}").strip()

    # A separate repository that has the OBJECTS but no working tree for them.
    consumer = tmp_path / "consumer"
    consumer.mkdir()
    _git(consumer, "init", "-q", "-b", "fixture")
    (consumer / "unrelated.md").write_text("# nothing to do with the change\n")
    _git(consumer, "add", "-A")
    _git(consumer, "commit", "-qm", "consumer root")
    _git(consumer, "fetch", "-q", str(upstream), f"+{reviewed}:refs/boundary/head")
    _git(consumer, "fetch", "-q", str(upstream), f"+{base_sha}:refs/boundary/base")

    # The change is NOT on disk here.
    assert not (consumer / "openspec" / "changes" / "demo").exists()

    result = subprocess.run(
        [
            "node",
            str(SCRIPT),
            "verify",
            "--change",
            "demo",
            "--ref",
            "refs/boundary/head",
            "--base",
            "refs/boundary/base",
            "--base-sha",
            base_sha,
        ],
        cwd=consumer,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "REVIEW_GATE_VALID" in result.stdout

    # And it really read the fetched ref, not the consumer's own tree: the
    # pinned planning commit is upstream's, and the consumer has no such path.
    assert f"reviewed_commit={base_sha}" in result.stdout
    assert _git(consumer, "rev-parse", "refs/boundary/head").strip() == reviewed


def test_an_unresolvable_ref_is_refused(tmp_path: Path) -> None:
    repo = _planning_repo(tmp_path)
    _accept(repo)
    result = _gate(repo, "verify", extra=["--ref", "refs/boundary/nope"], base_sha="AUTO")
    assert _refusal(result) == "REF_UNRESOLVABLE"
