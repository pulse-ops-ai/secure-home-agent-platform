"""EX-TS-001 / MUT-TS-001 / MUT-TS6-001: one authoritative normal compiler.

`tsc --version` at the repository root proves one resolution. It says nothing
about the resolution a MEMBER gets, and a member with a private copy would
compile against a different compiler while every root-level check stayed green.

So every ordinary compiler command in the frozen task-3.1 inventory is
enumerated, and each owning member is asked — from its own directory — which
`typescript` it actually resolves.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
EVIDENCE = json.loads((REPO / "tests" / "evidence" / "ts7-compatibility-audit.json").read_text())

NORMAL_COMPILER = "typescript"
AUTHORITATIVE_VERSION = "7.0.2"
SEAM_PACKAGE = "@typescript/typescript6"
SEAM_VERSION = "6.0.2"
RETIREMENT_SCOPE = "packages/eslint-config/"


def _catalog() -> dict[str, str]:
    pins: dict[str, str] = {}
    lines = (REPO / "pnpm-workspace.yaml").read_text().split("\n")
    start = next(i for i, line in enumerate(lines) if line.rstrip() == "catalog:")
    for line in lines[start + 1 :]:
        if line.strip() == "" or line.lstrip().startswith("#"):
            continue
        if not line.startswith("  "):
            break
        name, _, version = line.strip().partition(":")
        pins[name.strip().strip("'\"")] = version.strip()
    return pins


def _resolved_typescript(cwd: Path) -> str:
    """The version a command in `cwd` would actually compile with."""
    result = subprocess.run(
        [
            "node",
            "-e",
            "process.stdout.write(require('typescript/package.json').version)",
        ],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    assert result.returncode == 0, f"{cwd}: {result.stderr}"
    return result.stdout.strip()


def _compiler_command_members() -> list[str]:
    """Members owning a frozen compiler command, minus the retired package.

    Read from the task-3.1 inventory rather than rediscovered, so a member that
    quietly stopped compiling cannot drop out of this proof.
    """
    members = set()
    for command in EVIDENCE["surface"]["compilerCommands"]:
        manifest = command["manifest"]
        if manifest.startswith(RETIREMENT_SCOPE):
            continue
        members.add(str(Path(manifest).parent))
    return sorted(members)


# --- the pin itself ---------------------------------------------------------


def test_the_catalog_pins_the_authoritative_compiler_exactly() -> None:
    pins = _catalog()
    assert pins[NORMAL_COMPILER] == AUTHORITATIVE_VERSION
    # Exact, never a range: a range lets the compiler that produced the emitted
    # evidence differ from the one a later install resolves.
    assert not any(c in pins[NORMAL_COMPILER] for c in "^~><*|x")


def test_the_parser_seam_did_not_move_with_the_compiler() -> None:
    """3.2 moves the compiler. The seam is task 3.5's to re-prove."""
    assert _catalog()[SEAM_PACKAGE] == SEAM_VERSION


def test_the_typed_lint_backend_did_not_move_with_the_compiler() -> None:
    """A compiler cutover that silently retuned the lint engine would be two
    changes wearing one commit."""
    pins = _catalog()
    assert pins["oxlint"] == "1.80.0"
    assert pins["oxlint-tsgolint"] == "7.0.2001"


# --- every ordinary entry point resolves it ---------------------------------


@pytest.mark.parametrize("member", _compiler_command_members())
def test_every_member_with_a_compiler_command_resolves_the_authority(member: str) -> None:
    """MUT-TS-001. Asked from the member's own directory, which is where a
    private copy would win."""
    assert _resolved_typescript(REPO / member) == AUTHORITATIVE_VERSION, member


def test_the_repository_root_resolves_the_authority() -> None:
    assert _resolved_typescript(REPO) == AUTHORITATIVE_VERSION


def test_no_member_declares_a_private_alternate_compiler() -> None:
    """A declared version is how a second compiler enters the graph."""
    tracked = subprocess.run(
        ["git", "ls-files", "*package.json"], capture_output=True, text=True, cwd=REPO, check=True
    ).stdout.split()
    for rel in tracked:
        manifest = json.loads((REPO / rel).read_text())
        for field in (
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        ):
            declared = (manifest.get(field) or {}).get(NORMAL_COMPILER)
            if declared is None:
                continue
            assert declared == "catalog:", (
                f"{rel}: {field}.{NORMAL_COMPILER} is {declared!r}; the catalog is the only "
                "place a compiler version is chosen"
            )


def test_generators_resolve_the_same_compiler_as_typecheck_and_build() -> None:
    """A generator compiles too. If it resolved a different compiler, generated
    artifacts would be produced by one and verified against another."""
    generators = [
        c
        for c in EVIDENCE["surface"]["generatorCommands"]
        if not c["manifest"].startswith(RETIREMENT_SCOPE)
    ]
    assert generators, "the frozen inventory records no generator command"
    for command in generators:
        member = Path(command["manifest"]).parent
        assert _resolved_typescript(REPO / member) == AUTHORITATIVE_VERSION, command["manifest"]


# --- and none of them reaches the seam or an unstable API -------------------


def _ordinary_scripts() -> list[tuple[str, str, str]]:
    tracked = subprocess.run(
        ["git", "ls-files", "*package.json"], capture_output=True, text=True, cwd=REPO, check=True
    ).stdout.split()
    found = []
    for rel in tracked:
        scripts = json.loads((REPO / rel).read_text()).get("scripts") or {}
        for name, body in scripts.items():
            if name in {"typecheck", "build", "generate"} or name.startswith(
                ("typecheck:", "build:", "generate:")
            ):
                found.append((rel, name, str(body)))
    return found


def test_the_inventory_and_the_tree_agree_on_which_commands_are_ordinary() -> None:
    """Otherwise the two tests below could be scanning nothing."""
    assert len(_ordinary_scripts()) >= 30


@pytest.mark.parametrize(
    ("forbidden", "why"),
    [
        ("tsc6", "the compatibility binary is a parser seam, not a compiler"),
        ("typescript6", "the compatibility package is a parser seam, not a compiler"),
        ("typescript/unstable", "an unstable API is not the authoritative surface"),
    ],
)
def test_no_ordinary_command_reaches_a_non_authoritative_compiler(forbidden: str, why: str) -> None:
    """MUT-TS6-001."""
    for rel, name, body in _ordinary_scripts():
        assert forbidden not in body, f"{rel} {name}: {why}"


def test_no_source_file_loads_an_unstable_typescript_api() -> None:
    """The other half: a script can be clean while the code it runs is not.

    Read through the structural load-site authority, not by scanning text. The
    first version of this test grepped for the string and failed on a COMMENT
    in `declaration-shape.mjs` explaining why it deliberately does not use that
    API — the same mistake the retirement verifier exists not to make. What
    matters is what a file loads, which only the AST can answer.
    """
    reader = REPO / "scripts" / "check-source-imports.mjs"
    result = subprocess.run(
        ["node", str(reader), "--report-loads", str(REPO)],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode == 0, result.stderr
    loads = json.loads(result.stdout)

    offenders = [
        f"{file}: {specifier}"
        for file, entry in loads.items()
        for specifier in entry.get("specifiers", [])
        if specifier.startswith("typescript/unstable")
        or specifier == SEAM_PACKAGE
        or specifier.startswith(f"{SEAM_PACKAGE}/")
    ]
    # The one admitted consumer of the seam is allowed, and only it.
    admitted = {f"scripts/check-source-imports.mjs: {SEAM_PACKAGE}"}
    assert set(offenders) - admitted == set(), sorted(set(offenders) - admitted)
    assert admitted <= set(offenders), (
        "the admitted seam consumer no longer loads the seam, so the allowlist "
        "describes something that is not happening"
    )
