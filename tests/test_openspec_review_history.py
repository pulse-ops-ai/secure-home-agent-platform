"""Append-only review history, as a repository-history invariant.

`support/reviews/README.md` says historical rounds are append-only. That was a
convention with no mechanism: the pre-apply gate deliberately lets `reviews/**`
change, so nothing anywhere noticed a round being edited or deleted.

Append-only is a TWO-revision property, so these tests build real repositories
with real history and run the real checker. The split mirrors
check-set-releases.mjs versus check-release-history.mjs.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "check-openspec-review-history.mjs"

ROUND = "openspec/changes/demo/reviews/001-abc123def456.md"


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
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


def _write(repo: Path, relative: str, text: str) -> None:
    target = repo / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def _repo_with_round(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir(parents=True)
    _git(repo, "init", "-q")
    _write(repo, ROUND, "# round 1\n\nfindings\n")
    _write(repo, "openspec/changes/demo/proposal.md", "# proposal\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "admit round 1")
    return repo


def _check(repo: Path, base: str = "HEAD~1") -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo), "--base", base],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def _refused(result: subprocess.CompletedProcess[str], fragment: str) -> None:
    assert result.returncode == 1, f"expected refusal, got:\n{result.stdout}{result.stderr}"
    assert fragment in result.stderr, result.stderr


# ── the live repository ──────────────────────────────────────────────────────


def test_the_live_repository_passes_its_own_history_gate() -> None:
    result = subprocess.run(
        [
            "node",
            str(SCRIPT),
            "--base",
            subprocess.run(
                ["git", "merge-base", "HEAD", "origin/main"],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip(),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


# ── the four rules ───────────────────────────────────────────────────────────


def test_adding_a_new_historical_round_is_allowed(tmp_path: Path) -> None:
    """The control: append-only must still permit appending."""
    repo = _repo_with_round(tmp_path)
    _write(repo, "openspec/changes/demo/reviews/002-def456abc789.md", "# round 2\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "admit round 2")
    result = _check(repo)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "1 added" in result.stdout


def test_modifying_an_admitted_round_is_refused(tmp_path: Path) -> None:
    repo = _repo_with_round(tmp_path)
    _write(repo, ROUND, "# round 1\n\nfindings, quietly rewritten\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "rewrite history")
    _refused(_check(repo), "was modified")


def test_deleting_an_admitted_round_is_refused(tmp_path: Path) -> None:
    repo = _repo_with_round(tmp_path)
    _git(repo, "rm", "-q", ROUND)
    _git(repo, "commit", "-qm", "remove round")
    _refused(_check(repo), "was deleted")


def test_renaming_a_round_inside_the_live_change_is_refused(tmp_path: Path) -> None:
    """A rewritten round wearing a new name is still a rewritten round."""
    repo = _repo_with_round(tmp_path)
    _git(repo, "mv", ROUND, "openspec/changes/demo/reviews/001-renamed.md")
    _git(repo, "commit", "-qm", "rename round")
    _refused(_check(repo), "was renamed")


# ── the archive carve-out ────────────────────────────────────────────────────


def test_a_byte_identical_archive_move_is_allowed(tmp_path: Path) -> None:
    """Archiving a change relocates its whole directory. That must keep working."""
    repo = _repo_with_round(tmp_path)
    (repo / "openspec" / "changes" / "archive" / "demo" / "reviews").mkdir(parents=True)
    _git(
        repo,
        "mv",
        "openspec/changes/demo/reviews/001-abc123def456.md",
        "openspec/changes/archive/demo/reviews/001-abc123def456.md",
    )
    _git(
        repo, "mv", "openspec/changes/demo/proposal.md", "openspec/changes/archive/demo/proposal.md"
    )
    _git(repo, "commit", "-qm", "archive the change")
    result = _check(repo)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "1 archived" in result.stdout


def test_an_archive_move_that_also_edits_the_round_is_refused(tmp_path: Path) -> None:
    """Relocation preserves a round; relocation plus an edit does not."""
    repo = _repo_with_round(tmp_path)
    archived = repo / "openspec" / "changes" / "archive" / "demo" / "reviews"
    archived.mkdir(parents=True)
    _git(
        repo,
        "mv",
        "openspec/changes/demo/reviews/001-abc123def456.md",
        "openspec/changes/archive/demo/reviews/001-abc123def456.md",
    )
    (archived / "001-abc123def456.md").write_text("# round 1\n\nedited during archive\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "archive and edit")
    _refused(_check(repo), "modified bytes")


# ── baseline posture, matching check-release-history.mjs ─────────────────────


def test_an_invalid_explicit_base_fails_rather_than_falling_back(tmp_path: Path) -> None:
    repo = _repo_with_round(tmp_path)
    _write(repo, "openspec/changes/demo/reviews/002-x.md", "# round 2\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "round 2")
    assert _check(repo, base="HEAD~1").returncode == 0, "the fallback must be usable"
    result = _check(repo, base="does-not-exist")
    assert result.returncode == 1
    assert "is not a commit" in result.stderr


def test_an_inferred_baseline_is_never_head_itself(tmp_path: Path) -> None:
    """Comparing HEAD with HEAD detects nothing while exiting 0."""
    repo = _repo_with_round(tmp_path)
    _write(repo, ROUND, "# round 1\n\nrewritten\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "rewrite")
    _git(repo, "branch", "-f", "main", "HEAD")
    result = subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1, result.stdout
    assert "was modified" in result.stderr


def test_non_review_files_are_ignored(tmp_path: Path) -> None:
    """This checker owns review history only; other drift is other gates' work."""
    repo = _repo_with_round(tmp_path)
    _write(repo, "openspec/changes/demo/proposal.md", "# proposal\n\nrevised\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "revise proposal")
    assert _check(repo).returncode == 0


# ── the checker must actually be wired, and wired the right way ─────────────


def test_the_history_check_is_an_unconditional_governance_step() -> None:
    """A checker nothing runs enforces nothing.

    The companion test in test_affected_targets.py proves the governance job
    carries no `if:`; this proves the step is IN that job, and that it receives
    an explicit CI base rather than inferring one, matching release history.
    """
    workflow = (REPO_ROOT / ".github" / "workflows" / "checks.yml").read_text()
    assert "check:review-history" in workflow, "the history check is not wired into CI"
    assert "REVIEW_HISTORY_BASE" in workflow, "CI must supply the governed base explicitly"

    governance = workflow.split("  governance:")[1].split("\n  classifier:")[0]
    assert "check:review-history" in governance, "the step is not in the governance job"


def test_the_pre_apply_gate_is_deliberately_not_a_ci_step() -> None:
    """The lifecycle distinction, asserted rather than only documented.

    `openspec-review-gate.mjs verify` refuses repository change after the
    reviewed planning commit. Running it unconditionally would fail every commit
    of an implementation in progress, so CI must test the mechanism instead of
    re-executing the one-time authorization.
    """
    surfaces = {
        "checks.yml": (REPO_ROOT / ".github" / "workflows" / "checks.yml").read_text(),
        "check.sh": (REPO_ROOT / "scripts" / "check.sh").read_text(),
    }
    for surface, text in surfaces.items():
        # Explanatory comments naming the gate are expected and wanted; an
        # executable line invoking it is the defect. Both files must be able to
        # say WHY the gate is absent without that mention failing the test.
        executable = [
            line for line in text.splitlines() if line.strip() and not line.strip().startswith("#")
        ]
        for line in executable:
            assert "openspec-review-gate" not in line, (
                f"{surface} invokes the pre-apply gate at {line.strip()!r}; it would "
                "fail every implementation commit made after a review"
            )
            assert "review:verify" not in line, (
                f"{surface} invokes review:verify at {line.strip()!r}"
            )
