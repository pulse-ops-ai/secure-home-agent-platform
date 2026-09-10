"""Task 3.7: developer documentation must describe the authorities that exist.

Documentation drifts silently. Nothing fails when a README keeps describing a
retired engine as current, and the next person to read it believes it — which is
worse than no documentation, because it is confidently wrong.

These assert a small number of HIGH-VALUE claims: which component owns which
fact, and that no current-state prose presents a retired engine as the blocking
one. They deliberately do not snapshot prose. A test per sentence would fail on
every edit and teach people to update the expectation without reading it.

Historical statements are left alone. "ESLint existed", "Scope 1 was
dual-engine", "TypeScript 6 was the normal compiler" are facts, and a document
that says so in the past tense is correct.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]

CONTRIBUTING = REPO / "CONTRIBUTING.md"
LINT_README = REPO / "packages" / "lint-config" / "README.md"
TSCONFIG_README = REPO / "packages" / "tsconfig" / "README.md"
SCRIPTS_README = REPO / "scripts" / "README.md"

CURRENT_STATE_DOCS = [CONTRIBUTING, LINT_README, TSCONFIG_README, SCRIPTS_README]

#: Wording that would present the retired engine as current.
#
# Matched as CLAIMS, not as the word. "ESLint was the selected implementation"
# is history and must survive; "ESLint, every package" is a current-state claim
# about a package that is not installed.
PRESENT_TENSE_ESLINT = re.compile(
    r"eslint[^.\n]{0,40}\b(?:is|are|runs|enforces|blocks|remains|keeps)\b"
    r"|\b(?:runs|uses|invokes)\b[^.\n]{0,20}eslint",
    re.IGNORECASE,
)


def _text(path: Path) -> str:
    return path.read_text()


# --- no document may present the retired engine as current ------------------


@pytest.mark.parametrize("path", CURRENT_STATE_DOCS, ids=lambda p: str(p.name))
def test_no_document_presents_eslint_as_the_current_engine(path: Path) -> None:
    found = [m.group(0) for m in PRESENT_TENSE_ESLINT.finditer(_text(path))]
    assert found == [], f"{path.relative_to(REPO)} describes ESLint in the present tense: {found}"


@pytest.mark.parametrize("path", CURRENT_STATE_DOCS, ids=lambda p: str(p.name))
def test_no_document_lists_eslint_as_an_installed_dependency(path: Path) -> None:
    """It has no manifest entry, no catalog pin and no lockfile entry, so a
    document listing it among current tooling is describing a package that is
    not there."""
    text = _text(path)
    for line in text.splitlines():
        if "eslint" not in line.lower():
            continue
        # A table row or list item enumerating current tooling.
        if line.lstrip().startswith(("|", "- `", "* `")) and "`eslint`" in line.lower():
            raise AssertionError(f"{path.relative_to(REPO)} lists `eslint` as current: {line!r}")


def test_contributing_does_not_describe_pnpm_lint_as_eslint() -> None:
    """The named example the reconciliation exists for."""
    for line in _text(CONTRIBUTING).splitlines():
        if line.startswith("pnpm lint"):
            assert "eslint" not in line.lower(), line


# --- each authority is named where a reader would look for it ---------------


def test_contributing_states_the_authority_topology() -> None:
    """One table, one owner per fact. A reader who needs to know what owns a
    decision should not have to infer it from four files."""
    text = _text(CONTRIBUTING)
    for authority in (
        "packages/lint-config/policy.json",
        "packages/lint-config/engine-mappings.json",
        "scripts/check-source-imports.mjs",
        "scripts/check-workspace.mjs",
        "scripts/workspace-model.mjs",
        "scripts/check-toolchain-boundaries.mjs",
        "pnpm-workspace.yaml",
        "pnpm-lock.yaml",
        ".github/workflows/toolchain-platform.yml",
        ".github/workflows/toolchain-maintenance-boundary.yml",
        "Prettier",
    ):
        assert authority in text, f"CONTRIBUTING.md never names {authority}"


def test_the_documented_versions_match_the_catalog() -> None:
    """Prose that names a version must agree with the authority that sets it.

    These are explanatory mentions, not the pin. Requiring them to agree is what
    keeps them explanatory rather than a second, drifting source of truth.
    """
    catalog = (REPO / "pnpm-workspace.yaml").read_text()
    pins = {}
    for name in ("typescript", "oxlint", "oxlint-tsgolint"):
        match = re.search(rf"^  {re.escape(name)}: (\S+)$", catalog, re.M)
        assert match, f"{name} is not pinned in the catalog"
        pins[name] = match.group(1)
    seam = re.search(r"^  '@typescript/typescript6': (\S+)$", catalog, re.M)
    assert seam
    pins["@typescript/typescript6"] = seam.group(1)

    contributing = _text(CONTRIBUTING)
    assert f"TypeScript {pins['typescript']}" in contributing
    assert f"Oxlint {pins['oxlint']}" in contributing
    assert f"`oxlint-tsgolint` {pins['oxlint-tsgolint']}" in contributing
    assert f"`@typescript/typescript6` {pins['@typescript/typescript6']}" in contributing

    assert f"TypeScript {pins['typescript']}" in _text(TSCONFIG_README)


@pytest.mark.parametrize(
    ("label", "needle"),
    [
        ("policy is the authority, not the engine", "does not own lint policy"),
        ("the typed backend is not the compiler", "not compiler authority"),
        ("the seam is not a compiler", "not a second compiler"),
        ("formatting belongs to Prettier", "owns formatting, not the lint engine"),
    ],
)
def test_contributing_distinguishes_authority_from_implementation(label: str, needle: str) -> None:
    """The four confusions this topology exists to prevent, stated explicitly."""
    assert needle in _text(CONTRIBUTING), label


def test_the_scripts_readme_identifies_the_parser_seam() -> None:
    """The gate's dependency is the single most misread fact here: it looks like
    it should import the compiler, and importing the compiler would couple
    architecture parsing to a compiler cutover."""
    text = _text(SCRIPTS_README)
    assert "@typescript/typescript6" in text
    assert "parser seam" in text.lower()
    assert "does **not** import the normal `typescript` compiler" in text


# --- the procedures a reader needs are present and point at real things -----


@pytest.mark.parametrize(
    ("label", "needle"),
    [
        ("the maintenance sequence", "trusted predecessor"),
        ("the candidate is data, not the verifier", "untrusted subject / data"),
        ("classifier proves protected projections", "protected projections unchanged"),
        ("native proof is part of it", "native platform proof"),
        ("how to run the platform proof", "gh workflow run toolchain-platform.yml"),
        ("both rows and the aggregate", "requires both to have concluded `success`"),
        ("rollback restores an authority", "Rolling back a bad toolchain update"),
        ("TS6 serialization is not a contract", "not a compatibility contract"),
    ],
)
def test_the_maintenance_procedure_is_documented(label: str, needle: str) -> None:
    assert needle in _text(SCRIPTS_README), label


@pytest.mark.parametrize(
    "forbidden",
    [
        "reinstating a retired lint engine",
        "bypassing `policy.json`",
        "widening the seam's admitted-consumer allowlist",
        "dropping the ARM64 row",
        "adding an install-script exception",
    ],
)
def test_rollback_names_what_it_is_not(forbidden: str) -> None:
    """Rollback restores an authority; it does not suspend one. Each of these is
    a tempting shortcut that would look like recovery."""
    assert forbidden in _text(SCRIPTS_README), forbidden


def test_every_documented_path_exists() -> None:
    """Documentation that points at a moved file is worse than silence."""
    text = "\n".join(_text(p) for p in CURRENT_STATE_DOCS)
    referenced = {
        match
        for match in re.findall(r"`((?:scripts|packages|\.github)/[A-Za-z0-9_./-]+)`", text)
        if not match.endswith("/**")
    }
    missing = sorted(rel for rel in referenced if not (REPO / rel).exists())
    assert missing == [], missing
