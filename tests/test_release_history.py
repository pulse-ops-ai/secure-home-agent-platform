"""ADR-0019 release history — the two-revision properties.

Every claim ADR-0019 makes about a release is a claim about two revisions:
`(familyId, version)` resolves to one digest *forever*, state moves only
`Released -> Deprecated -> Retired`, and a new release pins modules that passed
the section 6 preconditions. A checker that reads one revision cannot see a
record deleted, a digest swapped under a reused version, or a state jumped.

These tests build real git repositories with real history and run the real
script, because a fixture that mocked git would prove only that the mock works.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "check-release-history.mjs"


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        env={
            "PATH": "/usr/bin:/bin",
            "HOME": str(repo),
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@e",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@e",
        },
    )


def _registry(releases: list[dict[str, Any]]) -> str:
    return json.dumps({"version": 1, "releases": releases}, indent=2) + "\n"


def _record(
    family: str = "prepr-review-default",
    version: str = "1.0.0",
    digest: str = "sha256:" + "a" * 64,
    state: str = "Released",
) -> dict[str, Any]:
    return {
        "familyId": family,
        "version": version,
        "manifestPath": f"knowledge/releases/{family}@{version}.manifest",
        "releaseDigest": digest,
        "releaseReview": {
            "policy": "knowledge-set-release-review-v1",
            "by": "human:mikegtech",
            "at": "2026-08-22T15:48:52Z",
            "releaseDigest": digest,
        },
        "state": state,
    }


def _repo_with_history(
    tmp_path: Path, before: list[dict[str, Any]], after: list[dict[str, Any]]
) -> Path:
    """A real repository whose HEAD~1 holds ``before`` and HEAD holds ``after``."""
    repo = tmp_path / "repo"
    (repo / "knowledge").mkdir(parents=True)
    # The real catalog, so section 6 preconditions run against real module state.
    shutil.copy(REPO_ROOT / "knowledge" / "catalog.json", repo / "knowledge" / "catalog.json")

    (repo / "knowledge" / "set-releases.json").write_text(_registry(before))
    _git(repo, "init", "-q")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "before")

    (repo / "knowledge" / "set-releases.json").write_text(_registry(after))
    _git(repo, "add", "-A")
    # --allow-empty: a record CARRIED unchanged is a real and important case, and
    # git would otherwise refuse to create the second revision at all.
    _git(repo, "commit", "-q", "--allow-empty", "-m", "after")
    return repo


def _check(repo: Path, base: str = "HEAD~1") -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo), "--base", base],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


# ── the live repository ───────────────────────────────────────────────────────


def test_the_live_repository_passes_its_own_history_gate() -> None:
    """The control. A gate that failed on the real tree would prove nothing."""
    result = subprocess.run(
        ["node", str(SCRIPT)], cwd=REPO_ROOT, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "carried" in result.stdout


# ── P2: a released identity is permanent ─────────────────────────────────────


def test_a_carried_release_passes(tmp_path: Path) -> None:
    """Control for the immutability cases below."""
    record = _record()
    result = _check(_repo_with_history(tmp_path, [record], [record]))
    assert result.returncode == 0, result.stdout + result.stderr


def test_deleting_a_release_record_is_refused(tmp_path: Path) -> None:
    result = _check(_repo_with_history(tmp_path, [_record()], []))
    assert result.returncode == 1
    assert "is gone" in result.stderr


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("releaseDigest", {"releaseDigest": "sha256:" + "b" * 64}),
        ("manifestPath", {"manifestPath": "knowledge/releases/other@1.0.0.manifest"}),
    ],
)
def test_re_identifying_a_used_version_is_refused(
    tmp_path: Path, label: str, mutate: dict[str, Any]
) -> None:
    """The exact hole: same (familyId, version), different bytes."""
    before = _record()
    after = {**_record(), **mutate}
    result = _check(_repo_with_history(tmp_path, [before], [after]))
    assert result.returncode == 1, result.stdout
    assert label in result.stderr
    assert "immutable" in result.stderr


def test_rewriting_the_review_binding_is_refused(tmp_path: Path) -> None:
    """A review is evidence about specific bytes; re-pointing it forges it."""
    before = _record()
    after = json.loads(json.dumps(before))
    after["releaseReview"]["by"] = "human:someone-else"
    result = _check(_repo_with_history(tmp_path, [before], [after]))
    assert result.returncode == 1
    assert "by changed" in result.stderr


# ── P2: lifecycle transitions on live edits ──────────────────────────────────


@pytest.mark.parametrize(
    ("before_state", "after_state", "allowed"),
    [
        ("Released", "Released", True),
        ("Released", "Deprecated", True),
        ("Deprecated", "Retired", True),
        ("Released", "Retired", False),
        ("Deprecated", "Released", False),
        ("Retired", "Deprecated", False),
        ("Retired", "Released", False),
    ],
)
def test_only_the_governed_transition_order_is_accepted(
    tmp_path: Path, before_state: str, after_state: str, allowed: bool
) -> None:
    result = _check(
        _repo_with_history(tmp_path, [_record(state=before_state)], [_record(state=after_state)])
    )
    assert (result.returncode == 0) is allowed, (
        f"{before_state} -> {after_state}: {result.stdout}{result.stderr}"
    )
    if not allowed:
        assert "not a governed transition" in result.stderr


# ── P2: a NEW release must satisfy the section 6 preconditions ───────────────


def test_a_new_release_pinning_blocked_modules_is_refused(tmp_path: Path) -> None:
    """A correct digest is not a licence to pin a module that cannot compose.

    household/** is rollout-blocked and unauthored, so no household release can
    be created -- and a hand-written record claiming one must not slip through
    just because its own hash is internally consistent.
    """
    new = _record(family="climate-default")
    result = _check(_repo_with_history(tmp_path, [], [new]))
    assert result.returncode == 1
    assert "new release" in result.stderr
    # Reported with the package's own member-precondition rules.
    assert "release.member-" in result.stderr


def test_a_new_release_whose_digest_is_not_derivable_is_refused(tmp_path: Path) -> None:
    """The family composes fine; the claimed digest is simply not what it yields."""
    new = _record(family="architecture-default", version="2.0.0")
    result = _check(_repo_with_history(tmp_path, [], [new]))
    assert result.returncode == 1
    assert "must be derivable from the catalog it pins" in result.stderr


def test_a_historical_release_is_never_re_derived(tmp_path: Path) -> None:
    """The family/release split, load-bearing.

    A carried release pins an older revision of a MUTABLE family. Re-deriving it
    from today's catalog would fail exactly when the mechanism is working, so
    carried records are checked for identity only. This asserts the asymmetry:
    the same record that is refused as NEW is accepted as CARRIED.
    """
    record = _record(family="architecture-default", version="2.0.0")
    as_new = _check(_repo_with_history(tmp_path / "a", [], [record]))
    assert as_new.returncode == 1, "the fixture must be refused as new, or it proves nothing"

    as_carried = _check(_repo_with_history(tmp_path / "b", [record], [record]))
    assert as_carried.returncode == 0, as_carried.stdout + as_carried.stderr


# ── the comparison must never silently compare nothing ───────────────────────


def test_an_unresolvable_base_fails_rather_than_skipping(tmp_path: Path) -> None:
    """A check that quietly compared nothing would read as 'no violations'."""
    repo = tmp_path / "solo"
    (repo / "knowledge").mkdir(parents=True)
    shutil.copy(REPO_ROOT / "knowledge" / "catalog.json", repo / "knowledge" / "catalog.json")
    (repo / "knowledge" / "set-releases.json").write_text(_registry([]))
    _git(repo, "init", "-q")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "only")

    result = _check(repo, base="does-not-exist")
    assert result.returncode == 1
    assert "no prior governed revision" in result.stderr
    assert "fails rather" in result.stderr


# ── an authoritative baseline is exclusive, never merely preferred ───────────
#
# These three cases were false negatives: the gate reported success while
# comparing against a revision nobody asked for, or against itself.


def test_an_invalid_explicit_base_fails_even_when_a_fallback_exists(tmp_path: Path) -> None:
    """The blocker.

    The earlier resolver ranked --base alongside its own inferences, so an
    unresolvable explicit base fell through to HEAD~1 and the run compared a
    DIFFERENT revision while exiting 0. The old regression missed it because its
    fixture had no usable fallback, so the bad ref failed for the wrong reason.

    Here HEAD~1 exists AND would pass. Only exclusivity can refuse this.
    """
    record = _record()
    repo = _repo_with_history(tmp_path, [record], [record])
    assert _check(repo, base="HEAD~1").returncode == 0, "the fallback must be usable"

    result = _check(repo, base="does-not-exist")
    assert result.returncode == 1, (
        "an unresolvable explicit base fell back to another revision: " + result.stdout
    )
    assert "is not a commit" in result.stderr
    assert "never falls back to a different revision" in result.stderr


def test_an_invalid_env_base_fails_even_when_a_fallback_exists(tmp_path: Path) -> None:
    """RELEASE_HISTORY_BASE is how CI speaks; it is authoritative the same way."""
    record = _record()
    repo = _repo_with_history(tmp_path, [record], [record])
    result = subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "RELEASE_HISTORY_BASE": "does-not-exist"},
    )
    assert result.returncode == 1, result.stdout
    assert "RELEASE_HISTORY_BASE" in result.stderr


def test_an_empty_env_base_means_no_baseline_was_supplied(tmp_path: Path) -> None:
    """CI sets it to '' for workflow_dispatch and first pushes.

    Empty must mean "I have nothing to give, infer" rather than "compare against
    the empty ref", which would fail every dispatch run for no reason.
    """
    record = _record()
    repo = _repo_with_history(tmp_path, [record], [record])
    result = subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "RELEASE_HISTORY_BASE": ""},
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_an_inferred_baseline_is_never_head_itself(tmp_path: Path) -> None:
    """On main, merge-base HEAD main is HEAD — and comparing HEAD with HEAD
    detects nothing while exiting 0.

    The fixture deletes a release, which is the single most important thing this
    gate catches. If inference lands on HEAD, that deletion passes.
    """
    repo = _repo_with_history(tmp_path, [_record()], [])
    _git(repo, "branch", "-f", "main", "HEAD")
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=True
    ).stdout.strip()
    merge_base = subprocess.run(
        ["git", "merge-base", "HEAD", "main"],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert merge_base == head, "the fixture must actually reproduce the vacuous case"

    result = subprocess.run(
        ["node", str(SCRIPT), "--root", str(repo)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1, "the check compared the registry with itself: " + result.stdout
    assert "is gone" in result.stderr


# ── a lifecycle has a beginning ──────────────────────────────────────────────


@pytest.mark.parametrize("state", ["Deprecated", "Retired"])
def test_a_new_release_may_not_be_created_already_past_released(tmp_path: Path, state: str) -> None:
    """The transition check only runs where a PRIOR state exists, so creation is
    a hole it structurally cannot cover.

    The one-revision registry checker does not save this either: it validates
    only that `state` is in the vocabulary.
    """
    new = _record(family="architecture-default", version="2.0.0", state=state)
    result = _check(_repo_with_history(tmp_path, [], [new]))
    assert result.returncode == 1
    assert "must start at Released" in result.stderr


def test_a_new_release_created_at_released_is_accepted(tmp_path: Path) -> None:
    """The control: the state rule must not be what refuses every new release.

    A real derivable release, so the only thing under test is the state.
    """
    registry = json.loads((REPO_ROOT / "knowledge" / "set-releases.json").read_text())
    real = next(r for r in registry["releases"] if r["familyId"] == "architecture-default")
    result = _check(_repo_with_history(tmp_path, [], [real]))
    assert result.returncode == 0, result.stdout + result.stderr
