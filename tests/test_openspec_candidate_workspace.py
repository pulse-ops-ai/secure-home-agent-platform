"""The trusted boundary's candidate validation workspace.

The boundary must prove two separate things, and the conformance suite only
covers the first:

    is the v2 schema/tooling correct?          tests/test_openspec_cli_conformance.py
    is THIS EXACT CANDIDATE a valid change?    here, and in review-boundary.yml

The second needs `openspec validate <change> --strict` against the candidate --
which must never be checked out, because a privileged runner that materialises a
pull request's working tree can be made to execute it.

So the candidate is read from git OBJECTS into an isolated tree whose schema and
config come from the TRUSTED context. These tests drive the real script and the
real pinned OpenSpec CLI against real git repositories.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "openspec-candidate-workspace.mjs"
OPENSPEC_BIN = REPO_ROOT / "node_modules" / ".bin" / "openspec"
SCHEMA = "governed-spec-driven-v2"


def _git(repo: Path, *args: str) -> str:
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
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@e",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@e",
        },
    ).stdout


def _trusted(tmp_path: Path) -> Path:
    """A default-branch-shaped trusted context: config and schemas, no changes."""
    trusted = tmp_path / "trusted"
    (trusted / "openspec").mkdir(parents=True)
    shutil.copy(REPO_ROOT / "openspec" / "config.yaml", trusted / "openspec" / "config.yaml")
    shutil.copytree(REPO_ROOT / "openspec" / "schemas", trusted / "openspec" / "schemas")
    (trusted / "openspec" / "specs").mkdir()
    return trusted


def _candidate_repo(tmp_path: Path, *, change: str = "candidate-change") -> Path:
    """A repository whose HEAD carries a valid v2 change."""
    repo = tmp_path / "candidate"
    root = repo / "openspec" / "changes" / change
    (root / "specs" / "probe-capability").mkdir(parents=True)
    (root / ".openspec.yaml").write_text(f"schema: {SCHEMA}\n")
    (root / "proposal.md").write_text(
        "# Proposal\n\n## Why\n\nProbe the boundary.\n\n## What Changes\n\n- probe\n"
    )
    (root / "specs" / "probe-capability" / "spec.md").write_text(
        "# probe-capability\n\n"
        "## ADDED Requirements\n\n"
        "### Requirement: The candidate SHALL be validated\n\n"
        "The candidate SHALL be understood by the trusted parser.\n\n"
        "#### Scenario: the parser reads it\n\n"
        "- **WHEN** validation runs\n"
        "- **THEN** the change is valid\n"
    )
    (root / "design.md").write_text("# Design\n\nProbe design.\n")
    (root / "assurance.md").write_text("# Assurance\n\nProbe assurance.\n")
    (root / "tasks.md").write_text(
        "# Tasks\n\n## 1. Probe\n\n<!-- review-scope: probe -->\n\n- [ ] 1.1 probe\n"
    )
    _git(repo, "init", "-q", "-b", "fixture")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "candidate planning")
    return repo


def _materialize(
    repo: Path, trusted: Path, out: Path, *, change: str = "candidate-change", ref: str = "HEAD"
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "node",
            str(SCRIPT),
            "--repo",
            str(repo),
            "--trusted",
            str(trusted),
            "--ref",
            ref,
            "--change",
            change,
            "--out",
            str(out),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def _validate(out: Path, change: str = "candidate-change") -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(OPENSPEC_BIN), "validate", change, "--strict"],
        cwd=out,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "OPENSPEC_TELEMETRY": "0", "NO_COLOR": "1"},
    )


def _refusal(result: subprocess.CompletedProcess[str]) -> str:
    assert result.returncode != 0, f"expected refusal, got:\n{result.stdout}"
    match = re.search(r"candidate workspace \[([A-Z_]+)\]", result.stderr)
    assert match is not None, result.stderr
    return match.group(1)


# ── the positive case ───────────────────────────────────────────────────────


def test_a_valid_candidate_is_materialized_and_passes_strict_validation(
    tmp_path: Path,
) -> None:
    """The whole point: the exact candidate is proved valid without a checkout."""
    repo = _candidate_repo(tmp_path)
    trusted = _trusted(tmp_path)
    out = tmp_path / "workspace"

    result = _materialize(repo, trusted, out)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "trusted schema and config" in result.stdout

    change_root = out / "openspec" / "changes" / "candidate-change"
    assert (change_root / "proposal.md").is_file()
    assert (change_root / "specs" / "probe-capability" / "spec.md").is_file()

    validation = _validate(out)
    assert validation.returncode == 0, validation.stdout + validation.stderr


# ── an invalid candidate must be caught HERE, not by the review gate ────────


def test_a_candidate_that_violates_strict_validation_is_refused(tmp_path: Path) -> None:
    """review:verify is not a substitute for OpenSpec validation.

    This candidate has a perfectly good planning package as far as the review
    gate is concerned -- every required file present -- but its delta spec has
    no requirement, which strict validation refuses. If the boundary skipped
    this step, an invalid change would reach implementation authorization.
    """
    repo = _candidate_repo(tmp_path)
    spec = (
        repo
        / "openspec"
        / "changes"
        / "candidate-change"
        / "specs"
        / "probe-capability"
        / "spec.md"
    )
    spec.write_text("# probe-capability\n\nProse with no requirement at all.\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "break the delta spec")

    trusted = _trusted(tmp_path)
    out = tmp_path / "workspace"
    assert _materialize(repo, trusted, out).returncode == 0, "materialisation still succeeds"

    validation = _validate(out)
    assert validation.returncode != 0, (
        "strict validation accepted a change with no requirement:\n" + validation.stdout
    )


# ── the candidate cannot supply the schema that judges it ───────────────────


def test_a_candidate_cannot_replace_the_trusted_schema_or_config(tmp_path: Path) -> None:
    """A pull request may edit openspec/schemas and openspec/config.yaml.

    Those edits must not become authoritative inside the privileged boundary
    merely by existing in the candidate tree: the paths that decide validity
    come from the trusted context, structurally outside what the candidate
    supplies.
    """
    repo = _candidate_repo(tmp_path)
    # The candidate rewrites both the schema and the project config.
    (repo / "openspec").mkdir(exist_ok=True)
    (repo / "openspec" / "config.yaml").write_text("schema: candidate-controlled\n")
    hostile_schema = repo / "openspec" / "schemas" / SCHEMA
    hostile_schema.mkdir(parents=True)
    (hostile_schema / "schema.yaml").write_text("name: candidate-controlled\nartifacts: []\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "candidate rewrites the schema and config")

    trusted = _trusted(tmp_path)
    out = tmp_path / "workspace"
    assert _materialize(repo, trusted, out).returncode == 0

    # The workspace carries the TRUSTED copies, byte for byte.
    assert (out / "openspec" / "config.yaml").read_bytes() == (
        REPO_ROOT / "openspec" / "config.yaml"
    ).read_bytes()
    assert (out / "openspec" / "schemas" / SCHEMA / "schema.yaml").read_bytes() == (
        REPO_ROOT / "openspec" / "schemas" / SCHEMA / "schema.yaml"
    ).read_bytes()
    assert "candidate-controlled" not in (out / "openspec" / "config.yaml").read_text()


# ── hostile candidate content is inert ──────────────────────────────────────


def test_hostile_candidate_content_is_materialized_inert(tmp_path: Path) -> None:
    """Package scripts, shell files, hooks, and npm config are data here.

    Nothing in the change directory is executed, and nothing keeps an
    executable bit -- so even a file that looks runnable cannot be run.
    """
    repo = _candidate_repo(tmp_path)
    pwned = tmp_path / "pwned-by-candidate"
    change_root = repo / "openspec" / "changes" / "candidate-change"
    (change_root / "package.json").write_text(
        '{"name":"hostile","scripts":{"postinstall":"touch ' + str(pwned) + '"}}\n'
    )
    (change_root / ".npmrc").write_text("ignore-scripts=false\n")
    evil = change_root / "evil.sh"
    evil.write_text(f"#!/bin/sh\ntouch {pwned}\n")
    evil.chmod(0o755)
    hooks = change_root / "hooks"
    hooks.mkdir()
    (hooks / "pre-commit").write_text(f"#!/bin/sh\ntouch {pwned}\n")
    (hooks / "pre-commit").chmod(0o755)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "hostile candidate content")

    # git really recorded the executable bits, or this proves nothing.
    tree = _git(repo, "ls-tree", "-r", "HEAD")
    assert "100755" in tree, "the fixture must contain executable entries"

    trusted = _trusted(tmp_path)
    out = tmp_path / "workspace"
    assert _materialize(repo, trusted, out).returncode == 0

    materialized = out / "openspec" / "changes" / "candidate-change"
    for relative in ("package.json", ".npmrc", "evil.sh", "hooks/pre-commit"):
        target = materialized / relative
        assert target.is_file(), relative
        mode = target.stat().st_mode & 0o777
        assert mode == 0o644, f"{relative} was materialised as {oct(mode)}, not 0644"
    assert not pwned.exists(), "candidate content executed"


@pytest.mark.parametrize("mode", ["120000", "160000"])
def test_a_symlink_or_submodule_entry_is_refused(tmp_path: Path, mode: str) -> None:
    """Only regular blobs are written, so nothing escapes the workspace."""
    repo = _candidate_repo(tmp_path)
    change_root = repo / "openspec" / "changes" / "candidate-change"
    if mode == "120000":
        (change_root / "escape.md").symlink_to("/etc/passwd")
        _git(repo, "add", "-A")
    else:
        # A gitlink needs a real object id; the repository's own HEAD serves.
        head = _git(repo, "rev-parse", "HEAD").strip()
        _git(
            repo,
            "update-index",
            "--add",
            "--cacheinfo",
            f"160000,{head},openspec/changes/candidate-change/submodule",
        )
    _git(repo, "commit", "-qm", f"add a {mode} entry")

    trusted = _trusted(tmp_path)
    assert _refusal(_materialize(repo, trusted, tmp_path / "ws")) == "CANDIDATE_ENTRY_REFUSED"


# ── fail closed ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ("../escape", "INVALID_CHANGE_NAME"),
        ("Upper", "INVALID_CHANGE_NAME"),
        ("-leading", "INVALID_CHANGE_NAME"),
        ("has/slash", "INVALID_CHANGE_NAME"),
        ("no-such-change", "CANDIDATE_CHANGE_EMPTY"),
    ],
)
def test_a_bad_change_identifier_is_refused(tmp_path: Path, change: str, code: str) -> None:
    """Validated before it is used as a path segment or a CLI argument."""
    repo = _candidate_repo(tmp_path)
    trusted = _trusted(tmp_path)
    assert _refusal(_materialize(repo, trusted, tmp_path / "ws", change=change)) == code


def test_an_unresolvable_ref_is_refused(tmp_path: Path) -> None:
    repo = _candidate_repo(tmp_path)
    trusted = _trusted(tmp_path)
    result = _materialize(repo, trusted, tmp_path / "ws", ref="refs/nope")
    assert _refusal(result) == "REF_UNRESOLVABLE"


def test_a_trusted_context_without_openspec_is_refused(tmp_path: Path) -> None:
    """A missing trusted schema must fail, never fall back to the candidate's."""
    repo = _candidate_repo(tmp_path)
    empty = tmp_path / "empty-trusted"
    (empty / "openspec").mkdir(parents=True)
    assert _refusal(_materialize(repo, empty, tmp_path / "ws")) == "TRUSTED_OPENSPEC_MISSING"
