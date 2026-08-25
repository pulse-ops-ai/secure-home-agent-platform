"""Adapters are unlaunchable and inert at L7 (PA-INV-12, PA-ADV-12,
PA-MUT-11): no member outside agents/adapters/ references them across
ANY dependency field or source import, they carry zero runtime
dependencies, importing them runs nothing, and each adapter's pinned
provider version equals its paired image's lock registration
(PA-INV-16). The suite itself is ONE suite (PA-ADV-17)."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest
from fc_support import ADAPTERS, REPO_ROOT, SUITE_DIR, Adapter, require_built

ADAPTER_PACKAGE_NAMES = {entry.package for entry in ADAPTERS}

# Every dependency field a manifest could smuggle a reference through —
# the four pnpm fields; PA-MUT-11 pins that devDependencies are covered.
DEP_FIELDS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")


def _workspace_manifests() -> list[Path]:
    manifests = [REPO_ROOT / "package.json"]
    for glob in ("services", "services/workers", "apps", "packages", "agents"):
        root = REPO_ROOT / glob
        if root.is_dir():
            manifests.extend(
                sorted(
                    entry / "package.json"
                    for entry in root.iterdir()
                    if entry.is_dir() and (entry / "package.json").is_file()
                )
            )
    return manifests


def test_no_manifest_outside_adapters_declares_an_adapter() -> None:
    for manifest in _workspace_manifests():
        declared = json.loads(manifest.read_text())
        for field in DEP_FIELDS:
            for name in declared.get(field, {}):
                assert name not in ADAPTER_PACKAGE_NAMES, (
                    f"{manifest.relative_to(REPO_ROOT)} declares {name} in {field} — "
                    "nothing may reference an adapter until a launcher lands (L9)"
                )


def test_no_source_outside_adapters_imports_an_adapter() -> None:
    for root in ("services", "apps", "packages"):
        for source in sorted((REPO_ROOT / root).rglob("*.ts")):
            if "node_modules" in source.parts or "dist" in source.parts:
                continue
            text = source.read_text(errors="replace")
            for name in ADAPTER_PACKAGE_NAMES:
                assert name not in text, f"{source.relative_to(REPO_ROOT)} references {name}"


@pytest.mark.parametrize("entry", ADAPTERS, ids=lambda entry: entry.name)
def test_adapter_manifest_has_zero_runtime_dependencies(entry: Adapter) -> None:
    manifest = json.loads((entry.package_dir / "package.json").read_text())
    for field in ("dependencies", "peerDependencies", "optionalDependencies"):
        assert manifest.get(field, {}) == {}, (
            f"{entry.package}: {field} must be empty, found {sorted(manifest.get(field, {}))}"
        )


@pytest.mark.parametrize("entry", ADAPTERS, ids=lambda entry: entry.name)
def test_importing_an_adapter_has_no_side_effects(entry: Adapter) -> None:
    require_built(entry)
    for module in ("index.js", "bin.js"):
        completed = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                f"await import('file://{entry.package_dir / 'dist' / module}')",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=REPO_ROOT,
        )
        assert completed.returncode == 0, completed.stderr
        assert completed.stdout == "", (
            f"importing {entry.package} dist/{module} produced output: {completed.stdout!r}"
        )


@pytest.mark.parametrize("entry", ADAPTERS, ids=lambda entry: entry.name)
def test_no_model_identifier_constant_in_adapter_source(entry: Adapter) -> None:
    """Routing is data (ADR-0013): the model route flows from the
    invocation; no model name is baked into production source."""
    pattern = re.compile(r"gpt-\d|claude-(?:sonnet|opus|haiku|fable|\d)", re.IGNORECASE)
    for source in sorted((entry.package_dir / "src").glob("*.ts")):
        if source.name.endswith((".test.ts",)) or source.name == "test-fixtures.ts":
            continue
        match = pattern.search(source.read_text())
        assert match is None, (
            f"{source.relative_to(REPO_ROOT)} carries model identifier {match.group(0)!r}"
        )


@pytest.mark.parametrize("entry", ADAPTERS, ids=lambda entry: entry.name)
def test_pinned_provider_version_agrees_with_the_image_lock(entry: Adapter) -> None:
    plan_source = (entry.package_dir / "src" / "plan.ts").read_text()
    version_match = re.search(r"version: '([^']+)'", plan_source)
    assert version_match is not None, f"{entry.package}: PROVIDER.version not found"
    assert version_match.group(1) == entry.pinned_version

    lock = (REPO_ROOT / "deploy" / "images" / "image-lock.yaml").read_text()
    image_block_match = re.search(
        rf"- name: {re.escape(entry.lock_image)}\n(.*?)(?=\n  - name: |\Z)", lock, re.DOTALL
    )
    assert image_block_match is not None, f"{entry.lock_image} not registered in the image lock"
    lock_version_match = re.search(r"version: (\S+)", image_block_match.group(1))
    assert lock_version_match is not None
    assert lock_version_match.group(1) == entry.pinned_version, (
        f"{entry.package} targets {entry.pinned_version} but {entry.lock_image} "
        f"pins {lock_version_match.group(1)} — adapter and image must agree"
    )


def test_the_suite_is_one_suite() -> None:
    """PA-ADV-17: shared assertions are parameterized over the adapter
    registry, never copied per adapter — no test module may hardcode one
    adapter's dist path or parameterize over a partial registry."""
    for module in sorted(SUITE_DIR.glob("test_*.py")):
        text = module.read_text()
        needle = "dist/" + "bin.js"  # split so this module passes its own check
        assert needle not in text, f"{module.name} hardcodes an adapter binary path"
        assert not re.search(r"ADAPTERS\[\d+\]", text), (
            f"{module.name} selects a single adapter from the registry"
        )
