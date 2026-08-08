"""Tests for ``scripts/affected-targets.mjs``.

Path-aware CI is only safe if the affected-target calculation is right. A wrong
dependency graph does not fail loudly — it **silently skips a required check**,
which is the specific way path filtering becomes dangerous (ADR-0012 §20). So
the calculation is tested directly, both against this repository and against a
synthetic fixture workspace where the dependency chain is known.

The governance gates are deliberately *not* computed by that script: they are
unconditional in the workflow, so a bug here cannot skip them. That separation
is asserted here too.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import TypedDict

from workflow_model import governance_jobs, has_condition


class Affected(TypedDict):
    """What the classifier emits."""

    typescript: list[str]
    python: bool
    reason: dict[str, list[str]]


REPO_ROOT = Path(__file__).resolve().parent.parent
CLASSIFIER = REPO_ROOT / "scripts" / "affected-targets.mjs"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "checks.yml"


def _affected(*changed: str) -> Affected:
    """Run the real classifier against this repository."""
    result = subprocess.run(
        ["node", str(CLASSIFIER), *changed],
        capture_output=True,
        text=True,
        check=True,
        cwd=REPO_ROOT,
    )
    parsed: Affected = json.loads(result.stdout)
    return parsed


def _affected_in(root: Path, *changed: str) -> Affected:
    """Run the classifier's calculation against a fixture workspace."""
    files = json.dumps(list(changed))
    script = (
        f"import('file://{CLASSIFIER}').then((m) => {{"
        f"  const r = m.computeAffected({files}, {json.dumps(str(root))});"
        f"  process.stdout.write(JSON.stringify(r));"
        f"}})"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        check=True,
        cwd=REPO_ROOT,
    )
    parsed: Affected = json.loads(result.stdout)
    return parsed


def _fixture_workspace(tmp_path: Path) -> Path:
    """A workspace with a known chain: contracts ← domain ← service.

    The real repository's boundaries do not import each other yet, so a
    transitive chain has to be constructed to prove the traversal works rather
    than merely appearing to.
    """
    root = tmp_path / "ws"

    def member(rel: str, name: str, deps: list[str]) -> None:
        d = root / rel
        d.mkdir(parents=True)
        (d / "package.json").write_text(
            json.dumps(
                {
                    "name": name,
                    "private": True,
                    "dependencies": dict.fromkeys(deps, "workspace:*"),
                }
            )
        )

    member("packages/contracts", "@secure-home/contracts", [])
    member("packages/domain", "@secure-home/domain", ["@secure-home/contracts"])
    member("services/control-plane", "@secure-home/control-plane", ["@secure-home/domain"])
    member("apps/web", "@secure-home/web", ["@secure-home/contracts"])
    member("services/workers/reporter", "@secure-home/reporter", [])

    (root / "pyproject.toml").write_text(
        '[tool.uv.workspace]\nmembers = [\n    "services/workers/python-inference",\n]\n'
    )
    return root


# --- required scenarios -----------------------------------------------------


def test_web_only_change_does_not_run_python(tmp_path: Path) -> None:
    result = _affected("apps/web/src/index.ts")
    assert result["python"] is False
    assert result["typescript"] == ["@secure-home/web"]


def test_contracts_change_runs_every_dependent(tmp_path: Path) -> None:
    """Transitive: a contracts change must reach the service two hops away."""
    root = _fixture_workspace(tmp_path)
    result = _affected_in(root, "packages/contracts/src/index.ts")

    assert set(result["typescript"]) == {
        "@secure-home/contracts",
        "@secure-home/domain",  # direct dependent
        "@secure-home/control-plane",  # transitive dependent
        "@secure-home/web",  # direct dependent
    }
    # An unrelated worker is not dragged in.
    assert "@secure-home/reporter" not in result["typescript"]


def test_root_typescript_config_fans_out_to_all_targets() -> None:
    for root_file in ("pnpm-workspace.yaml", "package.json", "packages/tsconfig/base.json"):
        result = _affected(root_file)
        assert len(result["typescript"]) >= 14, f"{root_file} did not fan out"


def test_python_worker_change_runs_python_checks() -> None:
    result = _affected(
        "services/workers/python-inference/src/secure_home_python_inference/__init__.py"
    )
    assert result["python"] is True
    assert result["typescript"] == []


def test_docs_only_change_selects_no_target() -> None:
    """Governance gates still run — they are unconditional in the workflow."""
    result = _affected("docs/README.md", "README.md")
    assert result["typescript"] == []
    assert result["python"] is False


def test_workflow_and_scanner_changes_cannot_skip_their_own_validation() -> None:
    """A change to CI or the secret scanner must not exempt itself.

    The scanner and scaffold validator are governance gates, which the workflow
    runs unconditionally — so they are safe by construction. This asserts the
    construction: the classifier never emits a "skip governance" signal, and the
    workflow does not gate the governance jobs on it.
    """
    result = _affected(".github/workflows/checks.yml", "scripts/scan-secrets.sh")
    assert "governance" not in json.dumps(result).lower()
    # A workflow change still fans out to every target rather than skipping.
    assert len(result["typescript"]) >= 14
    assert result["python"] is True


# --- structural guarantees --------------------------------------------------


def test_governance_jobs_are_not_gated_on_the_classifier() -> None:
    """The governance jobs must carry no `if:` condition.

    This is the property that makes a classifier bug survivable: even if the
    calculation is wrong, the unconditional gates still run.

    An earlier version of this test split the workflow on the marker and then on
    `"\\n  # "`, which yielded an EMPTY string for every real job — so
    `assert "if:" not in block` passed for any workflow at all. It read as
    enforced while enforcing nothing. The parsing now lives in
    `workflow_model.py`, and `test_the_extraction_is_not_vacuous` below proves
    the sections are non-empty and really are the jobs.
    """
    jobs = governance_jobs()
    assert jobs, "governance jobs must be marked so this test can verify they stay unconditional"

    for name, section in jobs.items():
        assert not has_condition(section), f"governance job {name} acquired an `if:` condition"


def test_the_extraction_is_not_vacuous() -> None:
    """Guard the guard: a test that inspects nothing must not look like a pass."""
    jobs = governance_jobs()
    assert set(jobs) == {"governance", "classifier"}, (
        f"unexpected governance job set: {sorted(jobs)}"
    )
    for name, section in jobs.items():
        assert f"  {name}:" in section, f"section for {name} does not contain the job key"
        assert "runs-on:" in section, f"section for {name} does not contain the job body"

    # And it must actually catch a condition when one is present.
    poisoned = WORKFLOW.read_text().replace(
        "  governance:\n    name: repository governance\n",
        "  governance:\n    if: false\n    name: repository governance\n",
    )
    assert has_condition(governance_jobs(poisoned)["governance"]), (
        "the check does not detect an `if:` added to a governance job"
    )


def test_longest_directory_match_wins() -> None:
    """`services/workers/x` must not be misattributed to a `services/x` sibling."""
    result = _affected("services/workers/python-inference/pyproject.toml")
    assert result["python"] is True
    assert "@secure-home/control-plane" not in result["typescript"]


def test_unknown_path_selects_nothing() -> None:
    result = _affected("some/unknown/path.txt")
    assert result["typescript"] == []
    assert result["python"] is False


# --- regression: every dependency field is an edge ---------------------------


def _fixture_with_field(tmp_path: Path, field: str) -> Path:
    """A workspace whose only edge is declared through ``field``."""
    root = tmp_path / f"ws-{field}"

    def member(rel: str, name: str, deps: dict[str, str] | None = None) -> None:
        d = root / rel
        d.mkdir(parents=True)
        manifest: dict[str, object] = {"name": name, "private": True}
        if deps:
            manifest[field] = deps
        (d / "package.json").write_text(json.dumps(manifest))

    member("packages/contracts", "@secure-home/contracts")
    member(
        "services/control-plane",
        "@secure-home/control-plane",
        {"@secure-home/contracts": "workspace:*"},
    )

    (root / "pyproject.toml").write_text("[tool.uv.workspace]\nmembers = []\n")
    return root


def test_peer_and_optional_dependencies_are_graph_edges(tmp_path: Path) -> None:
    """Regression: a dependent declared via peer/optional was invisible to CI.

    Reading only `dependencies` and `devDependencies` let a real dependent be
    skipped by target selection — silently, which is the failure mode path
    filtering must never have.
    """
    for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        root = _fixture_with_field(tmp_path, field)
        result = _affected_in(root, "packages/contracts/src/index.ts")
        assert "@secure-home/control-plane" in result["typescript"], (
            f"a dependent declared through {field} was not selected"
        )


# --- shared tooling fans out (#25) ------------------------------------------


def test_shared_tooling_changes_fan_out_to_every_typescript_target() -> None:
    """A change to shared config changes how every package builds or tests.

    Validating only the directory the file lives in would validate nothing that
    actually changed — the specific way path filtering becomes dangerous.
    """
    for tooling_file in (
        "packages/tsconfig/base.json",
        "packages/tsconfig/library.json",
        "packages/eslint-config/base.js",
        "packages/testing/vitest.base.js",
        ".prettierrc.json",
        ".prettierignore",
        "pnpm-workspace.yaml",
        # The boundary checks themselves: changing what "inward" means changes
        # whether every package still conforms.
        "scripts/workspace-model.mjs",
        "scripts/check-source-imports.mjs",
    ):
        result = _affected(tooling_file)
        assert len(result["typescript"]) >= 14, f"{tooling_file} did not fan out"
