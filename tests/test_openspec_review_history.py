"""Append-only review history, as a repository-history invariant.

`support/reviews/README.md` says historical rounds are append-only. That was a
convention with no mechanism: the pre-apply gate deliberately lets `reviews/**`
change, so nothing anywhere noticed a round being edited or deleted.

Append-only is a TWO-revision property, so these tests build real repositories
with real history and run the real checker. The split mirrors
check-set-releases.mjs versus check-release-history.mjs.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from workflow_model import step_field, step_run, workflow_steps

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "check-openspec-review-history.mjs"
BOUNDARY = REPO_ROOT / ".github" / "workflows" / "review-boundary.yml"

ROUND = "openspec/changes/demo/reviews/001-abc123def456.md"


def _git_out(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(repo),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
        },
    ).stdout.strip()


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        # Matches tests/test_release_history.py: the host's git configuration
        # must not reach the fixture. A system /etc/gitconfig can set
        # init.defaultBranch -- colliding with the `main` these tests create --
        # or commit.gpgsign, which would demand a signing key. PATH is inherited
        # because /usr/bin:/bin holds no git on Homebrew or Nix hosts.
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(repo),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
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


def _archive_transition(repo: Path, epoch: int, body: str) -> str:
    """Perform a REAL archival: current review -> historical round.

    Admission provenance requires the round's bytes to have been the change's
    `preimplementation-review.md` in the parent of the commit that adds them, so
    a test cannot simply author a file under `reviews/` any more -- which is the
    whole point of the rule.
    """
    change = repo / "openspec" / "changes" / "demo"
    current = change / "preimplementation-review.md"
    current.write_text(body)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", f"accepted review epoch {epoch}")

    name = f"{epoch:03d}-abc123def456.md"
    (change / "reviews").mkdir(exist_ok=True)
    (change / "reviews" / name).write_text(body)
    current.unlink()
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", f"archive review epoch {epoch}")
    return f"openspec/changes/demo/reviews/{name}"


def _repo_with_round(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir(parents=True)
    _git(repo, "init", "-q", "-b", "fixture")
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


def test_a_real_archival_transition_is_allowed(tmp_path: Path) -> None:
    """The control: append-only must still permit a genuine archival."""
    repo = _repo_with_round(tmp_path)
    base = _git_out(repo, "rev-parse", "HEAD")
    _archive_transition(repo, 2, "# round 2\n\nthe accepted current review\n")
    result = _check(repo, base=base)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "1 added" in result.stdout


def test_an_authored_historical_round_with_no_transition_is_refused(tmp_path: Path) -> None:
    """The loophole the current-revision gate cannot see.

    A well-formed round can be written directly under reviews/ without ever
    having been the change's current review. Single-revision checks find it
    self-consistent; only the two-revision comparison can tell.
    """
    repo = _repo_with_round(tmp_path)
    base = _git_out(repo, "rev-parse", "HEAD")
    _write(
        repo, "openspec/changes/demo/reviews/002-def456abc789.md", "# authored, never reviewed\n"
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "author a round directly")
    _refused(_check(repo, base=base), "carries no preimplementation-review.md")


def test_a_round_whose_bytes_differ_from_the_archived_review_is_refused(
    tmp_path: Path,
) -> None:
    """Archival copies the current review; it does not rewrite it in passing."""
    repo = _repo_with_round(tmp_path)
    base = _git_out(repo, "rev-parse", "HEAD")
    change = repo / "openspec" / "changes" / "demo"
    (change / "preimplementation-review.md").write_text("# round 2\n\nas accepted\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "accepted review epoch 2")

    (change / "reviews").mkdir(exist_ok=True)
    (change / "reviews" / "002-abc123def456.md").write_text("# round 2\n\nquietly edited\n")
    (change / "preimplementation-review.md").unlink()
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "archive with an edit")
    _refused(_check(repo, base=base), "different document")


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


def test_an_undated_archive_path_is_refused(tmp_path: Path) -> None:
    """The repository convention is archive/YYYY-MM-DD-<change-name>/.

    An undated archive directory is not the archive operation this exception
    exists for, so byte equality alone must not admit it.
    """
    repo = _repo_with_round(tmp_path)
    (repo / "openspec" / "changes" / "archive" / "demo" / "reviews").mkdir(parents=True)
    _git(repo, "mv", ROUND, "openspec/changes/archive/demo/reviews/001-abc123def456.md")
    _git(
        repo,
        "mv",
        "openspec/changes/demo/proposal.md",
        "openspec/changes/archive/demo/proposal.md",
    )
    _git(repo, "commit", "-qm", "archive without a date")
    _refused(_check(repo), "openspec/changes/archive/YYYY-MM-DD-")


def test_an_archive_move_that_also_edits_the_round_is_refused(tmp_path: Path) -> None:
    """Relocation preserves a round; relocation plus an edit does not."""
    repo = _repo_with_round(tmp_path)
    _archive(repo, "demo", "2026-08-26-demo")
    archived = (
        repo
        / "openspec"
        / "changes"
        / "archive"
        / "2026-08-26-demo"
        / "reviews"
        / "001-abc123def456.md"
    )
    archived.write_text("# round 1\n\nedited during archive\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "archive and edit")
    _refused(_check(repo), "modified bytes")


# ── baseline posture, matching check-release-history.mjs ─────────────────────


def test_an_invalid_explicit_base_fails_rather_than_falling_back(tmp_path: Path) -> None:
    repo = _repo_with_round(tmp_path)
    _write(repo, "openspec/changes/demo/proposal.md", "# proposal\n\nrevised\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "an ordinary non-review change")
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


def test_the_local_aggregate_runs_it_without_the_pnpm_workspace() -> None:
    """It is Node-stdlib only, so it must not be contingent on pnpm.

    check.sh gates the workspace checks behind pnpm; a stdlib checker parked
    there would be skipped on a host with no workspace installed -- exactly the
    freshly-provisioned Pi the stdlib section exists for.
    """
    check_sh = (REPO_ROOT / "scripts" / "check.sh").read_text()
    invocation = [
        line
        for line in check_sh.splitlines()
        if "check-openspec-review-history.mjs" in line and not line.strip().startswith("#")
    ]
    assert invocation, "check.sh does not run the review-history checker"
    assert all("pnpm" not in line for line in invocation), (
        f"review history is behind the pnpm gate: {invocation}"
    )
    assert any(line.strip().startswith("run ") for line in invocation)

    # And it must be in the node-guarded block, with an explicit skip.
    node_block = check_sh.split("if command -v node")[1].split("# --- TypeScript")[0]
    assert "check-openspec-review-history.mjs" in node_block
    assert 'skip "openspec review history"' in node_block, (
        "a missing node must be reported as a skip, never a silent pass"
    )


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


# ── a failed comparison must refuse, never read as "nothing changed" ─────────


def test_a_failed_git_comparison_refuses_rather_than_reporting_zero(tmp_path: Path) -> None:
    """`git(...) ?? ''` was fail-open.

    The helper returns undefined for ANY subprocess failure, so a comparison
    that could not be established was indistinguishable from one that found no
    changed review files. The base resolves fine here; it is the authoritative
    diff itself that fails, which is the case the old code turned into success.

    The fixture ALSO contains a real violation, so a checker that silently
    compared nothing would exit 0 and be caught by this test twice over.
    """
    repo = _repo_with_round(tmp_path)
    _write(repo, ROUND, "# round 1\n\nrewritten\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "rewrite")

    result = subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo), "--base", "HEAD~1"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "REVIEW_HISTORY_MAX_BUFFER": "1"},
    )
    assert result.returncode == 1, result.stdout
    assert "could not be established" in result.stderr
    assert "NOTHING was compared" in result.stderr


# ── CLI hardening, ported from the review gate ──────────────────────────────


@pytest.mark.parametrize(
    ("args", "fragment"),
    [
        (["--base"], "requires a value"),
        (["--root"], "requires a value"),
        (["--base", "--root", "x"], "requires a value"),
        (["--nope", "x"], 'unknown option "--nope"'),
        (["--base", "HEAD~1", "--base", "HEAD~1"], "was supplied twice"),
    ],
)
def test_malformed_invocation_is_refused(tmp_path: Path, args: list[str], fragment: str) -> None:
    repo = _repo_with_round(tmp_path)
    result = subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo), *args]
        if "--root" not in args
        else ["node", str(SCRIPT), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1, result.stdout
    assert fragment in result.stderr, result.stderr


def test_invocation_through_a_symlink_still_runs_the_checker(tmp_path: Path) -> None:
    """Comparing process.argv[1] raw would exit 0 having run nothing.

    A silent no-op that reads as PASS is the worst failure mode a gate has.
    """
    repo = _repo_with_round(tmp_path)
    _write(repo, ROUND, "# round 1\n\nrewritten\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "rewrite")

    link = tmp_path / "review-history-link.mjs"
    link.symlink_to(SCRIPT)
    result = subprocess.run(
        ["node", str(link), "--root", str(repo), "--base", "HEAD~1"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1, f"the symlinked invocation ran nothing:\n{result.stdout}"
    assert "was modified" in result.stderr


# ── archive provenance, not only archive bytes ──────────────────────────────


def _archive(repo: Path, change: str, dated: str) -> None:
    (repo / "openspec" / "changes" / "archive" / dated / "reviews").mkdir(parents=True)
    for relative in ("reviews/001-abc123def456.md", "proposal.md"):
        source = f"openspec/changes/{change}/{relative}"
        target = f"openspec/changes/archive/{dated}/{relative}"
        _git(repo, "mv", source, target)


def test_a_real_dated_whole_change_archive_passes(tmp_path: Path) -> None:
    """Ordinary archiving must keep working; this is the control."""
    repo = _repo_with_round(tmp_path)
    _archive(repo, "demo", "2026-08-26-demo")
    _git(repo, "commit", "-qm", "archive demo")
    result = _check(repo)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "1 archived" in result.stdout


def test_a_review_only_move_while_the_change_stays_live_is_refused(tmp_path: Path) -> None:
    """Byte equality alone accepted this: the change is still active."""
    repo = _repo_with_round(tmp_path)
    (repo / "openspec" / "changes" / "archive" / "2026-08-26-demo" / "reviews").mkdir(parents=True)
    _git(
        repo,
        "mv",
        ROUND,
        "openspec/changes/archive/2026-08-26-demo/reviews/001-abc123def456.md",
    )
    _git(repo, "commit", "-qm", "move only the review")
    _refused(_check(repo), "still live")


def test_a_review_moved_under_another_changes_archive_identity_is_refused(
    tmp_path: Path,
) -> None:
    repo = _repo_with_round(tmp_path)
    (repo / "openspec" / "changes" / "archive" / "2026-08-26-other" / "reviews").mkdir(parents=True)
    _git(
        repo,
        "mv",
        ROUND,
        "openspec/changes/archive/2026-08-26-other/reviews/001-abc123def456.md",
    )
    _git(
        repo,
        "mv",
        "openspec/changes/demo/proposal.md",
        "openspec/changes/archive/2026-08-26-other/proposal.md",
    )
    _git(repo, "commit", "-qm", "archive under the wrong identity")
    _refused(_check(repo), "another change")


def test_a_new_round_first_appearing_inside_an_archived_change_is_refused(
    tmp_path: Path,
) -> None:
    """An archived change is a closed record.

    Adding a round directly under archive/ would let history grow where nobody
    is reviewing it. Rounds are added to the live change, then archived with it.
    """
    repo = _repo_with_round(tmp_path)
    _archive(repo, "demo", "2026-08-26-demo")
    _git(repo, "commit", "-qm", "archive demo")
    _write(
        repo,
        "openspec/changes/archive/2026-08-26-demo/reviews/002-late.md",
        "# a round nobody reviewed\n",
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "sneak a round into the archive")
    _refused(_check(repo, base="HEAD~1"), "first appears inside an archived change")


def test_an_added_archived_review_copy_while_the_change_stays_live_is_refused(
    tmp_path: Path,
) -> None:
    """The added-path loophole.

    A detected rename and an unpaired delete both went through the full
    whole-change provenance check. An ADDED archived review took a weaker path:
    byte equality with the live copy was enough, so a COPY could appear under
    archive/ while the live change stayed active and its own review remained.
    """
    repo = _repo_with_round(tmp_path)
    copied = repo / "openspec" / "changes" / "archive" / "2026-08-30-demo" / "reviews"
    copied.mkdir(parents=True)
    (copied / "001-abc123def456.md").write_text(
        (repo / ROUND).read_text()  # byte-identical, but nothing was archived
    )
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "copy the round into an archive path")
    _refused(_check(repo), "still live")


# ── the trusted one-time review boundary ────────────────────────────────────


def test_the_review_boundary_workflow_takes_its_base_from_github() -> None:
    """`--base-sha` is only as trustworthy as its provenance.

    The script cannot tell an authoritative SHA from a stale local one an agent
    typed. This workflow is what supplies the provenance, so its shape is part
    of the guarantee rather than incidental.
    """
    workflow = BOUNDARY.read_text()

    # Manually triggered: workflow_dispatch also means the DEFINITION comes from
    # the default branch, so a pull request cannot rewrite the check that
    # authorizes it.
    assert "workflow_dispatch:" in workflow
    assert "pull_request:" not in workflow, (
        "a pull_request trigger would run this continuously and from PR code"
    )

    # The SHAs come from the API, not from the caller.
    assert "gh api" in workflow
    assert ".base.sha" in workflow and ".head.sha" in workflow

    # The gate receives that SHA as both base and freshness proof.
    assert "--base-sha" in workflow
    assert "steps.pr.outputs.base" in workflow

    # Least privilege.
    assert "contents: read" in workflow
    assert "pull-requests: read" in workflow
    assert "write" not in workflow.split("permissions:")[1].split("concurrency:")[0]

    # And the movement re-read that closes the window during the run.
    tail = workflow.split("Re-read the pull request", 1)[1]
    assert "head moved during the boundary run" in tail
    assert "base moved during the boundary run" in tail


def test_the_boundary_workflow_never_checks_out_pull_request_code() -> None:
    """CodeQL flagged this, and the authorization consequence is worse than the
    alert title.

    An earlier revision checked out the pull request and ran `pnpm install` and
    `pnpm run review:verify` inside it, so the lockfile's lifecycle scripts, the
    resolved binaries, and `scripts/openspec-review-gate.mjs` ITSELF came from
    the branch being authorized -- which could have replaced the gate with
    `process.exit(0)`.

    Moving the tooling to a second checkout was not enough: CodeQL still flags
    execution that follows untrusted code landing in the workspace, and it is
    right to. The answer is that the pull request is never a working tree at
    all -- it is fetched as objects and the gate reads them from git.
    """
    workflow = BOUNDARY.read_text()
    steps = workflow_steps(workflow, "boundary")
    assert len(steps) >= 8, f"the step extraction is vacuous: {len(steps)} steps"

    checkouts = [step for step in steps if "actions/checkout" in step]
    assert len(checkouts) == 1, (
        f"exactly one checkout, of the default branch; found {len(checkouts)}"
    )
    assert step_field(checkouts[0], "ref") == "${{ github.event.repository.default_branch }}", (
        "the only working tree must be the default branch"
    )
    assert step_field(checkouts[0], "persist-credentials") == "false"

    # The pull request reaches the runner only as git objects.
    fetches = [step for step in steps if "git fetch" in step_run(step)]
    assert fetches, "the pull request must be fetched as objects"
    for step in fetches:
        run = step_run(step)
        assert "refs/boundary/head" in run
        assert "checkout" not in run, "fetching must not be followed by a checkout"

    # Nothing anywhere may check out or merge the pull request's ref.
    for step in steps:
        run = step_run(step)
        for forbidden in ("git checkout refs/boundary", "git switch", "git merge"):
            assert forbidden not in run, f"{forbidden!r} materialises the pull request"

    # The gate is invoked against the ref, from the default branch's own copy.
    # Steps that INVOKE it, not steps that merely name it -- the bootstrap
    # guard legitimately checks for the file by path.
    gate_steps = [s for s in steps if "node scripts/openspec-review-gate.mjs" in step_run(s)]
    assert len(gate_steps) == 1, f"expected one gate invocation, found {len(gate_steps)}"
    gate_run = step_run(gate_steps[0])
    assert "--ref refs/boundary/head" in gate_run
    assert "pnpm run" not in gate_run and "pnpm exec" not in gate_run

    # A dependency cache populated in this context is restorable by later
    # default-branch runs -- the poisoning path CodeQL named. Asserted on step
    # INPUTS, not on the file text: a comment explaining why caching is absent
    # would otherwise fail this, which is the same comment-versus-code mistake
    # this suite has already made once.
    for step in steps:
        assert step_field(step, "cache") is None, f"a step enables caching:\n{step}"
        assert step_field(step, "cache-dependency-path") is None


def test_the_boundary_workflow_refuses_when_the_default_branch_has_no_gate() -> None:
    """Bootstrap honesty: before v2 lands on main there is no trusted gate.

    Falling back to the pull request's copy is exactly the defect above, so the
    workflow must refuse instead.
    """
    workflow = BOUNDARY.read_text()
    assert "scripts/openspec-review-gate.mjs is missing on the default branch" in workflow
    assert "A boundary cannot be established with tooling taken from the pull request" in workflow


def test_the_boundary_workflow_is_not_a_continuous_check() -> None:
    """It executes the one-time authorization; it must not be a gate on pushes."""
    workflow = BOUNDARY.read_text()
    triggers = workflow.split("on:", 1)[1].split("permissions:", 1)[0]
    for continuous in ("push:", "pull_request:", "schedule:"):
        assert continuous not in triggers, f"{continuous} would make the boundary continuous"
