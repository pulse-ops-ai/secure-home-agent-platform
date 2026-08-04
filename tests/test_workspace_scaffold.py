"""Conformance tests for the repository scaffold itself.

These are real assertions, not placeholders: they check that what the workspace
manifests *declare* matches what is actually on disk, and that the governance
files every agent is told to read are present. A silently-broken workspace or a
missing navigation file is the failure mode this guards against.

Structural checks that do not need Python (index integrity, tracked secrets,
forbidden generated directories) live in ``scripts/validate-scaffold.sh`` so
they can run before any toolchain is installed.
"""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

# Files every agent — coding or human — is told to start from.
REQUIRED_NAVIGATION_FILES = (
    "AGENTS.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "README.md",
    "SECURITY.md",
    ".github/copilot-instructions.md",
    ".github/pull_request_template.md",
    ".github/agents/architecture.agent.md",
    ".github/agents/implementation.agent.md",
    ".github/agents/review.agent.md",
    ".github/workflows/checks.yml",
    ".github/dependabot.yml",
    "docs/architecture/INDEX.md",
    "docs/decisions/INDEX.md",
    "docs/operations/INDEX.md",
)

# Subtrees that carry their own scoped AGENTS.md.
REQUIRED_NESTED_AGENTS_DIRS = (
    "agents",
    "deploy",
    "docs",
    "knowledge",
    "profiles",
    "services",
)


def _load_toml(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def _tool_table(*keys: str) -> dict[str, Any]:
    """Read a nested table out of the root pyproject's ``[tool]`` section."""
    table: dict[str, Any] = _load_toml(REPO_ROOT / "pyproject.toml")["tool"]
    for key in keys:
        table = table[key]
    return table


def _workspace_member_dirs() -> list[Path]:
    """Resolve the workspace member globs to concrete directories."""
    patterns: list[str] = _tool_table("uv", "workspace")["members"]

    members: list[Path] = []
    for pattern in patterns:
        members.extend(sorted(p for p in REPO_ROOT.glob(pattern) if p.is_dir()))
    return members


def test_navigation_files_exist() -> None:
    missing = [name for name in REQUIRED_NAVIGATION_FILES if not (REPO_ROOT / name).is_file()]
    assert not missing, f"missing navigation files: {missing}"


def test_nested_agents_files_exist() -> None:
    missing = [
        d for d in REQUIRED_NESTED_AGENTS_DIRS if not (REPO_ROOT / d / "AGENTS.md").is_file()
    ]
    assert not missing, f"subtrees missing a scoped AGENTS.md: {missing}"


def test_workspace_globs_resolve_to_members() -> None:
    members = _workspace_member_dirs()
    assert members, "workspace member globs resolved to nothing"


def test_every_workspace_member_is_a_valid_project() -> None:
    """Each member declares a name, a Python floor, and no runtime dependencies.

    The dependency assertion is deliberate: this repository has no runtime
    dependencies on purpose, and adding one must be a reviewed decision rather
    than something that arrives unnoticed with a scaffold change.
    """
    problems: list[str] = []

    for member in _workspace_member_dirs():
        manifest = member / "pyproject.toml"
        if not manifest.is_file():
            problems.append(f"{member.relative_to(REPO_ROOT)}: no pyproject.toml")
            continue

        project = _load_toml(manifest).get("project")
        if not isinstance(project, dict):
            problems.append(f"{member.relative_to(REPO_ROOT)}: no [project] table")
            continue

        rel = member.relative_to(REPO_ROOT)
        if not project.get("name"):
            problems.append(f"{rel}: [project] has no name")
        if project.get("requires-python") != ">=3.13":
            problems.append(f"{rel}: requires-python must be '>=3.13'")
        if project.get("dependencies"):
            problems.append(f"{rel}: unexpected runtime dependencies {project['dependencies']!r}")

    assert not problems, "invalid workspace members:\n  " + "\n  ".join(problems)


def test_every_workspace_member_has_a_readme() -> None:
    missing = [
        str(m.relative_to(REPO_ROOT))
        for m in _workspace_member_dirs()
        if not (m / "README.md").is_file()
    ]
    assert not missing, f"workspace members without a README.md: {missing}"


def test_member_packages_are_importable_and_typed() -> None:
    """Every member ships a real package directory with a py.typed marker."""
    problems: list[str] = []

    for member in _workspace_member_dirs():
        rel = member.relative_to(REPO_ROOT)
        src = member / "src"
        if not src.is_dir():
            problems.append(f"{rel}: no src/ directory")
            continue

        packages = [p for p in src.iterdir() if p.is_dir() and (p / "__init__.py").is_file()]
        if len(packages) != 1:
            problems.append(f"{rel}: expected one package under src/, found {len(packages)}")
            continue

        if not (packages[0] / "py.typed").is_file():
            problems.append(f"{rel}: {packages[0].name} has no py.typed marker")

    assert not problems, "invalid member packages:\n  " + "\n  ".join(problems)


def test_mypy_and_ruff_targets_cover_every_member() -> None:
    """The explicit tool target lists must not drift from the member globs.

    ``mypy`` and ``ruff`` are configured with explicit source lists rather than
    a bare ``.`` so they never wander into ``.venv``. The cost is that the lists
    can go stale when a member is added; this test is the guard.
    """
    mypy_files: set[str] = set(_tool_table("mypy")["files"])
    ruff_src: set[str] = set(_tool_table("ruff")["src"])

    expected = {f"{m.relative_to(REPO_ROOT)}/src" for m in _workspace_member_dirs()}

    assert expected <= mypy_files, f"[tool.mypy] files is missing: {sorted(expected - mypy_files)}"
    assert expected <= ruff_src, f"[tool.ruff] src is missing: {sorted(expected - ruff_src)}"
