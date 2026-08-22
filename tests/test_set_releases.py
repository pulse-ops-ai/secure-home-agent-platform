"""ADR-0019 set releases — the repository-side governance proofs.

Implementation B (`set_release_oracle`) lives here rather than in the package,
because an oracle that shares a helper with the thing it checks is not an oracle.
These tests prove the two implementations agree on real repository content, and
that B notices when A is wrong.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tests"))

from set_release_oracle import (  # noqa: E402
    ManifestRefusalError,
    canonical_manifest,
    release_digest,
)

CODING_FAMILIES = (
    "prepr-review-default",
    "implement-local-default",
    "architecture-default",
)


def _catalog() -> dict[str, Any]:
    parsed: dict[str, Any] = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    return parsed


def _logical(family_id: str) -> dict[str, Any]:
    """Build the logical release the way a release author would, from the catalog."""
    catalog = _catalog()
    family = next(s for s in catalog["sets"] if s["id"] == family_id)
    modules = {m["id"]: m for m in catalog["modules"]}

    def pin(ids: list[str]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for mid in ids:
            m = modules[mid]
            digest = (m.get("contentReview") or {}).get("sourceDigest")
            out.append({"id": mid, "version": m["version"], "digest": digest})
        return out

    return {
        "family": family["id"],
        "version": "1.0.0",
        "runnerClass": family["runnerClass"],
        "allowTaskAdditions": family["allowTaskAdditions"],
        "allowTaskNarrowing": family["allowTaskNarrowing"],
        "maxBytes": family["maxBytes"],
        "maxFreshnessDays": family["maxFreshnessDays"],
        "requiredFailure": family["requiredFailure"],
        "optionalFailure": family["optionalFailure"],
        "overrideAuthority": family["overrideAuthority"],
        "deny": family["deny"],
        "required": pin(family["required"]),
        "optional": pin(family.get("optional", [])),
    }


def _implementation_a(family_id: str) -> tuple[bytes, str]:
    """Ask the PACKAGE for the same release, through its public API."""
    script = """
import { buildSetReleaseCandidate } from '@secure-home/knowledge-toolchain'
import catalog from './knowledge/catalog.json' with { type: 'json' }
const id = process.argv[2]
const f = catalog.sets.find((s) => s.id === id)
const modules = catalog.modules.map((m) => ({
  id: m.id, version: m.version ?? null,
  sourceDigest: m.contentReview?.sourceDigest ?? null, status: m.status,
  blockedByToolchain: m.blockedByToolchain, blockedByRollout: m.blockedByRollout,
}))
const r = buildSetReleaseCandidate({
  id: f.id, runnerClass: f.runnerClass, required: f.required, optional: f.optional ?? [],
  deny: f.deny, allowTaskAdditions: f.allowTaskAdditions, allowTaskNarrowing: f.allowTaskNarrowing,
  maxBytes: f.maxBytes, maxFreshnessDays: f.maxFreshnessDays, requiredFailure: f.requiredFailure,
  optionalFailure: f.optionalFailure, overrideAuthority: f.overrideAuthority,
}, '1.0.0', modules)
if (!r.ok) { console.error(JSON.stringify(r.refusals)); process.exit(1) }
process.stdout.write(Buffer.from(r.value.manifest).toString('base64'))
"""
    path = REPO_ROOT / ".set-release-probe.mjs"
    path.write_text(script)
    try:
        out = subprocess.run(
            ["node", str(path), family_id],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    finally:
        path.unlink(missing_ok=True)
    import base64

    manifest = base64.b64decode(out.stdout)
    return manifest, "sha256:" + hashlib.sha256(manifest).hexdigest()


@pytest.mark.parametrize("family_id", CODING_FAMILIES)
def test_the_two_implementations_agree_byte_for_byte(family_id: str) -> None:
    """21. A and B must produce identical BYTES, not merely identical digests."""
    a_bytes, a_digest = _implementation_a(family_id)
    b_bytes = canonical_manifest(_logical(family_id))
    assert a_bytes == b_bytes, f"{family_id}: implementations disagree on manifest bytes"
    assert a_digest == release_digest(_logical(family_id))


def test_the_oracle_does_not_import_the_package() -> None:
    """Guard the guard: an oracle that calls A proves only that A equals itself."""
    source = (REPO_ROOT / "tests" / "set_release_oracle.py").read_text()
    for forbidden in ("import ", "from "):
        for line in source.splitlines():
            stripped = line.strip()
            if stripped.startswith(forbidden):
                assert "knowledge_toolchain" not in stripped
                assert "subprocess" not in stripped, "the oracle must not shell out to A"


@pytest.mark.parametrize("family_id", CODING_FAMILIES)
def test_the_oracle_notices_a_planted_defect(family_id: str) -> None:
    """21. A one-byte change in the logical content must move B's digest.

    This is the property that makes B useful: if B were insensitive to a field,
    a defect in A touching that field would pass unnoticed.
    """
    logical = _logical(family_id)
    honest = release_digest(logical)
    for field, mutated in (
        ("maxFreshnessDays", logical["maxFreshnessDays"] + 1),
        ("allowTaskNarrowing", not logical["allowTaskNarrowing"]),
        ("runnerClass", logical["runnerClass"] + "x"),
    ):
        assert release_digest({**logical, field: mutated}) != honest, field


def test_the_oracle_refuses_injected_separators() -> None:
    """22. NUL, LF, CR, and whitespace are refused rather than escaped."""
    logical = _logical("prepr-review-default")
    for bad in ("a b", "a\x00b", "a\nb", "a\rb"):
        with pytest.raises(ManifestRefusalError):
            canonical_manifest({**logical, "family": bad})


def test_the_release_registry_is_present_and_coherent() -> None:
    """The registry exists even while empty, so its absence is never ambiguous."""
    registry = json.loads((REPO_ROOT / "knowledge" / "set-releases.json").read_text())
    assert registry["version"] == 1
    assert isinstance(registry["releases"], list)
    seen = set()
    for record in registry["releases"]:
        key = (record["familyId"], record["version"])
        assert key not in seen, f"{key} reuses a version"
        seen.add(key)
        expected = f"knowledge/releases/{record['familyId']}@{record['version']}.manifest"
        assert record["manifestPath"] == expected
        assert (REPO_ROOT / expected).is_file()
        assert "blockedByRollout" not in record, "Released IS the eligibility"


def test_every_stored_manifest_has_a_release_record() -> None:
    """Both directions: a manifest nobody reviewed is as wrong as a record with no content."""
    registry = json.loads((REPO_ROOT / "knowledge" / "set-releases.json").read_text())
    declared = {r["manifestPath"] for r in registry["releases"]}
    directory = REPO_ROOT / "knowledge" / "releases"
    for entry in sorted(directory.glob("*")):
        if entry.name == "README.md":
            continue
        assert f"knowledge/releases/{entry.name}" in declared, entry.name


def test_set_families_carry_no_release_authority() -> None:
    """After the ADR-0019 migration a family holds no lifecycle, version, or gate."""
    for family in _catalog()["sets"]:
        for legacy in ("status", "version", "asOf", "blockedByRollout"):
            assert legacy not in family, f"{family['id']} still carries {legacy}"
        assert family["blockedByToolchain"] is False


def test_release_version_grammar_is_syntax_only() -> None:
    """DIGIT+.DIGIT+.DIGIT+ — and no SemVer meaning is asserted anywhere."""
    grammar = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
    assert grammar.match("1.0.0")
    for bad in ("1.0", "v1.0.0", "1.0.0-rc1", "1.0.0+build"):
        assert not grammar.match(bad)
