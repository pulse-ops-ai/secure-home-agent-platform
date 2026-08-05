"""Tests for ``scripts/scan-secrets.sh``.

The scanner is a security control, so it is tested the way a security control
should be: by proving it **refuses**, not merely that it passes on a clean tree.

Two regressions are pinned here because both were real defects in earlier
revisions of the scanner:

* a repository-wide sentinel comment that suppressed any finding on any line;
* an allowlist whose documented restrictions were not enforced in code.

Each test runs the real script against a throwaway git repository, so what is
verified is the shipped behaviour rather than a reimplementation of it.
"""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCANNER = REPO_ROOT / "scripts" / "scan-secrets.sh"
ALLOWLIST_REL = "scripts/secret-scan-allowlist.txt"

# Split so this test file does not trip the scanner it is testing — the same
# construction rule the scanner applies to its own patterns.
FAKE_GH_TOKEN = "ghp_" + "A" * 36
FAKE_AWS_KEY = "AKIA" + "IOSFODNN7EXAMPLE"

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_ALLOWLIST_INVALID = 2


def _digest(line_content: str) -> str:
    """Digest of a finding's line content, as the scanner computes it."""
    return hashlib.sha256(line_content.encode()).hexdigest()


def _make_repo(tmp_path: Path, files: dict[str, str], allowlist: str = "") -> Path:
    """Build a throwaway git repo containing the real scanner plus ``files``."""
    repo = tmp_path / "repo"
    (repo / "scripts").mkdir(parents=True)

    (repo / "scripts" / "scan-secrets.sh").write_text(SCANNER.read_text())
    (repo / ALLOWLIST_REL).write_text(allowlist)

    for rel, content in files.items():
        target = repo / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    return repo


def _scan(repo: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", "scripts/scan-secrets.sh"],
        cwd=repo,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", "HOME": str(repo), "NO_COLOR": "1"},
        check=False,
    )


# --- detection --------------------------------------------------------------


def test_clean_repository_passes(tmp_path: Path) -> None:
    repo = _make_repo(tmp_path, {"docs/notes.md": "We discuss tokens and secrets in prose.\n"})
    result = _scan(repo)
    assert result.returncode == EXIT_CLEAN, result.stdout


def test_prose_about_credentials_is_not_a_finding(tmp_path: Path) -> None:
    """This repository is *about* credentials; the words alone must not fail."""
    prose = (
        "The action gateway is the only holder of a Home Assistant token.\n"
        "No secret, password, or api_key may be committed.\n"
    )
    repo = _make_repo(tmp_path, {"docs/security.md": prose})
    assert _scan(repo).returncode == EXIT_CLEAN


def test_known_credential_format_is_found(tmp_path: Path) -> None:
    repo = _make_repo(tmp_path, {"src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n'})
    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS
    assert "src/conf.py" in result.stdout


def test_secret_inside_a_workflow_is_found(tmp_path: Path) -> None:
    """Workflows were once excluded wholesale. They must never be again."""
    workflow = f'name: ci\nenv:\n  GH_TOKEN: "{FAKE_GH_TOKEN}"\n'
    repo = _make_repo(tmp_path, {".github/workflows/ci.yml": workflow})
    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS
    assert ".github/workflows/ci.yml" in result.stdout


def test_scanner_scans_itself(tmp_path: Path) -> None:
    """A secret added to the scanner is found by the scanner."""
    repo = _make_repo(tmp_path, {})
    scanner = repo / "scripts" / "scan-secrets.sh"
    scanner.write_text(scanner.read_text() + f'\nLEAKED="{FAKE_GH_TOKEN}"\n')
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)

    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS
    assert "scripts/scan-secrets.sh" in result.stdout


# --- regression: no repository-wide bypass token ----------------------------


def test_sentinel_comment_does_not_suppress_a_finding(tmp_path: Path) -> None:
    """Regression: a sentinel comment was once a repo-wide bypass token.

    An earlier revision discarded any result line containing the scanner's
    pattern sentinel, anywhere in the repository. Appending that comment to a
    line was enough to hide a committed credential.
    """
    sentinel = "scan-secrets" + ":pattern"
    files = {
        ".github/workflows/ci.yml": f"env:\n  GH_TOKEN: {FAKE_GH_TOKEN} # {sentinel}\n",
        "src/conf.py": f'api_key = "{FAKE_AWS_KEY}"  # {sentinel}\n',
    }
    repo = _make_repo(tmp_path, files)

    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS, "sentinel comment suppressed a real secret"
    assert ".github/workflows/ci.yml" in result.stdout
    assert "src/conf.py" in result.stdout


def test_no_inline_pragma_of_any_spelling_suppresses(tmp_path: Path) -> None:
    """Guards the *shape* of the defect, not one spelling of it.

    A comment-driven skip must not be reintroduced under any name, so a battery
    of plausible pragmas is tried rather than grepping for one literal.
    """
    pragmas = (
        "scan-secrets" + ":pattern",
        "scan-secrets" + ":ignore",
        "nosecret",
        "noqa",
        "gitleaks:allow",
        "pragma: allowlist secret",
    )
    files = {
        f"src/conf{i}.py": f'KEY = "{FAKE_AWS_KEY}"  # {pragma}\n'
        for i, pragma in enumerate(pragmas)
    }
    repo = _make_repo(tmp_path, files)

    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS
    for i in range(len(pragmas)):
        assert f"FINDING src/conf{i}.py" in result.stdout, (
            f"pragma {pragmas[i]!r} suppressed a real secret"
        )


# --- regression: the allowlist is enforced, not advisory ---------------------


def test_allowlist_rejects_workflow_paths(tmp_path: Path) -> None:
    allowlist = (
        ".github/workflows/ci.yml:3:"
        f"sha256={'0' * 64} # this should never be accepted by the validator\n"
    )
    repo = _make_repo(
        tmp_path,
        {".github/workflows/ci.yml": f'env:\n  GH_TOKEN: "{FAKE_GH_TOKEN}"\n'},
        allowlist=allowlist,
    )
    result = _scan(repo)
    assert result.returncode == EXIT_ALLOWLIST_INVALID, result.stdout
    assert "workflows" in result.stdout
    assert "nothing was scanned" in result.stdout


def test_allowlist_rejects_path_only_entry(tmp_path: Path) -> None:
    repo = _make_repo(
        tmp_path,
        {"src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n'},
        allowlist="src/conf.py # a whole-file exemption must be rejected\n",
    )
    result = _scan(repo)
    assert result.returncode == EXIT_ALLOWLIST_INVALID
    assert "path:line:sha256=<digest>" in result.stdout


def test_allowlist_rejects_degenerate_entry(tmp_path: Path) -> None:
    """A bare ``:`` must not become a universal suppressor."""
    repo = _make_repo(
        tmp_path,
        {"src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n'},
        allowlist=":: # a degenerate entry must be rejected outright\n",
    )
    assert _scan(repo).returncode == EXIT_ALLOWLIST_INVALID


def test_allowlist_rejects_missing_justification(tmp_path: Path) -> None:
    repo = _make_repo(
        tmp_path,
        {"src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n'},
        allowlist=f"src/conf.py:1:sha256={'0' * 64}\n",
    )
    result = _scan(repo)
    assert result.returncode == EXIT_ALLOWLIST_INVALID
    assert "justification" in result.stdout


def test_allowlist_rejects_truncated_digest(tmp_path: Path) -> None:
    repo = _make_repo(
        tmp_path,
        {"src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n'},
        allowlist="src/conf.py:1:sha256=deadbeef # a prefix must not be accepted\n",
    )
    result = _scan(repo)
    assert result.returncode == EXIT_ALLOWLIST_INVALID
    assert "64 hex digits" in result.stdout


def test_allowlist_rejects_raw_value_instead_of_digest(tmp_path: Path) -> None:
    """Pasting the secret into the allowlist is refused, not merely discouraged."""
    repo = _make_repo(
        tmp_path,
        {"src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n'},
        allowlist=f"src/conf.py:1:{FAKE_AWS_KEY} # never paste the value itself\n",
    )
    result = _scan(repo)
    assert result.returncode == EXIT_ALLOWLIST_INVALID
    assert "never paste the value" in result.stdout


def test_allowlist_rejects_untracked_path(tmp_path: Path) -> None:
    repo = _make_repo(
        tmp_path,
        {"src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n'},
        allowlist=f"src/gone.py:1:sha256={'0' * 64} # stale entries must be removed\n",
    )
    result = _scan(repo)
    assert result.returncode == EXIT_ALLOWLIST_INVALID
    assert "not a tracked file" in result.stdout


def test_valid_allowlist_entry_suppresses_only_its_own_line(tmp_path: Path) -> None:
    """A well-formed entry is honoured — and does not leak to other findings."""
    doc_line = f"Placeholder from vendor docs: {FAKE_AWS_KEY}"
    files = {
        "docs/example.md": doc_line + "\n",
        "src/conf.py": f'KEY = "{FAKE_AWS_KEY}"\n',
    }
    allowlist = (
        f"docs/example.md:1:sha256={_digest(doc_line)}"
        " # vendor's published documentation placeholder\n"
    )
    repo = _make_repo(tmp_path, files, allowlist=allowlist)

    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS, "the unallowlisted secret must still fail"
    assert "allowlisted docs/example.md:1" in result.stdout
    assert "FINDING src/conf.py" in result.stdout


def test_valid_allowlist_entry_alone_passes(tmp_path: Path) -> None:
    doc_line = f"Placeholder from vendor docs: {FAKE_AWS_KEY}"
    allowlist = (
        f"docs/example.md:1:sha256={_digest(doc_line)}"
        " # vendor's published documentation placeholder\n"
    )
    repo = _make_repo(tmp_path, {"docs/example.md": doc_line + "\n"}, allowlist=allowlist)

    result = _scan(repo)
    assert result.returncode == EXIT_CLEAN, result.stdout


def test_allowlist_entry_does_not_apply_to_a_different_line(tmp_path: Path) -> None:
    """Matching is exact on line number, not a free substring of the result."""
    secret_line = f"Placeholder: {FAKE_AWS_KEY}"
    files = {"docs/example.md": f"line one\n{secret_line}\n"}
    allowlist = (
        f"docs/example.md:1:sha256={_digest(secret_line)}"
        " # points at the wrong line number on purpose\n"
    )
    repo = _make_repo(tmp_path, files, allowlist=allowlist)

    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS
    assert "FINDING docs/example.md:2" in result.stdout


def test_allowlist_entry_stops_applying_when_the_line_changes(tmp_path: Path) -> None:
    """A digest is self-invalidating: edited content needs re-review."""
    original = f"Placeholder from vendor docs: {FAKE_AWS_KEY}"
    allowlist = f"docs/example.md:1:sha256={_digest(original)} # documentation placeholder\n"

    repo = _make_repo(tmp_path, {"docs/example.md": original + "\n"}, allowlist=allowlist)
    assert _scan(repo).returncode == EXIT_CLEAN

    # Same line number, different content — the entry must no longer apply.
    (repo / "docs" / "example.md").write_text(f'KEY = "{FAKE_AWS_KEY}"\n')
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)

    result = _scan(repo)
    assert result.returncode == EXIT_FINDINGS, "a stale digest still suppressed a finding"


# --- coverage honesty -------------------------------------------------------


def test_coverage_output_accounts_for_every_tracked_file(tmp_path: Path) -> None:
    """The scanner must not claim more coverage than pattern matching gives it.

    Binary content cannot be pattern-scanned, so the summary reports the text /
    empty / binary split rather than asserting "every file was scanned".
    """
    repo = _make_repo(tmp_path, {"docs/a.md": "text\n", "src/empty.marker": ""})
    (repo / "assets").mkdir()
    (repo / "assets" / "blob.bin").write_bytes(b"\x00\x01\x02\xff\xfe binary \x00")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)

    result = _scan(repo)
    assert "text (scanned)" in result.stdout
    assert "1 binary" in result.stdout
    assert "NOT pattern-scannable" in result.stdout


def test_secret_inside_a_binary_is_not_pattern_scannable(tmp_path: Path) -> None:
    """Documents the real gap the binary policy exists to close.

    The scanner does **not** find this, which is precisely why
    ``scripts/validate-scaffold.sh`` refuses to let a binary be tracked at all.
    """
    repo = _make_repo(tmp_path, {"docs/a.md": "text\n"})
    (repo / "assets").mkdir()
    (repo / "assets" / "blob.bin").write_bytes(b"\x00\xff" + FAKE_AWS_KEY.encode() + b"\x00")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)

    assert _scan(repo).returncode == EXIT_CLEAN, (
        "if this ever fails, pattern matching gained binary coverage and the "
        "binary policy in validate-scaffold.sh can be revisited"
    )
