"""The REAL OpenSpec implementation, exercised against the v2 schema.

This repository authors an OpenSpec workflow schema. Structural grep/awk
assertions in validate-scaffold.sh are fast defence in depth, and they cannot
tell whether the parser that will actually read the schema agrees. A PR that
introduces a schema must not merge with schema validation reported as skipped,
so the CLI is pinned in the catalog and executed here.

`@fission-ai/openspec` is pinned exactly (never `latest`) and resolved through
pnpm, so these tests run the same implementation CI does.
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
SCHEMA = "governed-spec-driven-v2"
ARTIFACTS = ["proposal", "specs", "design", "assurance", "tasks", "preimplementation-review"]


# The workspace-resolved binary, not `pnpm exec`: pnpm refuses to exec from a
# directory outside the workspace, and the fixture root deliberately is one.
OPENSPEC_BIN = REPO_ROOT / "node_modules" / ".bin" / "openspec"


def _openspec(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(OPENSPEC_BIN), *args],
        cwd=cwd or REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        # No telemetry from a governance gate in a local-first repository.
        env={**os.environ, "OPENSPEC_TELEMETRY": "0", "NO_COLOR": "1"},
    )


@pytest.fixture(scope="module")
def cli_available() -> bool:
    result = _openspec("--version")
    if result.returncode != 0:
        pytest.fail(
            "the pinned OpenSpec CLI did not run; it is a catalog dependency, not "
            f"an ambient global:\n{result.stdout}{result.stderr}"
        )
    return True


def test_the_cli_is_pinned_exactly_and_not_ambient(cli_available: bool) -> None:
    """A floating version would let upstream silently invalidate our schema."""
    workspace = (REPO_ROOT / "pnpm-workspace.yaml").read_text()
    assert "'@fission-ai/openspec': " in workspace, "the CLI is not in the pnpm catalog"
    pinned = next(
        line.split(":", 1)[1].strip()
        for line in workspace.splitlines()
        if line.strip().startswith("'@fission-ai/openspec':")
    )
    assert pinned not in {"latest", "*"}, f"the CLI must be pinned exactly, got {pinned}"

    manifest = json.loads((REPO_ROOT / "package.json").read_text())
    assert manifest["devDependencies"]["@fission-ai/openspec"] == "catalog:"

    reported = _openspec("--version").stdout.strip()
    assert reported == pinned, f"resolved {reported}, catalog pins {pinned}"


def test_the_real_parser_accepts_the_v2_schema(cli_available: bool) -> None:
    """The claim validate-scaffold.sh cannot make."""
    result = _openspec("schema", "validate", SCHEMA)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "is valid" in result.stdout


def test_the_schema_resolves_from_this_project(cli_available: bool) -> None:
    result = _openspec("schema", "which", SCHEMA)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Source: project" in result.stdout
    assert "openspec/schemas/governed-spec-driven-v2" in result.stdout


def _fixture_change(tmp_path: Path, name: str = "conformance-probe") -> Path:
    """A throwaway v2 change inside a copy of the repository's openspec root.

    A temporary fixture, never a production change: manufacturing a real change
    to make a gate look exercised is the thing this repository refuses.
    """
    root = tmp_path / "probe"
    (root / "openspec" / "schemas").mkdir(parents=True)
    shutil.copytree(
        REPO_ROOT / "openspec" / "schemas" / SCHEMA,
        root / "openspec" / "schemas" / SCHEMA,
    )
    shutil.copy(REPO_ROOT / "openspec" / "config.yaml", root / "openspec" / "config.yaml")
    (root / "openspec" / "specs").mkdir()

    change = root / "openspec" / "changes" / name
    (change / "specs" / "probe-capability").mkdir(parents=True)
    (change / ".openspec.yaml").write_text(f"schema: {SCHEMA}\n")
    (change / "proposal.md").write_text(
        "# Proposal\n\n## Why\n\nProbe the parser.\n\n## What Changes\n\n- probe\n"
    )
    (change / "specs" / "probe-capability" / "spec.md").write_text(
        "# probe-capability\n\n"
        "## ADDED Requirements\n\n"
        "### Requirement: The probe SHALL be validated\n\n"
        "The probe SHALL be understood by the real parser.\n\n"
        "#### Scenario: the parser reads it\n\n"
        "- **WHEN** validation runs\n"
        "- **THEN** the change is valid\n"
    )
    (change / "design.md").write_text("# Design\n\nProbe design.\n")
    (change / "assurance.md").write_text("# Assurance\n\nProbe assurance.\n")
    (change / "tasks.md").write_text(
        "# Tasks\n\n## 1. Probe\n\n<!-- review-scope: probe -->\n\n- [ ] 1.1 probe\n"
    )
    return root


def test_the_real_parser_validates_a_v2_change_strictly(
    tmp_path: Path, cli_available: bool
) -> None:
    """A throwaway change, selected onto v2 by its own .openspec.yaml."""
    root = _fixture_change(tmp_path)
    result = _openspec("validate", "conformance-probe", "--strict", cwd=root)
    assert result.returncode == 0, result.stdout + result.stderr


def test_the_parser_understands_per_change_v2_selection(
    tmp_path: Path, cli_available: bool
) -> None:
    """The change opts in; the project default stays v1."""
    root = _fixture_change(tmp_path)
    assert (
        (root / "openspec" / "config.yaml")
        .read_text()
        .startswith("schema: governed-spec-driven-v1")
    )
    result = _openspec("schema", "which", SCHEMA, cwd=root)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Source: project" in result.stdout


def _status(root: Path) -> dict[str, Any]:
    result = _openspec("status", "--change", "conformance-probe", "--json", cwd=root)
    assert result.returncode == 0, result.stdout + result.stderr
    payload: dict[str, Any] = json.loads(result.stdout)
    return payload


def _artifact(status: dict[str, Any], artifact_id: str) -> dict[str, Any]:
    return next(a for a in status["artifacts"] if a["id"] == artifact_id)


def test_the_parser_reports_apply_blocked_until_the_review_exists(
    tmp_path: Path, cli_available: bool
) -> None:
    """Ask OPENSPEC whether apply is blocked, not the schema text.

    An earlier version grepped the schema for `- preimplementation-review` under
    `apply:`, which proves the file says so and not that the parser enforces it.
    This drives the pinned binary through the actual transition.
    """
    root = _fixture_change(tmp_path)

    before = _status(root)
    assert before["applyRequires"] == ["preimplementation-review"]
    assert before["isPlanningComplete"] is False
    assert _artifact(before, "preimplementation-review")["status"] != "done"

    (
        root / "openspec" / "changes" / "conformance-probe" / "preimplementation-review.md"
    ).write_text("# Pre-Implementation Review\n\nAccepted for the probe.\n")

    after = _status(root)
    assert after["isPlanningComplete"] is True
    assert _artifact(after, "preimplementation-review")["status"] == "done"


def test_the_parser_resolves_this_change_onto_v2(tmp_path: Path, cli_available: bool) -> None:
    """Ask for the CHANGE's resolved schema, not merely that v2 exists."""
    root = _fixture_change(tmp_path)
    status = _status(root)
    assert status["schemaName"] == SCHEMA
    # The project default is untouched by the change's opt-in.
    assert status["planningHome"]["defaultSchema"] != SCHEMA
    assert (
        (root / "openspec" / "config.yaml")
        .read_text()
        .startswith("schema: governed-spec-driven-v1")
    )


def test_the_parser_itself_reports_the_serialized_dag(tmp_path: Path, cli_available: bool) -> None:
    """The DAG as OPENSPEC computes it, not as the YAML reads.

    A text-parsing assertion can agree with a schema the parser would reject, or
    disagree with how the parser actually resolves dependencies.
    """
    root = _fixture_change(tmp_path)
    status = _status(root)
    requires = {a["id"]: a["requires"] for a in status["artifacts"]}

    assert requires["specs"] == ["proposal"]
    assert requires["design"] == ["proposal", "specs"], "design must be based on the specs"
    assert set(requires["assurance"]) >= {"specs", "design"}
    assert "assurance" in requires["tasks"]
    assert set(requires["preimplementation-review"]) >= {
        "proposal",
        "specs",
        "design",
        "assurance",
        "tasks",
    }


def test_a_change_missing_a_required_artifact_is_refused(
    tmp_path: Path, cli_available: bool
) -> None:
    """Guard the guard: strict validation must be capable of failing."""
    root = _fixture_change(tmp_path)
    (
        root
        / "openspec"
        / "changes"
        / "conformance-probe"
        / "specs"
        / "probe-capability"
        / "spec.md"
    ).unlink()
    result = _openspec("validate", "conformance-probe", "--strict", cwd=root)
    assert result.returncode != 0, (
        "strict validation accepted a change with no delta spec:\n" + result.stdout
    )
