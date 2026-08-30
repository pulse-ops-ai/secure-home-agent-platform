"""Composed-tree PR merge planning and TOCTOU freshness (P1-2).

Governed image identity for a pull request must be proven against
merge(live target-branch tip, PR head) — not the isolated head and not the
historical ``pull_request.base.sha``. These tests drive the real
``scripts/pr-merge-plan.mjs`` against local Git remotes so the merge
composition, base-incorporation freshness of the previous-head fast path, and
the end-of-run TOCTOU check are proven behaviourally rather than asserted from
comments. Mutations B, C, and D from the correction brief are the cases below.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE = REPO_ROOT / "scripts" / "pr-merge-plan.mjs"


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"git {' '.join(args)}\n{result.stdout}{result.stderr}"
    return result.stdout.strip()


def _identity(repo: Path) -> None:
    _git(repo, "config", "user.email", "merge-plan@example.invalid")
    _git(repo, "config", "user.name", "Merge Plan Tests")


@dataclass
class Remote:
    origin: Path
    seed: Path
    work: Path
    base_sha: str
    h1: str
    h2: str


def _seed_commit(seed: Path, path: str, content: str, message: str) -> str:
    (seed / path).write_text(content)
    _git(seed, "add", "-A")
    _git(seed, "commit", "-qm", message)
    return _git(seed, "rev-parse", "HEAD")


@pytest.fixture
def remote(tmp_path: Path) -> Remote:
    """A bare origin with a ``main`` base branch and a two-commit PR branch.

    ``refs/pull/1/head`` tracks the PR head so the module's TOCTOU re-resolution
    behaves as it does on GitHub.
    """
    origin = tmp_path / "origin.git"
    _git(tmp_path, "init", "-q", "--bare", str(origin))

    seed = tmp_path / "seed"
    _git(tmp_path, "init", "-q", str(seed))
    _identity(seed)
    base_sha = _seed_commit(seed, "f.txt", "base\n", "B")
    _git(seed, "branch", "-M", "main")
    _git(seed, "remote", "add", "origin", str(origin))
    _git(seed, "push", "-q", "origin", "main")

    _git(seed, "checkout", "-q", "-b", "pr")
    h1 = _seed_commit(seed, "g.txt", "h1\n", "H1")
    _git(seed, "push", "-q", "origin", "pr")
    _git(seed, "push", "-q", "origin", "HEAD:refs/pull/1/head")
    h2 = _seed_commit(seed, "g.txt", "h1\nh2\n", "H2")
    _git(seed, "push", "-q", "--force", "origin", "pr")
    _git(seed, "push", "-q", "--force", "origin", "HEAD:refs/pull/1/head")

    work = tmp_path / "work"
    _git(tmp_path, "clone", "-q", str(origin), str(work))
    _identity(work)
    _git(work, "fetch", "-q", "origin", "refs/heads/pr:refs/remotes/origin/pr")
    _git(work, "checkout", "-q", "--detach", h2)
    return Remote(origin=origin, seed=seed, work=work, base_sha=base_sha, h1=h1, h2=h2)


def _advance_base(remote: Remote, content: str = "base2\n", message: str = "B2") -> str:
    _git(remote.seed, "checkout", "-q", "main")
    (remote.seed / "f.txt").write_text(content)
    _git(remote.seed, "add", "-A")
    _git(remote.seed, "commit", "-qm", message)
    _git(remote.seed, "push", "-q", "origin", "main")
    return _git(remote.seed, "rev-parse", "HEAD")


def _plan(
    remote: Remote,
    *,
    pr_head: str,
    previous: str = "",
    action: str = "synchronize",
    proven: bool = False,
    base_ref: str = "main",
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "node",
            str(MODULE),
            "plan",
            "--root",
            str(remote.work),
            "--remote",
            "origin",
            "--base-ref",
            base_ref,
            "--pr-head",
            pr_head,
            "--previous",
            previous,
            "--action",
            action,
            "--previous-proven",
            "true" if proven else "false",
            "--json",
        ],
        cwd=remote.work,
        capture_output=True,
        text=True,
        check=False,
    )


def _plan_json(result: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    assert result.returncode == 0, result.stdout + result.stderr
    return cast(dict[str, Any], json.loads(result.stdout))


def _verify(
    remote: Remote,
    *,
    expected_live_base: str,
    expected_pr_head: str,
    pr_number: str = "1",
    base_ref: str = "main",
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "node",
            str(MODULE),
            "verify",
            "--root",
            str(remote.work),
            "--remote",
            "origin",
            "--base-ref",
            base_ref,
            "--pr-number",
            pr_number,
            "--expected-live-base",
            expected_live_base,
            "--expected-pr-head",
            expected_pr_head,
        ],
        cwd=remote.work,
        capture_output=True,
        text=True,
        check=False,
    )


# ── merge composition --------------------------------------------------------


def test_plan_composes_live_base_and_head(remote: Remote) -> None:
    plan = _plan_json(_plan(remote, pr_head=remote.h2))
    assert plan["liveBase"] == remote.base_sha
    assert plan["prHead"] == remote.h2
    assert plan["mode"] == "full"
    assert plan["comparisonBase"] == remote.base_sha
    parents = _git(remote.work, "rev-list", "--parents", "-n", "1", plan["mergeSha"]).split()
    assert parents[1:] == [remote.base_sha, remote.h2]


def test_plan_composes_without_ambient_git_identity(remote: Remote, tmp_path: Path) -> None:
    """A CI runner configures no committer identity; the module must supply its
    own or ``git commit-tree`` fails. This reproduces the hosted condition:
    the work repo has no local user.* and the environment has no global/system
    config and no GIT_*_NAME/EMAIL."""
    _git(remote.work, "config", "--unset", "user.email")
    _git(remote.work, "config", "--unset", "user.name")
    empty_home = tmp_path / "empty-home"
    empty_home.mkdir()
    env = os.environ.copy()
    for var in (
        "GIT_AUTHOR_NAME",
        "GIT_AUTHOR_EMAIL",
        "GIT_COMMITTER_NAME",
        "GIT_COMMITTER_EMAIL",
    ):
        env.pop(var, None)
    env["HOME"] = str(empty_home)
    env["GIT_CONFIG_GLOBAL"] = str(empty_home / "no-such-config")
    env["GIT_CONFIG_SYSTEM"] = str(empty_home / "no-such-config")
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    result = subprocess.run(
        [
            "node",
            str(MODULE),
            "plan",
            "--root",
            str(remote.work),
            "--remote",
            "origin",
            "--base-ref",
            "main",
            "--pr-head",
            remote.h2,
            "--action",
            "synchronize",
            "--previous-proven",
            "false",
            "--json",
        ],
        cwd=remote.work,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    plan = cast(dict[str, Any], json.loads(result.stdout))
    # The ephemeral merge commit exists and composes both parents.
    parents = _git(remote.work, "rev-list", "--parents", "-n", "1", plan["mergeSha"]).split()
    assert parents[1:] == [remote.base_sha, remote.h2]


def test_merge_tree_includes_advanced_base_and_pr_changes(remote: Remote) -> None:
    """MUTATION B: the proof must describe merge(B2, H), not H alone or B+H."""
    b2 = _advance_base(remote)
    plan = _plan_json(_plan(remote, pr_head=remote.h2))
    assert plan["liveBase"] == b2
    merge = plan["mergeSha"]
    assert _git(remote.work, "show", f"{merge}:f.txt") == "base2"
    assert _git(remote.work, "show", f"{merge}:g.txt") == "h1\nh2"
    head_tree = _git(remote.work, "rev-parse", f"{remote.h2}^{{tree}}")
    merge_tree = _git(remote.work, "rev-parse", f"{merge}^{{tree}}")
    assert merge_tree != head_tree


def test_merge_conflict_fails_closed(remote: Remote) -> None:
    _advance_base(remote, content="base-side\n", message="B2")
    _git(remote.seed, "checkout", "-q", "pr")
    (remote.seed / "f.txt").write_text("pr-side\n")
    _git(remote.seed, "add", "-A")
    _git(remote.seed, "commit", "-qm", "Hc")
    conflict_head = _git(remote.seed, "rev-parse", "HEAD")
    _git(remote.seed, "push", "-q", "--force", "origin", "pr")
    _git(remote.work, "fetch", "-q", "--force", "origin", "refs/heads/pr:refs/remotes/origin/pr")
    result = _plan(remote, pr_head=conflict_head)
    assert result.returncode != 0
    assert "conflict" in result.stderr.lower()


def test_unresolvable_base_ref_fails_closed(remote: Remote) -> None:
    result = _plan(remote, pr_head=remote.h2, base_ref="no-such-branch")
    assert result.returncode != 0
    assert "live base" in result.stderr.lower() or "fetch" in result.stderr.lower()


# ── previous-head induction, bound to base freshness -------------------------


def test_incremental_reused_when_base_incorporated(remote: Remote) -> None:
    plan = _plan_json(_plan(remote, pr_head=remote.h2, previous=remote.h1, proven=True))
    assert plan["mode"] == "incremental"
    assert plan["comparisonBase"] == remote.h1


def test_previous_head_not_reused_when_unproven(remote: Remote) -> None:
    plan = _plan_json(_plan(remote, pr_head=remote.h2, previous=remote.h1, proven=False))
    assert plan["mode"] == "full"
    assert plan["comparisonBase"] == remote.base_sha


def test_previous_head_not_reused_when_base_advances(remote: Remote) -> None:
    """MUTATION C: an advanced live base invalidates the previous-head fast path."""
    b2 = _advance_base(remote)
    plan = _plan_json(_plan(remote, pr_head=remote.h2, previous=remote.h1, proven=True))
    assert plan["mode"] == "full"
    assert plan["comparisonBase"] == b2
    assert plan["comparisonBase"] != remote.h1
    assert "advanced beyond it" in plan["note"]


def test_previous_head_not_reused_on_force_push(remote: Remote) -> None:
    _git(remote.seed, "checkout", "-q", "pr")
    _git(remote.seed, "reset", "-q", "--hard", remote.base_sha)
    (remote.seed / "g.txt").write_text("rewritten\n")
    _git(remote.seed, "add", "-A")
    _git(remote.seed, "commit", "-qm", "H2-forced")
    forced = _git(remote.seed, "rev-parse", "HEAD")
    _git(remote.seed, "push", "-q", "--force", "origin", "pr")
    _git(remote.work, "fetch", "-q", "--force", "origin", "refs/heads/pr:refs/remotes/origin/pr")
    plan = _plan_json(_plan(remote, pr_head=forced, previous=remote.h1, proven=True))
    assert plan["mode"] == "full"
    assert plan["comparisonBase"] == remote.base_sha


def test_opened_action_never_uses_incremental(remote: Remote) -> None:
    result = _plan(remote, pr_head=remote.h2, previous=remote.h1, proven=True, action="opened")
    plan = _plan_json(result)
    assert plan["mode"] == "full"


# ── TOCTOU (mutation D) ------------------------------------------------------


def test_verify_passes_when_identities_are_unchanged(remote: Remote) -> None:
    result = _verify(remote, expected_live_base=remote.base_sha, expected_pr_head=remote.h2)
    assert result.returncode == 0, result.stdout + result.stderr


def test_verify_fails_when_live_base_moves(remote: Remote) -> None:
    """MUTATION D: a live base that moves during the proof refuses the run."""
    _advance_base(remote)
    result = _verify(remote, expected_live_base=remote.base_sha, expected_pr_head=remote.h2)
    assert result.returncode != 0
    assert "live base" in result.stderr.lower()


def test_verify_fails_when_pr_head_moves(remote: Remote) -> None:
    _git(remote.seed, "checkout", "-q", "pr")
    (remote.seed / "g.txt").write_text("h1\nh2\nh3\n")
    _git(remote.seed, "add", "-A")
    _git(remote.seed, "commit", "-qm", "H3")
    _git(remote.seed, "push", "-q", "--force", "origin", "pr")
    _git(remote.seed, "push", "-q", "--force", "origin", "HEAD:refs/pull/1/head")
    result = _verify(remote, expected_live_base=remote.base_sha, expected_pr_head=remote.h2)
    assert result.returncode != 0
    assert "pr head" in result.stderr.lower()


def test_verify_fails_when_pull_ref_is_absent(remote: Remote) -> None:
    result = _verify(
        remote,
        expected_live_base=remote.base_sha,
        expected_pr_head=remote.h2,
        pr_number="999",
    )
    assert result.returncode != 0
