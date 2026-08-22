"""ADR-0019 set releases — the repository-side governance proofs.

Implementation B (`set_release_oracle`) lives here rather than in the package,
because an oracle that shares a helper with the thing it checks is not an oracle.
These tests prove the two implementations agree on real repository content, and
that B notices when A is wrong.
"""

from __future__ import annotations

import hashlib
import json
import os
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
            attestation = (m.get("contentReview") or {}).get("sourceDigest") or ""
            # The CATALOG holds "sha256:<hex>"; a manifest member holds bare hex.
            # Keeping the two apart is the point — see _check_digest in the oracle.
            out.append(
                {
                    "id": mid,
                    "version": m["version"],
                    "digest": attestation.removeprefix("sha256:"),
                }
            )
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


# --- the live release checker, against real repository bytes -------------------
#
# The defect these close: a mechanism implemented and tested while the REAL
# repository bytes are never handed to it. Each case builds a fixture repository
# containing an actual release, then runs the checker over it.


def _run_release_checker(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(REPO_ROOT / "scripts" / "check-set-releases.mjs"), str(root)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "NODE_PATH": str(REPO_ROOT / "node_modules")},
    )


def _release_fixture(tmp_path: Path, name: str, mutate: Any = None) -> Path:
    """A repository containing one real, valid release — then one defect."""
    root = tmp_path / name
    (root / "knowledge" / "releases").mkdir(parents=True)
    (root / "scripts").mkdir(parents=True, exist_ok=True)

    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    logical = _logical("prepr-review-default")
    manifest = canonical_manifest(logical)
    digest = "sha256:" + hashlib.sha256(manifest).hexdigest()
    record = {
        "familyId": "prepr-review-default",
        "version": "1.0.0",
        "manifestPath": "knowledge/releases/prepr-review-default@1.0.0.manifest",
        "releaseDigest": digest,
        "releaseReview": {
            "policy": "knowledge-set-release-review-v1",
            "by": "human:mikegtech",
            "at": "2026-08-22T00:00:00Z",
            "releaseDigest": digest,
        },
        "state": "Released",
    }
    registry = {"version": 1, "releases": [record]}
    if mutate is not None:
        manifest = mutate(record, manifest) or manifest

    (root / "knowledge" / "catalog.json").write_text(json.dumps(catalog, indent=2))
    (root / "knowledge" / "set-releases.json").write_text(json.dumps(registry, indent=2))
    (root / "knowledge" / "releases" / "prepr-review-default@1.0.0.manifest").write_bytes(manifest)
    return root


def test_a_valid_live_release_passes_the_checker(tmp_path: Path) -> None:
    """The control. Without it the negatives prove only that something failed."""
    result = _run_release_checker(_release_fixture(tmp_path, "valid"))
    assert result.returncode == 0, result.stdout + result.stderr
    assert "1 release(s) validated" in result.stdout


def test_a_one_byte_manifest_mutation_is_caught(tmp_path: Path) -> None:
    """Real stored bytes must reach the package, not a summary of them."""

    def mutate(record: dict[str, Any], manifest: bytes) -> bytes:
        return manifest.replace(b"maxFreshnessDays 180", b"maxFreshnessDays 181")

    result = _run_release_checker(_release_fixture(tmp_path, "mutated", mutate))
    assert result.returncode != 0
    assert "record.digest" in result.stderr


def test_a_declared_digest_that_does_not_hash_the_manifest_is_caught(tmp_path: Path) -> None:
    def mutate(record: dict[str, Any], manifest: bytes) -> bytes:
        record["releaseDigest"] = "sha256:" + "a" * 64
        record["releaseReview"]["releaseDigest"] = "sha256:" + "a" * 64
        return manifest

    result = _run_release_checker(_release_fixture(tmp_path, "wrong-digest", mutate))
    assert result.returncode != 0
    assert "record.digest" in result.stderr


def test_a_noncanonical_manifest_is_caught(tmp_path: Path) -> None:
    """Parseable is not canonical: stored bytes must be what the serializer emits."""

    def mutate(record: dict[str, Any], manifest: bytes) -> bytes:
        swapped = manifest.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        record["releaseDigest"] = "sha256:" + hashlib.sha256(swapped).hexdigest()
        record["releaseReview"]["releaseDigest"] = record["releaseDigest"]
        return swapped

    result = _run_release_checker(_release_fixture(tmp_path, "noncanonical", mutate))
    assert result.returncode != 0
    assert "manifest." in result.stderr


def test_a_review_bound_to_the_wrong_digest_is_caught(tmp_path: Path) -> None:
    def mutate(record: dict[str, Any], manifest: bytes) -> bytes:
        record["releaseReview"]["releaseDigest"] = "sha256:" + "b" * 64
        return manifest

    result = _run_release_checker(_release_fixture(tmp_path, "wrong-review", mutate))
    assert result.returncode != 0
    assert "record.review-binding" in result.stderr


def test_a_manifest_family_or_version_mismatch_is_caught(tmp_path: Path) -> None:
    def mutate(record: dict[str, Any], manifest: bytes) -> bytes:
        swapped = manifest.replace(b"family prepr-review-default", b"family architecture-default")
        record["releaseDigest"] = "sha256:" + hashlib.sha256(swapped).hexdigest()
        record["releaseReview"]["releaseDigest"] = record["releaseDigest"]
        return swapped

    result = _run_release_checker(_release_fixture(tmp_path, "family-mismatch", mutate))
    assert result.returncode != 0
    assert "record.manifest-family" in result.stderr


def test_the_live_repository_release_checker_runs_clean() -> None:
    """The real tree, whatever it currently holds."""
    result = _run_release_checker(REPO_ROOT)
    assert result.returncode == 0, result.stdout + result.stderr


def test_the_oracle_detects_a_serializer_output_defect() -> None:
    """21. B must catch a defect in A's OUTPUT, not merely react to its own input.

    Mutating the logical input and watching B's digest move proves only that B
    reads the field. The property that matters is different: given honest logical
    content, a defective serializer emits bytes B does not accept as the canonical
    form of that content.
    """
    logical = _logical("prepr-review-default")
    honest = canonical_manifest(logical)

    # An A-style output with one identity-bearing byte wrong. B is never told
    # this happened; it recomputes from the logical content and compares.
    defective = honest.replace(b"maxFreshnessDays 180", b"maxFreshnessDays 181")
    assert defective != honest, "the planted defect must actually change the bytes"

    assert canonical_manifest(logical) == honest, "B must not drift with the mutant"
    assert release_digest(logical) == "sha256:" + hashlib.sha256(honest).hexdigest()
    assert hashlib.sha256(defective).hexdigest() != hashlib.sha256(honest).hexdigest()

    # And the same for a reordering defect, which a naive serializer produces
    # easily and which must NOT change identity.
    reordered = dict(logical)
    reordered["required"] = list(reversed(logical["required"]))
    assert canonical_manifest(reordered) == honest, "ordering is normative, not incidental"


# --- A and B must agree on the accepted DOMAIN, not just the live candidates ---


def _implementation_a_accepts(logical: dict[str, Any]) -> bool:
    """Ask the package whether it can canonically serialize this logical release."""
    script = """
import { canonicalSetReleaseManifest } from '@secure-home/knowledge-toolchain'
const input = JSON.parse(process.argv[2])
const r = canonicalSetReleaseManifest(input)
process.stdout.write(r.ok ? Buffer.from(r.value).toString('base64') : 'REFUSED')
"""
    path = REPO_ROOT / ".domain-probe.mjs"
    path.write_text(script)
    try:
        out = subprocess.run(
            ["node", str(path), json.dumps(logical)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    finally:
        path.unlink(missing_ok=True)
    return out.stdout != "REFUSED"


def _implementation_a_bytes(logical: dict[str, Any]) -> bytes | None:
    script = """
import { canonicalSetReleaseManifest } from '@secure-home/knowledge-toolchain'
const input = JSON.parse(process.argv[2])
const r = canonicalSetReleaseManifest(input)
process.stdout.write(r.ok ? Buffer.from(r.value).toString('base64') : 'REFUSED')
"""
    path = REPO_ROOT / ".domain-probe.mjs"
    path.write_text(script)
    try:
        out = subprocess.run(
            ["node", str(path), json.dumps(logical)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    finally:
        path.unlink(missing_ok=True)
    if out.stdout == "REFUSED":
        return None
    import base64

    return base64.b64decode(out.stdout)


def _implementation_b_bytes(logical: dict[str, Any]) -> bytes | None:
    try:
        return canonical_manifest(logical)
    except ManifestRefusalError:
        return None


MAX_SAFE = 2**53 - 1

DOMAIN_CASES: list[tuple[str, dict[str, Any]]] = [
    ("baseline", {}),
    # NBSP is Unicode whitespace but NOT ASCII whitespace. The ADR names ASCII,
    # so the SEPARATOR rule must accept it -- a Python str.isspace() oracle would
    # refuse here. runnerClass is governed by the token rule alone, so it is
    # where that property is still visible.
    ("runnerClass with NBSP", {"runnerClass": "coding\u00a0runner"}),
    # family is different since the family-id grammar landed: NBSP is not a
    # separator, but it is not in [a-z0-9-] either, so BOTH must now refuse.
    ("family with NBSP", {"family": "demo\u00a0default"}),
    ("family with ASCII SP", {"family": "demo default"}),
    # The repository family-id grammar itself. `demo/default` matters most: a
    # slash would make the release manifest PATH ambiguous.
    ("family accepted: hyphenated", {"family": "prepr-review-default"}),
    ("family accepted: single token", {"family": "coding"}),
    ("family starting with a digit", {"family": "1demo"}),
    ("family with a leading hyphen", {"family": "-demo"}),
    ("family with an uppercase letter", {"family": "Demo"}),
    ("family with a slash", {"family": "demo/default"}),
    ("family with an underscore", {"family": "demo_default"}),
    ("family empty", {"family": ""}),
    ("family with NUL", {"family": "demo\x00default"}),
    ("family with LF", {"family": "demo\ndefault"}),
    ("family with CR", {"family": "demo\rdefault"}),
    ("maxBytes at MAX_SAFE_INTEGER", {"maxBytes": MAX_SAFE}),
    ("maxBytes above MAX_SAFE_INTEGER", {"maxBytes": MAX_SAFE + 1}),
    (
        "module id starting with a digit",
        {"required": [{"id": "1platform/one", "version": "1.0.0", "digest": "a" * 64}]},
    ),
    (
        "module id with an uppercase letter",
        {"required": [{"id": "Platform/one", "version": "1.0.0", "digest": "a" * 64}]},
    ),
    (
        "module id with a leading hyphen",
        {"required": [{"id": "-platform/one", "version": "1.0.0", "digest": "a" * 64}]},
    ),
    (
        "member version with NUL",
        {"required": [{"id": "platform/one", "version": "1.0\x000", "digest": "a" * 64}]},
    ),
    (
        "member version with LF",
        {"required": [{"id": "platform/one", "version": "1.0\n0", "digest": "a" * 64}]},
    ),
    (
        "member version with a space",
        {"required": [{"id": "platform/one", "version": "1.0 0", "digest": "a" * 64}]},
    ),
    (
        "member version with NBSP",
        {"required": [{"id": "platform/one", "version": "1.0\u00a00", "digest": "a" * 64}]},
    ),
    (
        "prefixed member digest",
        {"required": [{"id": "platform/one", "version": "1.0.0", "digest": "sha256:" + "a" * 64}]},
    ),
    (
        "uppercase member digest",
        {"required": [{"id": "platform/one", "version": "1.0.0", "digest": "A" * 64}]},
    ),
]


def _domain_input(over: dict[str, Any]) -> dict[str, Any]:
    base: dict[str, Any] = {
        "family": "demo-default",
        "version": "1.0.0",
        "runnerClass": "coding-runner",
        "allowTaskAdditions": False,
        "allowTaskNarrowing": True,
        "maxBytes": 1048576,
        "maxFreshnessDays": 180,
        "requiredFailure": "reject-run",
        "optionalFailure": "warn",
        "overrideAuthority": "profile-change-review",
        "deny": ["household/*"],
        "required": [{"id": "platform/one", "version": "1.0.0", "digest": "a" * 64}],
        "optional": [],
    }
    return {**base, **over}


@pytest.mark.parametrize(("name", "over"), DOMAIN_CASES, ids=[c[0] for c in DOMAIN_CASES])
def test_the_two_implementations_accept_the_same_domain(name: str, over: dict[str, Any]) -> None:
    """A accepts iff B accepts — and where both accept, the bytes are identical.

    Agreeing on three live candidates is not agreement on a grammar. These probe
    the boundaries where a convenience predicate in either implementation would
    silently widen or narrow the accepted domain.
    """
    logical = _domain_input(over)
    a = _implementation_a_bytes(logical)
    b = _implementation_b_bytes(logical)
    assert (a is None) == (b is None), (
        f"{name}: A {'refused' if a is None else 'accepted'} but B "
        f"{'refused' if b is None else 'accepted'}"
    )
    if a is not None and b is not None:
        assert a == b, f"{name}: both accepted but produced different bytes"


# ── the legacy set-gate authority is structurally gone ────────────────────────

SRC = REPO_ROOT / "packages" / "knowledge-toolchain" / "src"


def _exported_interfaces(source: str) -> dict[str, str]:
    """Crude but sufficient: every `export interface X {...}` body, by name."""
    out: dict[str, str] = {}
    for match in re.finditer(r"export interface (\w+) \{(.*?)\n\}", source, re.S):
        out[match.group(1)] = match.group(2)
    return out


def test_no_exported_set_resolution_api_takes_set_gate_booleans() -> None:
    """ADR-0019 §8b: release state is the ONE composition authority.

    The pre-ADR-0019 `resolveSet(set: GateState, members)` decided whether a
    COMPOSITION could be used from `blockedByToolchain` / `blockedByRollout`.
    Deleting the call sites would not be enough -- the signature must be
    impossible to write. This is the structural search that says so.
    """
    index = (SRC / "index.ts").read_text()
    for gone in ("resolveSet", "SetResolution"):
        assert gone not in index, f"{gone} is still on the public surface"

    gates = (SRC / "gates.ts").read_text()
    assert "resolveSet" not in _exported_interfaces(gates)
    # gates.ts may still DESCRIBE the removed function in prose; it must not
    # export one. Anything callable is `export const NAME =`.
    exported_values = set(re.findall(r"^export const (\w+)", gates, re.M))
    assert exported_values == {"gateRefusal", "authoringEligibility"}, exported_values

    release = (SRC / "set-release.ts").read_text()
    interfaces = _exported_interfaces(release)
    gate_fields = ("blockedByToolchain", "blockedByRollout")
    for name, body in interfaces.items():
        if any(field in body for field in gate_fields):
            # A MODULE may carry its own two gates. A set family, a release, a
            # release record, or a resolved selection may not.
            assert name == "MemberCandidate", (
                f"{name} declares module gate fields; only a module candidate may"
            )
    assert any(f in interfaces["MemberCandidate"] for f in gate_fields), (
        "module gate semantics must be PRESERVED, not removed along with the set gate"
    )

    # And the release-side resolution entry point takes a state, not a gate pair.
    signature = re.search(
        r"export const resolveReleaseMembers = \((.*?)\): ReleaseResolution", release, re.S
    )
    assert signature is not None, "resolveReleaseMembers must exist"
    params = signature.group(1)
    assert "ReleaseState" in params
    for field in gate_fields:
        assert field not in params, f"resolveReleaseMembers accepts {field} at the set level"


def test_module_gate_semantics_survive_the_refactor() -> None:
    """The set gate went away. The MODULE gates are ADR-0016 and must not."""
    gates = (SRC / "gates.ts").read_text()
    for kept in ("blockedByToolchain", "blockedByRollout", "authoringEligibility"):
        assert kept in gates, f"{kept} was lost in the refactor"
    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    for module in catalog["modules"]:
        assert "blockedByToolchain" in module and "blockedByRollout" in module, module["id"]


# ── the initial human-reviewed releases, pinned as HISTORY ────────────────────
#
# These three identities were approved by a human under
# knowledge-set-release-review-v1 on 2026-08-22. An immutable release is only
# immutable if something notices when it moves, so each is pinned here by exact
# digest.
#
# What is pinned is IDENTITY, not lifecycle. `state` is deliberately mutable
# (Released -> Deprecated -> Retired) and is asserted separately, so deprecating
# one of these later is a governed act rather than a test failure.

HISTORICAL_RELEASES: dict[str, str] = {
    "prepr-review-default": (
        "sha256:6a7b9492d2dfcb9b14ce4adc4851510ca6fbad6fad59eaaeaa4d070b0f736cf7"
    ),
    "implement-local-default": (
        "sha256:b609d4a06c816f9f451e8a6fec9e759741ab4d469846dcf3806d721c7f47e336"
    ),
    "architecture-default": (
        "sha256:f3adc66f39d5e8586cc2d83cec4076ea12f8341280608c4022e5427d6ea0850c"
    ),
}
HISTORICAL_BYTES: dict[str, int] = {
    "prepr-review-default": 925,
    "implement-local-default": 1154,
    "architecture-default": 867,
}


def _registry() -> dict[str, Any]:
    parsed: dict[str, Any] = json.loads((REPO_ROOT / "knowledge" / "set-releases.json").read_text())
    return parsed


@pytest.mark.parametrize("family_id", sorted(HISTORICAL_RELEASES))
def test_a_human_reviewed_release_identity_survives_forever(family_id: str) -> None:
    """The identity a human approved must still resolve to the same bytes.

    Deliberately NOT `len(releases) == 3`: future releases are legitimate. This
    asserts persistence of these identities, which no later release can disturb.
    """
    expected_digest = HISTORICAL_RELEASES[family_id]
    matches = [r for r in _registry()["releases"] if r["familyId"] == family_id]
    versions = [r for r in matches if r["version"] == "1.0.0"]
    assert len(versions) == 1, f"{family_id}@1.0.0 resolves to {len(versions)} records"
    record = versions[0]

    assert record["version"] == "1.0.0"
    assert record["manifestPath"] == f"knowledge/releases/{family_id}@1.0.0.manifest"
    assert record["releaseDigest"] == expected_digest

    path = REPO_ROOT / record["manifestPath"]
    assert path.is_file() and not path.is_symlink(), record["manifestPath"]
    raw = path.read_bytes()
    assert len(raw) == HISTORICAL_BYTES[family_id]
    assert "sha256:" + hashlib.sha256(raw).hexdigest() == expected_digest, (
        f"{family_id}@1.0.0 manifest bytes changed; an immutable release was edited"
    )

    review = record["releaseReview"]
    assert review["policy"] == "knowledge-set-release-review-v1"
    assert review["by"] == "human:mikegtech"
    # Non-circular: the review binds the digest of the bytes it reviewed.
    assert review["releaseDigest"] == expected_digest
    # state is NOT asserted here -- see the landing test below.
    assert "state" in record


def test_implementation_b_still_reproduces_every_historical_manifest() -> None:
    """A stored manifest is only trustworthy if B rebuilds it from the catalog.

    If a catalog member were edited under a landed release, A would rebuild
    different bytes and this would fail -- which is the point.
    """
    for family_id in HISTORICAL_RELEASES:
        stored = (REPO_ROOT / "knowledge" / "releases" / f"{family_id}@1.0.0.manifest").read_bytes()
        assert canonical_manifest(_logical(family_id)) == stored, family_id
        assert release_digest(_logical(family_id)) == HISTORICAL_RELEASES[family_id], family_id


def test_the_three_initial_releases_landed_as_released() -> None:
    """Current lifecycle, kept apart from immutable identity on purpose."""
    by_family = {r["familyId"]: r for r in _registry()["releases"] if r["version"] == "1.0.0"}
    for family_id in HISTORICAL_RELEASES:
        assert by_family[family_id]["state"] == "Released", family_id


def test_no_household_family_is_released() -> None:
    """The coding releases confer nothing on household families."""
    catalog = _catalog()
    household = {s["id"] for s in catalog["sets"] if s["runnerClass"] != "coding-runner"}
    assert household, "expected household families to exist"
    for record in _registry()["releases"]:
        assert record["familyId"] not in household, record["familyId"]


@pytest.mark.parametrize(
    "family_id", ["home-status-default", "climate-default", "gridwise-default"]
)
def test_a_household_family_still_refuses_to_build_a_candidate(family_id: str) -> None:
    """The negative control, re-run after the landing.

    It must still refuse through the selected-MEMBER precondition mechanism --
    naming each blocking module -- rather than through a family-level label.
    """
    script = """
import { buildSetReleaseCandidate } from '@secure-home/knowledge-toolchain'
import catalog from './knowledge/catalog.json' with { type: 'json' }
const f = catalog.sets.find((s) => s.id === process.argv[2])
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
process.stdout.write(JSON.stringify(r.ok ? { ok: true } : { refusals: r.refusals }))
"""
    path = REPO_ROOT / ".household-control-probe.mjs"
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
    result = json.loads(out.stdout)
    assert "refusals" in result, f"{family_id} built a candidate; it must refuse"
    rules = {r["rule"] for r in result["refusals"]}
    # Member-level, not family-level: the refusal must name what actually blocks.
    # There is no family-level "household is blocked" rule to hide behind.
    assert all(r.startswith("release.member-") for r in rules), rules
    details = " ".join(r["detail"] for r in result["refusals"])
    assert "household/" in details, details


# ── the tracked-binary exemption is narrow and fails closed ───────────────────
#
# ADR-0019 section 4 fixes NUL as the member field delimiter, so every canonical
# release manifest is binary to git, and scripts/validate-scaffold.sh forbids
# tracked binaries because the secret scanner cannot inspect them. The owner
# took a reviewed decision on 2026-08-22 to exempt REGISTERED release manifests,
# on the ground that they are verified by digest rather than by pattern matching.
#
# An exemption nobody tests is a hole. These prove it stays narrow: a glob-only
# exemption would let an unregistered blob inherit it, and a tampered manifest
# must still be caught by the mechanism the exemption points at.


def _scaffold_binary_section() -> str:
    return (REPO_ROOT / "scripts" / "validate-scaffold.sh").read_text()


def test_the_binary_exemption_requires_registration_not_just_a_path() -> None:
    """A path glob alone would exempt any blob dropped into the directory."""
    source = _scaffold_binary_section()
    assert "knowledge/releases/*@*.manifest" in source, "the exemption must be path-scoped"
    # Registration is what makes it validated rather than blanket.
    assert "grep -qF" in source and "set-releases.json" in source, (
        "an exempt manifest must also be registered; a glob-only exemption is a hole"
    )


def test_a_tampered_registered_manifest_is_still_caught() -> None:
    """The exemption's justification, exercised rather than asserted.

    The scaffold check stops inspecting these files. What replaces it is the
    digest: appending a secret-shaped value to a landed manifest must fail the
    live checker, because the bytes no longer hash to the reviewed digest.
    """
    family_id = "prepr-review-default"
    path = REPO_ROOT / "knowledge" / "releases" / f"{family_id}@1.0.0.manifest"
    original = path.read_bytes()

    def check() -> str:
        result = subprocess.run(
            ["node", "scripts/check-set-releases.mjs"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0, "a tampered release manifest passed the live checker"
        return result.stdout + result.stderr

    # Two distinct tampers, refused for two distinct and correct reasons. Naming
    # only one would let the other class through while the test still passed.
    try:
        # (a) appending a secret-shaped value breaks canonical form first.
        # Assembled at runtime so no key-shaped literal exists in this file --
        # scan-secrets.sh is right to flag one, and the fix is construction
        # rather than an allowlist entry that would dull a working scanner.
        secret_shaped = b"AKIA" + b"IOSFODNN7EXAMPLE"
        path.write_bytes(original + secret_shaped + b"\x00\n")
        assert "manifest.row" in check()

        # (b) a tamper that KEEPS the file canonical is caught by the digest --
        # which is the guarantee the scaffold exemption actually rests on.
        assert b"maxFreshnessDays 180\n" in original
        path.write_bytes(original.replace(b"maxFreshnessDays 180\n", b"maxFreshnessDays 181\n"))
        assert "record.digest" in check()
    finally:
        path.write_bytes(original)
    assert path.read_bytes() == original
