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
import re
import subprocess
import tomllib
from pathlib import Path
from typing import Any

import pytest

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
    for glob in ("services", "services/workers", "apps", "packages", "agents", "agents/adapters/coding"):
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


# Every surface that TELLS someone how to validate this repository. The merge
# gate was already safe; the guidance was not, so a contributor following the
# canonical contract could relock during what they were told was validation and
# report success against a repository state they had just mutated.
VALIDATION_SURFACES = (
    "AGENTS.md",
    "CONTRIBUTING.md",
    "CLAUDE.md",
    "README.md",
    "packages/README.md",
    "services/README.md",
    "services/AGENTS.md",
    "services/workers/python-inference/README.md",
    "agents/AGENTS.md",
    "agents/implementations/python/README.md",
    "docs/operations/pi-bootstrap.md",
    ".github/pull_request_template.md",
    ".github/agents/implementation.agent.md",
    "scripts/check.sh",
)


def _command_lines(text: str, path: str) -> list[str]:
    """Strings that PRESCRIBE a command, not prose that mentions one.

    Three ways this repository gives a command: a fenced block, a code span in a
    table cell, and a code span in a sentence. All three are prescriptions. A
    code span is only counted when its CONTENT begins with a command verb, so
    prose may still discuss `uv sync` or name a file without tripping the guard.
    """
    found, fenced = [], False
    for raw in text.splitlines():
        stripped = raw.strip()
        if stripped.startswith("```"):
            fenced = not fenced
            continue
        if path.endswith(".sh"):
            if not stripped.startswith("#"):
                found.append(raw)
            continue
        if fenced:
            found.append(raw)
            continue
        found.extend(
            span
            for span in re.findall(r"`([^`]+)`", raw)
            if re.match(r"(uv|pnpm|bash|node|corepack)\s", span)
        )
    return found


def test_no_current_validation_surface_prescribes_an_unlocked_uv_sync() -> None:
    """The lockfile-mutation class, closed for pnpm, must stay closed for uv.

    `uv sync` without `--locked` repairs a stale `uv.lock` and then reports
    success, so validation both mutates the working tree and describes a state
    that did not exist when the run began.
    """
    offenders = []
    for surface in VALIDATION_SURFACES:
        path = REPO_ROOT / surface
        if not path.exists():
            continue
        for line in _command_lines(path.read_text(), surface):
            if "uv sync" in line and "--locked" not in line:
                offenders.append(f"{surface}: {line.strip()}")
    assert not offenders, "unlocked `uv sync` in current validation guidance:\n" + "\n".join(
        offenders
    )


def test_the_unlocked_sync_guard_can_actually_see_each_surface() -> None:
    """Guard the guard: a parser that finds no commands proves nothing.

    Without this, deleting every validation surface — or breaking the fence
    parser — would leave the test above passing vacuously.
    """
    for surface in VALIDATION_SURFACES:
        path = REPO_ROOT / surface
        assert path.exists(), f"{surface} is named as a validation surface but is missing"
        commands = _command_lines(path.read_text(), surface)
        assert any("uv " in line or "pnpm " in line or "bash " in line for line in commands), (
            f"{surface}: parsed {len(commands)} command lines but found no command in them"
        )


# --- regression: extended dependency-boundary enforcement (#25) --------------


def _with_dependency(package: str, field: str, dep: str, spec: str) -> tuple[Path, str]:
    """Temporarily add a dependency to a manifest, then restore it."""
    manifest = REPO_ROOT / package / "package.json"
    original = manifest.read_text()
    pkg = json.loads(original)
    pkg.setdefault(field, {})[dep] = spec
    manifest.write_text(json.dumps(pkg, indent=2) + "\n")
    return manifest, original


def test_a_test_only_package_cannot_be_a_production_dependency() -> None:
    """Test helpers must not ship inside a running service."""
    manifest, original = _with_dependency(
        "packages/contracts", "dependencies", "@secure-home/testing", "workspace:*"
    )
    try:
        result = _run_workspace_check(REPO_ROOT)
        assert result.returncode != 0
        assert "test-only" in result.stdout + result.stderr
    finally:
        manifest.write_text(original)


def test_a_framework_cannot_enter_a_contract_shaped_package() -> None:
    """`contracts` describes shapes; a framework there couples every consumer."""
    for dep in ("@nestjs/common", "fastify", "next", "react"):
        manifest, original = _with_dependency("packages/contracts", "dependencies", dep, "catalog:")
        try:
            result = _run_workspace_check(REPO_ROOT)
            assert result.returncode != 0, f"{dep} was allowed into contracts"
            assert "framework-neutral" in result.stdout + result.stderr
        finally:
            manifest.write_text(original)


def test_devdependencies_do_not_create_an_architectural_edge() -> None:
    """Build tooling is not a runtime edge.

    Every package devDepends on `@secure-home/testing` (an outer layer). Treating
    that as an architectural violation would make the layer map unusable while
    preventing nothing, because a devDependency is absent from a deployed
    artifact.
    """
    manifest, original = _with_dependency(
        "packages/contracts", "devDependencies", "@secure-home/testing", "workspace:*"
    )
    try:
        assert _run_workspace_check(REPO_ROOT).returncode == 0
    finally:
        manifest.write_text(original)


# --- regression: the TypeScript / typescript-eslint pairing ------------------


def test_catalog_typescript_is_supported_by_typescript_eslint() -> None:
    """TypeScript must stay inside typescript-eslint's supported range.

    PR #44 pinned TypeScript 7.0.2 while typescript-eslint supports
    `>=4.8.4 <6.1.0`. Type-aware linting then threw — or passed — depending on
    which TypeScript copy resolved first, which is worse than failing outright.
    """
    workspace = (REPO_ROOT / "pnpm-workspace.yaml").read_text()
    match = re.search(r"^\s*typescript:\s*(\S+)\s*$", workspace, re.MULTILINE)
    assert match, "no typescript entry in the pnpm catalog"
    major, minor = (int(p) for p in match.group(1).split(".")[:2])

    supported = REPO_ROOT.glob(
        "node_modules/.pnpm/@typescript-eslint+typescript-estree@*/node_modules/"
        "@typescript-eslint/typescript-estree/dist/parseSettings/warnAboutTSVersion.js"
    )
    ranges = [
        m.group(1) for f in supported if (m := re.search(r"'>=[\d.]+ <([\d.]+)'", f.read_text()))
    ]
    if not ranges:
        pytest.skip("typescript-eslint not installed; run pnpm install")

    upper = min(tuple(int(p) for p in r.split(".")[:2]) for r in ranges)
    assert (major, minor) < upper, (
        f"catalog TypeScript {match.group(1)} is outside typescript-eslint's "
        f"supported range (< {upper[0]}.{upper[1]}); type-aware linting will break"
    )


# --- shared tooling is consumed uniformly (#25) ------------------------------


def test_every_member_extends_the_shared_tsconfig_by_package_path() -> None:
    """No relative traversal, and no copied compiler options."""
    problems: list[str] = []
    for member in _pnpm_members():
        for name in ("tsconfig.json", "tsconfig.build.json"):
            path = member / name
            if not path.is_file():
                continue
            cfg = json.loads(path.read_text())
            extends = str(cfg.get("extends", ""))
            rel = member.relative_to(REPO_ROOT)
            if not extends.startswith("@secure-home/tsconfig/"):
                problems.append(f"{rel}/{name}: extends {extends!r}")
            if ".." in extends:
                problems.append(f"{rel}/{name}: relative traversal in extends")
    assert not problems, "members not using the shared tsconfig:\n  " + "\n  ".join(problems)


def test_every_member_uses_the_shared_eslint_config() -> None:
    """No member declares its own rules.

    `packages/eslint-config` is exempt: it lints itself with the configuration
    it exports, which it can only reference relatively — a package cannot import
    itself by package name.
    """
    problems: list[str] = []
    for member in _pnpm_members():
        config = member / "eslint.config.js"
        if not config.is_file():
            continue
        text = config.read_text()
        rel = member.relative_to(REPO_ROOT)
        if rel.name == "eslint-config":
            assert "./index.js" in text, "the config package must lint itself with its own config"
            continue
        if "@secure-home/eslint-config" not in text:
            problems.append(str(rel))
    assert not problems, f"members not using the shared ESLint config: {problems}"


def test_a_member_with_a_vitest_config_declares_the_test_dependencies() -> None:
    """A config without its dependency fails only when someone runs the tests."""
    problems: list[str] = []
    for member in _pnpm_members():
        if not (member / "vitest.config.ts").is_file():
            continue
        dev = json.loads((member / "package.json").read_text()).get("devDependencies", {})
        rel = member.relative_to(REPO_ROOT)
        for required in ("vitest", "@secure-home/testing"):
            # packages/testing imports its own config directly.
            if required == "@secure-home/testing" and rel.name == "testing":
                continue
            if required not in dev:
                problems.append(f"{rel}: missing devDependency {required}")
    assert not problems, "inconsistent test setup:\n  " + "\n  ".join(problems)


def test_buildable_members_use_the_two_project_build_template() -> None:
    """tsconfig.json lints src+tests; tsconfig.build.json emits src only."""
    problems: list[str] = []
    for member in _pnpm_members():
        if not (member / "src").is_dir():
            continue
        rel = member.relative_to(REPO_ROOT)
        if not (member / "tsconfig.build.json").is_file():
            problems.append(f"{rel}: no tsconfig.build.json")
            continue
        scripts = json.loads((member / "package.json").read_text())["scripts"]
        if scripts.get("build") != "tsc -p tsconfig.build.json":
            problems.append(f"{rel}: build script is {scripts.get('build')!r}")
    assert not problems, "members not on the build template:\n  " + "\n  ".join(problems)
