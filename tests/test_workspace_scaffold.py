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

import json
import subprocess
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


# --- canonical taxonomy (ADR-0012 §5) ---------------------------------------

TAXONOMY_ROOTS = ("services", "apps", "packages", "agents")

CANONICAL_DEPLOYABLES = (
    "services/control-plane",
    "services/runner-control",
    "services/workers",
    "apps/web",
)


def _pnpm_members() -> list[Path]:
    """Workspace members, discovered the way pnpm-workspace.yaml does."""
    members: list[Path] = []
    for glob in ("services", "services/workers", "apps", "packages", "agents"):
        root = REPO_ROOT / glob
        if not root.is_dir():
            continue
        members.extend(
            sorted(d for d in root.iterdir() if d.is_dir() and (d / "package.json").is_file())
        )
    return members


def test_taxonomy_roots_exist() -> None:
    missing = [d for d in TAXONOMY_ROOTS if not (REPO_ROOT / d).is_dir()]
    assert not missing, f"missing taxonomy roots: {missing}"


def test_canonical_deployables_are_in_the_right_directories() -> None:
    missing = [d for d in CANONICAL_DEPLOYABLES if not (REPO_ROOT / d).is_dir()]
    assert not missing, f"missing canonical deployables: {missing}"


def test_no_backend_process_lives_under_apps() -> None:
    """`apps/` is human-facing only; a backend process there breaks §15 too."""
    offenders = [
        d.name
        for d in (REPO_ROOT / "apps").iterdir()
        if d.is_dir() and ("control-plane" in d.name or "runner" in d.name or "worker" in d.name)
    ]
    assert not offenders, f"deployable backend processes under apps/: {offenders}"


def test_python_is_confined_to_the_admitted_inference_boundary() -> None:
    """Python is admitted only for isolated inference workers (ADR-0012 §6)."""
    admitted = REPO_ROOT / "services/workers/python-inference"
    stray = [
        str(p.relative_to(REPO_ROOT))
        for root in TAXONOMY_ROOTS
        for p in (REPO_ROOT / root).rglob("pyproject.toml")
        if admitted not in p.parents
    ]
    assert not stray, f"Python manifests outside the inference boundary: {stray}"


def test_every_pnpm_member_is_private_and_scoped() -> None:
    problems: list[str] = []
    for member in _pnpm_members():
        pkg = json.loads((member / "package.json").read_text())
        rel = member.relative_to(REPO_ROOT)
        if pkg.get("private") is not True:
            problems.append(f"{rel}: not private")
        if not str(pkg.get("name", "")).startswith("@secure-home/"):
            problems.append(f"{rel}: name is not scoped @secure-home/*")
    assert not problems, "invalid workspace members:\n  " + "\n  ".join(problems)


def test_dependency_declarations_use_catalog_and_workspace_protocols() -> None:
    """Internal deps use workspace:*, external deps use catalog: (ADR-0012 §19)."""
    problems: list[str] = []
    for member in _pnpm_members():
        pkg = json.loads((member / "package.json").read_text())
        rel = member.relative_to(REPO_ROOT)
        for field in ("dependencies", "devDependencies"):
            for dep, spec in (pkg.get(field) or {}).items():
                expected = "workspace:*" if dep.startswith("@secure-home/") else "catalog:"
                if spec != expected:
                    problems.append(f"{rel}: {field}.{dep} is {spec!r}, expected {expected!r}")
    assert not problems, "invalid dependency declarations:\n  " + "\n  ".join(problems)


def test_every_pnpm_member_declares_the_standard_scripts() -> None:
    required = ("lint", "typecheck", "test", "build")
    problems: list[str] = []
    for member in _pnpm_members():
        pkg = json.loads((member / "package.json").read_text())
        scripts = pkg.get("scripts") or {}
        missing = [s for s in required if s not in scripts]
        if missing:
            problems.append(f"{member.relative_to(REPO_ROOT)}: missing {missing}")
    assert not problems, "members missing standard scripts:\n  " + "\n  ".join(problems)


def test_every_pnpm_member_has_a_readme() -> None:
    missing = [
        str(m.relative_to(REPO_ROOT)) for m in _pnpm_members() if not (m / "README.md").is_file()
    ]
    assert not missing, f"workspace members without a README.md: {missing}"


# --- regression: dependency layering is genuinely enforced -------------------


def _run_workspace_check(repo: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(REPO_ROOT / "scripts" / "check-workspace.mjs")],
        capture_output=True,
        text=True,
        cwd=repo,
        check=False,
    )


def test_inward_layering_rejects_an_outward_dependency(tmp_path: Path) -> None:
    """Regression: a per-directory layer put every package on one level.

    That let `contracts` depend on `logging`, `observability`, or `testing` and
    still pass — the rule read as enforced while enforcing nothing.
    """
    manifest = REPO_ROOT / "packages" / "contracts" / "package.json"
    original = manifest.read_text()
    try:
        pkg = json.loads(original)
        pkg.setdefault("dependencies", {})["@secure-home/logging"] = "workspace:*"
        manifest.write_text(json.dumps(pkg, indent=2) + "\n")

        result = _run_workspace_check(REPO_ROOT)
        assert result.returncode != 0, "contracts → logging must be rejected"
        assert "inward only" in result.stdout + result.stderr
    finally:
        manifest.write_text(original)


def test_internal_peer_dependency_declarations_are_checked(tmp_path: Path) -> None:
    """peerDependencies were skipped, so an invalid internal spec slipped through."""
    manifest = REPO_ROOT / "packages" / "worker-base" / "package.json"
    original = manifest.read_text()
    try:
        pkg = json.loads(original)
        pkg["peerDependencies"] = {"@secure-home/contracts": "^1.0.0"}
        manifest.write_text(json.dumps(pkg, indent=2) + "\n")

        result = _run_workspace_check(REPO_ROOT)
        assert result.returncode != 0, "an internal peer dep must still require workspace:*"
        assert "workspace:*" in result.stdout + result.stderr
    finally:
        manifest.write_text(original)


def test_a_package_missing_from_the_layer_map_is_rejected(tmp_path: Path) -> None:
    """Fail closed: placing a new package in the layering must be a decision."""
    new_pkg = REPO_ROOT / "packages" / "zz-unplaced"
    try:
        new_pkg.mkdir()
        (new_pkg / "package.json").write_text(
            json.dumps(
                {
                    "name": "@secure-home/zz-unplaced",
                    "private": True,
                    "description": "temporary fixture",
                    "scripts": dict.fromkeys(("lint", "typecheck", "test", "build"), "true"),
                },
                indent=2,
            )
        )
        result = _run_workspace_check(REPO_ROOT)
        assert result.returncode != 0, "an unplaced package must fail, not default"
        assert "layer map" in result.stdout + result.stderr
    finally:
        for f in new_pkg.glob("*"):
            f.unlink()
        new_pkg.rmdir()


def test_aggregate_check_uses_a_locked_python_sync() -> None:
    """Regression: `uv sync` without --locked can repair a stale lock and pass."""
    check_sh = (REPO_ROOT / "scripts" / "check.sh").read_text()
    assert "uv sync --all-packages --locked" in check_sh
    for line in check_sh.splitlines():
        if "uv sync" in line and not line.strip().startswith("#"):
            assert "--locked" in line, f"unlocked uv sync in check.sh: {line.strip()}"
