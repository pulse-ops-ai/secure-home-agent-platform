"""Tests for ``scripts/check-knowledge-content.mjs`` — real content through admission.

The knowledge toolchain was well tested and never invoked. Every rule lived in
``packages/knowledge-toolchain`` behind a conformance suite, and nothing in CI
ever handed it a file from this repository. A proven library and an unproven
repository are different things, and these tests are about the second one.

**They also prove the adapter has no rules of its own.** Each negative asserts
the EXACT rule identifier the package emits — ``execution.runtime``,
``attestation.digest.binding``, a named indicator. Parallel logic in the adapter
could not produce those strings by accident, so a passing negative is evidence
of delegation rather than a claim of it.

The Proof A digest is computed here by an INDEPENDENT ORACLE, rebuilt from the
identity rule in ADR-0015 §6 rather than by calling the implementation under
test. Asking the package for the digest and then feeding it back would prove
only that a function equals itself.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from typing import TypedDict

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT_CHECK = REPO_ROOT / "scripts" / "check-knowledge-content.mjs"

OWNER = "human:mikegtech"
AS_OF = "2026-08-01"
GOVERNS = "docs/decisions/ADR-0016-hybrid-admission-assurance-for-prohibited-content.md"
POLICY = "portable-knowledge-prohibited-content-v1"

INDEX_MD = '---\nokf_version: "0.2"\n---\n\n# Bundle\n'


def _concept(**overrides: str) -> str:
    fields = {
        "type": "model",
        "owner": OWNER,
        "as_of": AS_OF,
        "limitations": "Describes the model only.",
        "status": "draft",
        "stale_after": "2027-01-01",
        "governs": GOVERNS,
        **overrides,
    }
    body = "\n".join(f"{k}: {v}" for k, v in fields.items())
    return (
        f"---\n{body}\ngenerated:\n  by: {OWNER}\n  at: 2026-08-01T00:00:00Z\n"
        "---\n\n# A concept\n\nProse.\n"
    )


def _bundle_digest(members: dict[str, bytes]) -> str:
    """ADR-0015 §6, rebuilt from the specification.

    manifest_bytes := "okf-package-v1" LF ( <nfc-path> NUL <sha256-hex> LF )*
                      sorted by the UTF-8 bytes of the path
    bundle_digest  := sha256(manifest_bytes)
    """
    manifest = b"okf-package-v1\n"
    for path in sorted(members, key=lambda p: p.encode("utf-8")):
        digest = hashlib.sha256(members[path]).hexdigest().encode("ascii")
        manifest += path.encode("utf-8") + b"\x00" + digest + b"\n"
    return hashlib.sha256(manifest).hexdigest()


class Repo:
    """A repository laid out the way the real one is."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.modules: list[dict[str, object]] = []
        (root / "knowledge").mkdir(parents=True, exist_ok=True)
        governs = root / GOVERNS
        governs.parent.mkdir(parents=True, exist_ok=True)
        governs.write_text("# ADR\n")

    def module(
        self,
        module_id: str = "platform/example",
        *,
        sources: dict[str, str] | None = None,
        toolchain: bool = False,
        rollout: bool = False,
        digest_override: str | None = None,
        owner: str = OWNER,
        status: str | None = None,
        stale_source: bool = False,
    ) -> Repo:
        directory = self.root / "knowledge" / module_id
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "README.md").write_text(f"# {module_id}\n\nSpecification only.\n")

        members: dict[str, bytes] = {}
        for name, text in (sources or {}).items():
            path = directory / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            members[name] = text.encode("utf-8")

        if stale_source:
            # The attestation was established over THESE bytes; the file is then
            # edited. Proof A must catch the drift before packaging can claim
            # anything, which is what test G proves.
            extra = "\nEdited after review.\n"
            assert sources is not None
            (directory / "model.md").write_text(sources["model.md"] + extra)

        # A fixture that carries source is Source-ready unless the test is
        # specifically about a different claim. Defaulting to Planned would make
        # every content fixture fail rule A for a reason it is not testing.
        resolved_status = (
            status if status is not None else ("Source-ready" if members else "Planned")
        )

        entry: dict[str, object] = {
            "id": module_id,
            "status": resolved_status,
            "owner": owner,
            "asOf": AS_OF,
            "limitations": "Describes the model only.",
            "governingSources": [GOVERNS],
            "blockedByToolchain": toolchain,
            "blockedByRollout": rollout,
        }
        if members:
            entry["contentReview"] = {
                "policy": POLICY,
                "by": owner,
                "at": "2026-08-02T00:00:00Z",
                "sourceDigest": digest_override or f"sha256:{_bundle_digest(members)}",
            }
        self.modules.append(entry)
        return self

    def write(self) -> Repo:
        catalog = {"modules": self.modules, "sets": []}
        (self.root / "knowledge" / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")
        return self


def _reviewed_digest(repo: Repo) -> str:
    """The hex of the fixture's Proof A binding, typed for mypy."""
    review = repo.modules[0]["contentReview"]
    assert isinstance(review, dict)
    digest = review["sourceDigest"]
    assert isinstance(digest, str)
    return digest.split(":", 1)[1]


def _valid_sources(**overrides: str) -> dict[str, str]:
    return {"index.md": INDEX_MD, "model.md": _concept(**overrides)}


PACKAGE_DIST = REPO_ROOT / "node_modules" / "@secure-home" / "knowledge-toolchain" / "dist"


def _require_built_package() -> None:
    """Fail loudly, never skip, when the package has not been built.

    The adapter imports the published export, so `dist/` is a real prerequisite
    of these tests. A missing build otherwise surfaces as ERR_MODULE_NOT_FOUND
    inside every assertion, which reads like broken tests instead of an unbuilt
    dependency — and skipping would be worse: a governance test that quietly
    does not run is not a governance test.
    """
    assert (PACKAGE_DIST / "index.js").exists(), (
        "packages/knowledge-toolchain is not built — run "
        "`pnpm --filter @secure-home/knowledge-toolchain run build` first. "
        "Every job that runs this suite must build it."
    )


def _run(root: Path) -> subprocess.CompletedProcess[str]:
    _require_built_package()
    return subprocess.run(
        ["node", str(CONTENT_CHECK), str(root)],
        capture_output=True,
        text=True,
        check=False,
        cwd=REPO_ROOT,
    )


def _output(result: subprocess.CompletedProcess[str]) -> str:
    return result.stdout + result.stderr


# --- controls ---------------------------------------------------------------


def test_the_live_repository_admits_its_authored_content() -> None:
    """The real repository, through the real toolchain.

    `platform/runner-model` is authored, so this is no longer a no-content
    control: it is the first module whose exact repository bytes pass canonical
    admission, with a human content review bound to those bytes.
    """
    result = _run(REPO_ROOT)
    assert result.returncode == 0, _output(result)
    assert "module(s) admitted" in _output(result)


def test_a_repository_with_no_authored_modules_passes(tmp_path: Path) -> None:
    Repo(tmp_path / "repo").module().write()
    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)


def test_a_readme_alone_is_specification_not_bundle_source(tmp_path: Path) -> None:
    """The convention, stated as a test: a module README is never a member.

    If README.md were enumerated as source it would fail admission immediately
    (no OKF frontmatter), so a passing run is the proof it was excluded.
    """
    Repo(tmp_path / "repo").module().write()
    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)
    assert "no authored module source" in _output(result)


# --- the valid authored module ----------------------------------------------


def test_a_valid_authored_module_is_admitted(tmp_path: Path) -> None:
    """Eligible gates, valid OKF source, catalog/frontmatter mirror, valid Proof A."""
    Repo(tmp_path / "repo").module(sources=_valid_sources()).write()
    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)
    assert "1 module(s) admitted" in _output(result)


def test_absent_proof_b_is_not_an_admission_failure(tmp_path: Path) -> None:
    """`publishable: false` / `proof_b_unavailable` is the NORMAL outcome.

    No Proof B producer exists by accepted design (ADR-0016 §5a). Treating its
    absence as an admission failure would make every module unadmittable and
    would misreport which of the two stages actually blocked.
    """
    Repo(tmp_path / "repo").module(sources=_valid_sources()).write()
    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)
    assert "proof_b" not in _output(result).lower()


def test_nested_source_is_enumerated_by_module_relative_path(tmp_path: Path) -> None:
    sources = _valid_sources()
    sources["group/nested.md"] = _concept()
    Repo(tmp_path / "repo").module(sources=sources).write()
    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)


# --- negatives: the package's rules, reported by the adapter ----------------


def test_an_execution_bearing_field_fails_the_repository_command(tmp_path: Path) -> None:
    Repo(tmp_path / "repo").module(sources=_valid_sources(runtime="wasm")).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0, "execution-bearing content must fail the gate"
    assert "execution.runtime" in _output(result)


def test_an_attested_computation_type_fails(tmp_path: Path) -> None:
    sources = {"index.md": INDEX_MD, "model.md": _concept(type='"Attested Computation"')}
    Repo(tmp_path / "repo").module(sources=sources).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "execution.attested-computation" in _output(result)


def test_a_prohibited_content_indicator_fails(tmp_path: Path) -> None:
    """One B indicator, named exactly as `indicators.ts` declares it."""
    sources = _valid_sources()
    # Assembled rather than written literally, so the repository secret
    # scanner does not report its own fixture — the same construction
    # `conformance.test.ts` uses. The scan is not weakened: a real PEM
    # block in tracked source is still a finding.
    pem = " ".join(["-----BEGIN", "RSA", "PRIVATE", "KEY-----"])
    sources["model.md"] += f"\n{pem}\n"
    Repo(tmp_path / "repo").module(sources=sources).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0, "a B indicator must fail the gate"
    assert "secret.pem-block" in _output(result)


def test_a_stale_proof_a_digest_fails_on_the_binding_rule(tmp_path: Path) -> None:
    Repo(tmp_path / "repo").module(
        sources=_valid_sources(), digest_override="sha256:" + "0" * 64
    ).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0, "an attestation that binds other bytes must fail"
    assert "attestation.digest.binding" in _output(result)


def test_the_github_display_owner_fails_the_actor_rule(tmp_path: Path) -> None:
    """The live catalog used `@mikegtech`; admission requires `human:<id>`."""
    sources = {"index.md": INDEX_MD, "model.md": _concept(owner='"@mikegtech"')}
    Repo(tmp_path / "repo").module(sources=sources, owner="@mikegtech").write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "profile.owner.actor" in _output(result)


# --- fail closed on anything that is not a regular file ---------------------


def test_a_symlink_member_is_refused_rather_than_followed(tmp_path: Path) -> None:
    """Following it would make repository layout an authority over admission."""
    repo = Repo(tmp_path / "repo").module(sources=_valid_sources())
    outside = tmp_path / "outside.md"
    outside.write_text(_concept())
    link = tmp_path / "repo" / "knowledge" / "platform" / "example" / "linked.md"
    link.symlink_to(outside)
    repo.write()

    result = _run(tmp_path / "repo")
    assert result.returncode != 0, "a symlink member must fail closed"
    assert "not a regular file" in _output(result)


# --- the gates, which precede admission -------------------------------------


def test_authored_source_under_the_toolchain_gate_is_refused(tmp_path: Path) -> None:
    """Still enforced for any entry carrying the gate, though none now does."""
    Repo(tmp_path / "repo").module(sources=_valid_sources(), toolchain=True).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "refused by toolchain" in _output(result)


def test_authored_source_under_the_rollout_gate_is_still_refused(tmp_path: Path) -> None:
    """THE NEXT STATE, proven supportable without entering it.

    Once `blockedByToolchain` is discharged, `blockedByRollout` must still hold
    the modules that are not rolled out. If discharging one gate released
    everything, the two gates would never have been independent.
    """
    Repo(tmp_path / "repo").module(sources=_valid_sources(), toolchain=False, rollout=True).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "refused by rollout" in _output(result)


def test_both_gates_open_lets_the_content_be_evaluated(tmp_path: Path) -> None:
    """The other half of the next state: eligible source is actually admitted."""
    Repo(tmp_path / "repo").module(sources=_valid_sources(), toolchain=False, rollout=False).write()
    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)
    assert "1 module(s) admitted" in _output(result)


def test_gate_refusal_precedes_content_refusal(tmp_path: Path) -> None:
    """A closed gate is reported as a gate, not as a content finding.

    Otherwise a module could look like a content problem when the real answer is
    that it was never eligible to be authored.
    """
    Repo(tmp_path / "repo").module(sources=_valid_sources(runtime="wasm"), toolchain=True).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "refused by toolchain" in _output(result)
    assert "execution.runtime" not in _output(result)


# --- the merge-gate wiring --------------------------------------------------
#
# A gate that exists but does not run is not a gate. These assert the command is
# reachable by ONE canonical name and that it runs unconditionally, because the
# change shape that most needs content admission — one touching only
# `knowledge/**` — is exactly the one an affected-target classifier would let
# select no TypeScript target at all.


def test_the_repository_exposes_one_canonical_content_command() -> None:
    manifest = json.loads((REPO_ROOT / "package.json").read_text())
    script = manifest["scripts"]["check:knowledge-content"]
    assert "check-knowledge-content.mjs" in script


def test_the_aggregate_check_runs_content_admission() -> None:
    check_sh = (REPO_ROOT / "scripts" / "check.sh").read_text()
    assert "check:knowledge-content" in check_sh, (
        "scripts/check.sh is the aggregate gate; content admission must be in it"
    )


def test_ci_runs_content_admission_unconditionally() -> None:
    """It must live in a GOVERNANCE-UNCONDITIONAL job, with no job-level `if`."""
    from workflow_model import governance_jobs, has_condition

    jobs = governance_jobs()
    hosting = {name: body for name, body in jobs.items() if "check:knowledge-content" in body}
    assert hosting, (
        "no governance-unconditional job runs content admission — behind the "
        "classifier, a knowledge-only change could skip it"
    )
    for name, body in hosting.items():
        assert not has_condition(body), f"{name} is path-gated, so admission is not unconditional"


def test_ci_builds_the_package_before_invoking_it() -> None:
    """The adapter calls the published export, so the export must exist first."""
    from workflow_model import governance_jobs

    body = next(b for b in governance_jobs().values() if "check:knowledge-content" in b)
    build = body.index("knowledge-toolchain run build")
    invoke = body.index("check:knowledge-content")
    assert build < invoke, "the toolchain must be built before the adapter imports it"


def test_the_registry_checker_and_the_content_checker_are_different_gates() -> None:
    """`check-knowledge.mjs` stays the registry/scaffold checker.

    Collapsing them would leave one command claiming two properties, and the
    weaker one would be assumed for both.
    """
    registry = (REPO_ROOT / "scripts" / "check-knowledge.mjs").read_text()
    assert "admit(" not in registry, "the registry checker must not re-implement admission"
    content = (REPO_ROOT / "scripts" / "check-knowledge-content.mjs").read_text()
    assert "@secure-home/knowledge-toolchain" in content


# --- single admission authority ---------------------------------------------


def test_the_adapter_owns_no_content_rules() -> None:
    """The rules live in the package, exactly once.

    A second implementation here would not be a safety net; it would be a second
    answer, and the two would drift. This is a structural check to go with the
    behavioural ones above: the negatives assert the package's exact rule
    identifiers, which parallel logic could not produce by accident.
    """
    source = (REPO_ROOT / "scripts" / "check-knowledge-content.mjs").read_text()
    code = "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith(("*", "/*", "//"))
    )
    for owned_elsewhere in (
        "execution.",
        "attestation.",
        "reference.",
        "envelope.",
        "okf-package-v1",
        "createHash",
        "BEGIN RSA",
    ):
        assert owned_elsewhere not in code, (
            f"{owned_elsewhere!r} appears in the adapter — that rule belongs to "
            "packages/knowledge-toolchain and must be owned exactly once"
        )


# --- the next state, proven supportable without entering it -----------------


def test_the_readme_only_rule_is_scoped_to_the_toolchain_gate(tmp_path: Path) -> None:
    """Registry/scaffold must PERMIT candidate source once the gate is open.

    The run still fails — `blockedByToolchain` may not be false in the live
    catalog without a governed decision, and that rule is untouched. What must
    not appear is the specification-only finding: with the gate open, authored
    source is what belongs in the directory, and content rules are the content
    command's to apply. Asserting on the message rather than the exit code is
    how this proves one rule moved without relaxing the other.
    """
    root = tmp_path / "repo"
    (root / "knowledge" / "platform" / "example").mkdir(parents=True)
    (root / "knowledge" / "platform" / "example" / "README.md").write_text("# x\n")
    (root / "knowledge" / "platform" / "example" / "model.md").write_text(_concept())
    (root / "knowledge" / "catalog.json").write_text(
        json.dumps(
            {
                "modules": [
                    {
                        "id": "platform/example",
                        "owner": OWNER,
                        "blockedByToolchain": False,
                        "blockedByRollout": False,
                    }
                ],
                "sets": [],
            },
            indent=2,
        )
        + "\n"
    )

    result = subprocess.run(
        ["node", str(REPO_ROOT / "scripts" / "check-knowledge.mjs"), str(root)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert "only README.md is permitted" not in _output(result), (
        "with the toolchain gate open, candidate source must be permitted by the registry"
    )


def test_the_live_gates_are_exactly_what_the_discharge_intended() -> None:
    """Readiness discharged for all 23; rollout untouched.

    The discharge landing changed one gate. If it had released everything, the
    two gates were never independent — so the rollout distribution is asserted
    as part of the same fact rather than as a separate courtesy.
    """
    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    entries = [*catalog["modules"], *catalog["sets"]]
    assert len(entries) == 23
    assert all(e["blockedByToolchain"] is False for e in entries)

    eligible = sorted(
        e["id"] for e in entries if not e["blockedByToolchain"] and not e["blockedByRollout"]
    )
    assert len(eligible) == 10 and all(i.startswith("platform/") for i in eligible), eligible
    assert len([e for e in entries if e["blockedByRollout"] is True]) == 13


# --- live catalog / profile contract alignment ------------------------------


def test_every_live_owner_is_a_human_actor() -> None:
    """ADR-0015 §5 requires `human:<id>` for a module owner.

    The live catalog carried the GitHub display form `@mikegtech`, which
    admission refuses — so the registry described modules that could never have
    been admitted. This is metadata representation aligned to the accepted
    convention, not a change of authority: the same person owns the same
    modules, named the way the contract names actors.
    """
    import re

    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    entries = [*catalog["modules"], *catalog["sets"]]
    assert len(entries) == 23
    for entry in entries:
        assert re.fullmatch(r"human:[A-Za-z0-9._-]+", entry["owner"]), (
            f"{entry['id']}: owner {entry['owner']!r} is not a human actor"
        )


def test_the_readme_registry_rows_mirror_the_migrated_owner() -> None:
    """The prose view must not drift from the machine-readable one."""
    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    owners = {m["id"]: m["owner"] for m in catalog["modules"]}
    checked = 0
    for module_id, owner in owners.items():
        readme = REPO_ROOT / "knowledge" / module_id / "README.md"
        if not readme.exists():
            continue
        text = readme.read_text()
        assert f"| Owner | {owner} |" in text, f"{module_id}: README owner row is stale"
        assert "| Owner | @" not in text, f"{module_id}: README still uses the display form"
        checked += 1
    assert checked == 17, f"expected 17 module READMEs, checked {checked}"


def test_every_job_running_this_suite_builds_the_toolchain() -> None:
    """The defect this test exists for actually happened.

    The governance job built the toolchain and the classifier job did not — but
    both run the governance suite, and the suite invokes the adapter, which
    imports the built package. CI failed on ERR_MODULE_NOT_FOUND in sixteen
    tests while the same suite passed locally, because `dist/` was already there.

    A build prerequisite that only some jobs satisfy is a prerequisite nobody is
    tracking, so it is asserted here rather than remembered.
    """
    from workflow_model import job_sections

    for name, body in job_sections().items():
        if "uv run pytest" not in body:
            continue
        assert "knowledge-toolchain run build" in body, (
            f"{name} runs the governance suite but never builds the toolchain the suite invokes"
        )


# --- no silent skip directory in module enumeration -------------------------
#
# P0. `authoredFiles` shared a SKIP_DIRS set with the repository-wide traversal,
# so a directory named `dist/` (or `node_modules/`, `build/`, `.git/`, …) under a
# module was never enumerated. Content placed there would never reach `admit()`
# — an admission bypass that opens the moment the toolchain gate does, and one
# that reads as a build convention rather than as a hole.
#
# The two traversals answer different questions and must not share an exclusion
# policy. "Where may a `governs` reference resolve?" legitimately ignores
# generated output. "What is this module's content?" may not: the convention
# says every regular file below the module except the root README is candidate
# source, and that sentence has to be true.

HIDEABLE = ["dist", "node_modules", "build", "out", "coverage", ".turbo", ".git"]


def test_content_cannot_hide_in_a_conventionally_skipped_directory(tmp_path: Path) -> None:
    """Parameterised, so this is not a one-name-only proof."""
    for index, directory in enumerate(HIDEABLE):
        sources = _valid_sources()
        # Package-REJECTED source: it must produce the package's own refusal.
        sources[f"{directory}/model.md"] = _concept(runtime="wasm")
        Repo(tmp_path / f"repo-{index}").module(sources=sources).write()

        result = _run(tmp_path / f"repo-{index}")
        assert result.returncode != 0, (
            f"content under {directory}/ never reached admission — the module "
            "enumeration skipped the directory"
        )
        assert "execution.runtime" in _output(result), (
            f"the package's refusal must reach the output for {directory}/"
        )


def test_a_hidden_directory_member_keeps_its_module_relative_path(tmp_path: Path) -> None:
    """It is enumerated as ordinary content, not specially named."""
    sources = _valid_sources()
    sources["dist/model.md"] = _concept(runtime="wasm")
    Repo(tmp_path / "repo").module(sources=sources).write()
    result = _run(tmp_path / "repo")
    assert "dist/model.md" in _output(result), "the member must be addressed by its path"


def test_a_symlink_inside_a_previously_skipped_directory_still_fails_closed(
    tmp_path: Path,
) -> None:
    repo = Repo(tmp_path / "repo").module(sources=_valid_sources())
    outside = tmp_path / "outside.md"
    outside.write_text(_concept())
    hidden = tmp_path / "repo" / "knowledge" / "platform" / "example" / "dist"
    hidden.mkdir(parents=True)
    (hidden / "linked.md").symlink_to(outside)
    repo.write()

    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "not a regular file" in _output(result)


# --- lifecycle status must be EARNED, not claimed -------------------------------
#
# A catalog status was a coordinated prose/metadata claim: nothing tied
# `Validated` to admission having actually run, or `Packaged` to a package having
# actually been produced. These prove each claim is backed by the real mechanism.
#
# The checker VALIDATES a claimed status. It never promotes one — lifecycle
# transitions stay explicit reviewed catalog changes.


def test_planned_with_authored_source_fails(tmp_path: Path) -> None:
    """A: the registry says no source exists, and source exists."""
    Repo(tmp_path / "repo").module(sources=_valid_sources(), status="Planned").write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0, "Planned must not coexist with authored source"
    assert "Planned" in _output(result)
    assert "authored source" in _output(result)


def test_a_source_claiming_status_without_source_fails(tmp_path: Path) -> None:
    """B and C: the lifecycle claims content that has no bytes behind it."""
    for status in ("Source-ready", "Validated", "Packaged", "Published"):
        Repo(tmp_path / f"repo-{status}").module(status=status).write()
        result = _run(tmp_path / f"repo-{status}")
        assert result.returncode != 0, f"{status} without source must fail"
        assert "no authored source" in _output(result), status


def test_validated_with_valid_source_reports_admission_evidence(tmp_path: Path) -> None:
    """D: admission actually ran, and its exact byte identity is reported."""
    repo = Repo(tmp_path / "repo").module(sources=_valid_sources(), status="Validated")
    digest = _reviewed_digest(repo)
    repo.write()

    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)
    assert "Validated" in _output(result)
    assert digest in _output(result), "the admitted byte identity must be reported"


def test_validated_with_refused_source_fails_on_the_packages_own_rule(tmp_path: Path) -> None:
    """E: the refusal is the package's exact rule, never a lifecycle proxy."""
    Repo(tmp_path / "repo").module(
        sources=_valid_sources(runtime="wasm"), status="Validated"
    ).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "execution.runtime" in _output(result), "the package's rule, not a proxy"


def test_packaged_runs_packagebundle_and_reports_a_package_identity(tmp_path: Path) -> None:
    """F: packaging actually happened, and its identity is the reviewed identity.

    The equality proved here is the whole point of reusing the existing digest:

        human review exact-byte binding
            == admitted byte identity
            == package identity
    """
    repo = Repo(tmp_path / "repo").module(sources=_valid_sources(), status="Packaged")
    reviewed = _reviewed_digest(repo)
    repo.write()

    result = _run(tmp_path / "repo")
    assert result.returncode == 0, _output(result)
    assert "Packaged" in _output(result)
    assert "package " + reviewed in _output(result), (
        "the package digest must equal the reviewed/admitted byte identity"
    )
    # These DESCRIBE the artifact; they do not prove it was produced. A forgery
    # carrying the catalog's digest, the real member array, and a zero-length
    # manifest satisfies all of them. Invocation is proven separately, by
    # `test_packaged_actually_invokes_packagebundle_with_the_admission_proof`.
    assert "2 members" in _output(result)


def test_packaged_with_source_edited_after_review_fails_before_packaging(
    tmp_path: Path,
) -> None:
    """G: Proof A's exact-byte binding catches the drift first."""
    Repo(tmp_path / "repo").module(
        sources=_valid_sources(), status="Packaged", stale_source=True
    ).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "attestation.digest.binding" in _output(result)
    assert "package " not in _output(result), "packaging must not have established anything"


def test_published_stays_refused_without_proof_b(tmp_path: Path) -> None:
    """H: successful admission and packaging do not imply publication."""
    Repo(tmp_path / "repo").module(sources=_valid_sources(), status="Published").write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0, "Published must remain unreachable"
    out = _output(result)
    assert "Proof B" in out or "proof_b" in out.lower()


def test_the_live_authored_set_is_exactly_what_the_registry_claims(tmp_path: Path) -> None:
    """I: authoring has begun, and the two descriptions still agree.

    Asserting a frozen count would have to be edited on every future authoring
    landing, which makes it a chore rather than a check. What is asserted is the
    property: the modules with authored source are exactly the modules whose
    status claims content, every authored module is rollout-eligible, and no set
    has been released.
    """
    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    modules = catalog["modules"]
    assert len(modules) == 17

    authored = [
        m
        for m in modules
        if sorted(p.name for p in (REPO_ROOT / "knowledge" / m["id"]).iterdir()) != ["README.md"]
    ]
    claiming = [m for m in modules if m["status"] in {"Source-ready", "Validated", "Packaged"}]
    assert [m["id"] for m in authored] == [m["id"] for m in claiming]

    for m in authored:
        assert m["blockedByToolchain"] is False and m["blockedByRollout"] is False, m["id"]
        assert m["id"].startswith("platform/"), m["id"]

    assert all(s["status"] == "Planned" for s in catalog["sets"]), "no set is released"
    assert not any(m["status"] == "Published" for m in modules), "nothing is published"

    result = _run(REPO_ROOT)
    assert result.returncode == 0, _output(result)


class Spy(TypedDict):
    calls: int
    argTypes: list[str]
    problems: list[str]
    evidence: list[dict[str, object]]


def _spy_packaging(root: Path) -> Spy:
    """Run the checker with a SPY WRAPPING THE REAL packageBundle.

    This is the only thing that proves packaging ran. Reporting the artifact's
    digest, member count, and manifest size proved nothing: a fabricated object
    can produce all three. Invocation is the fact.

    The spy delegates to the real `packageBundle`, so a checker that passed
    anything other than the genuine admission proof would be refused by
    `openAdmitted` and the run would throw — which is the second half of the
    proof, and why the spy does not simply return a stub.
    """
    script = """
import { checkKnowledgeContent } from './scripts/check-knowledge-content.mjs'
import { packageBundle } from '@secure-home/knowledge-toolchain'

const calls = []
const spy = (proof) => {
  calls.push(typeof proof)
  return packageBundle(proof)   // the REAL one: a forged proof is refused here
}

const result = checkKnowledgeContent(process.argv[1], { packageBundle: spy })
console.log(JSON.stringify({
  calls: calls.length,
  argTypes: calls,
  problems: result.problems,
  evidence: result.evidence,
}))
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script, str(root)],
        capture_output=True,
        text=True,
        check=False,
        cwd=REPO_ROOT,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    parsed: Spy = json.loads(proc.stdout)
    return parsed


def test_packaged_actually_invokes_packagebundle_with_the_admission_proof(
    tmp_path: Path,
) -> None:
    """THE INVOCATION PROOF. A fabricated artifact cannot satisfy this.

    packageBundle must be called exactly once, and the object it receives must
    be the opaque proof `admit()` minted — established by delegating to the real
    packageBundle, which refuses a handle it did not mint.
    """
    Repo(tmp_path / "repo").module(sources=_valid_sources(), status="Packaged").write()
    seen = _spy_packaging(tmp_path / "repo")

    assert seen["problems"] == [], seen["problems"]
    assert seen["calls"] == 1, "packageBundle must be invoked exactly once for Packaged"
    assert seen["argTypes"] == ["object"], "it must receive the opaque admission proof"
    assert any("packageDigest" in e for e in seen["evidence"]), "a real artifact was produced"


def test_a_validated_claim_does_not_invoke_packaging(tmp_path: Path) -> None:
    """Control: the spy is only exercised by claims that require packaging."""
    Repo(tmp_path / "repo").module(sources=_valid_sources(), status="Validated").write()
    seen = _spy_packaging(tmp_path / "repo")
    assert seen["problems"] == [], seen["problems"]
    assert seen["calls"] == 0, "Validated does not package"


def test_a_closed_rollout_gate_is_reported_even_when_status_also_mismatches(
    tmp_path: Path,
) -> None:
    """Gate precedence: the weaker finding must not hide the stronger one.

    `Planned` with authored source under a closed rollout is two problems, and
    the one that matters is that the module was never eligible to be authored.
    Reporting only the status mismatch would send a reader to fix the catalog
    status, which is the wrong repair.
    """
    Repo(tmp_path / "repo").module(sources=_valid_sources(), status="Planned", rollout=True).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    out = _output(result)
    assert "refused by rollout" in out, "the authoring gate must be reported"
    assert "claims no authored source" not in out, (
        "the status mismatch must not replace the gate reason"
    )


# --- the first validated module, proven against the real mechanism -------------

REVIEWED_DIGEST = "sha256:e738f985db0ab56611f5fe3dc40e7324e4a699dd18c8e56adf9f2f87204004d0"

# Each Validated module's CURRENT reviewed digest, pinned deliberately.
#
# This is not a repository-wide snapshot count — those are brittle and were
# removed. It is one entry per module that a human has reviewed by exact bytes.
# Changing a module's content changes its digest, which fails here and in
# admission, and the correct response is a new human review plus an intentional
# edit to this map. That coupling is the point.
REVIEWED_DIGESTS = {
    "platform/runner-model": REVIEWED_DIGEST,
    "platform/repository-taxonomy": (
        "sha256:96613fed5f5f9df78bff3fda37ff7bb8beac0dc10bc292f21b270493696661d4"
    ),
    "platform/governance": (
        "sha256:d5a4c13dab3d6b3eef606b46160bfe54ad0de020534fb537fc566d7a6f125dc5"
    ),
    "platform/workspace-conventions": (
        "sha256:0b3db0030d91021ad5add7a7096047f93aeec99f854440f80c6928b5b99bbf42"
    ),
    "platform/core-operating-model": (
        "sha256:e9644f110c63dfd939fc3569703eaff28251d2c5e6b473d32057e4730e567c7a"
    ),
    "platform/degraded-operation": (
        "sha256:1d4b4c2cf10c0a2749e1bc5b760244dffff9a365094ce817f16817465b52ef3e"
    ),
    "platform/api-contract-conventions": (
        "sha256:7a6d86d0ad5e6f07ae96b05e47c082614ba0910e5ef64fd14f489d8fc0f81cca"
    ),
    "platform/worker-conventions": (
        "sha256:502c3bbd28420d1891e5f0125ad5752db456e39230b6161dd12c07059d311dc7"
    ),
    "platform/implementation-rules": (
        "sha256:148c98319d0fe2002b0803c62e3aa493dc979e262032c55f753e48f5406857e7"
    ),
    "platform/review-conventions": (
        "sha256:04c926a41596d58ac46edb48a57fc0ddfb5c74e96d174f82eda3bef77024dde5"
    ),
}


def test_the_live_runner_model_module_is_validated_against_its_reviewed_bytes() -> None:
    """The causal chain, asserted end to end on the real repository.

        exact reviewed bytes
            -> human content review bound to their digest
            -> canonical admit()
            -> Proof A succeeds
            -> admitted
            -> the catalog may truthfully claim Validated

    Asserting this module specifically is deliberate. Moving it off `Validated`
    is itself an explicit lifecycle transition, and it should require a reviewed
    change to this test rather than passing silently.
    """
    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    module = next(m for m in catalog["modules"] if m["id"] == "platform/runner-model")

    assert module["status"] == "Validated"
    review = module["contentReview"]
    assert isinstance(review, dict)
    assert review["policy"] == "portable-knowledge-prohibited-content-v1"
    assert review["by"] == "human:mikegtech"
    assert review["sourceDigest"] == REVIEWED_DIGEST

    # The attestation binds the bytes that are actually on disk, recomputed here
    # rather than trusted: a review that names a digest nothing produces is not
    # a review of this content.
    directory = REPO_ROOT / "knowledge" / "platform" / "runner-model"
    members = {
        f.name: f.read_bytes()
        for f in sorted(directory.iterdir())
        if f.is_file() and f.name != "README.md"
    }
    assert "sha256:" + _bundle_digest(members) == REVIEWED_DIGEST


def test_the_live_lifecycle_evidence_names_the_reviewed_digest() -> None:
    """The evidence the checker emits for the live repository.

    Uses the spy harness so the assertions are on structured evidence, and so
    the packaging control is proven at the same time: `Validated` must invoke
    packageBundle **zero** times.
    """
    seen = _spy_packaging(REPO_ROOT)
    assert seen["problems"] == [], seen["problems"]
    assert seen["calls"] == 0, "Validated does not package"

    evidence = [e for e in seen["evidence"] if e["id"] == "platform/runner-model"]
    assert len(evidence) == 1, seen["evidence"]
    assert evidence[0]["status"] == "Validated"
    assert evidence[0]["admittedDigest"] == REVIEWED_DIGEST
    assert "packageDigest" not in evidence[0], "Validated claims no packaged artifact"


def test_no_module_is_packaged_or_published() -> None:
    """This landing validates; it does not package or publish."""
    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    for entry in [*catalog["modules"], *catalog["sets"]]:
        assert entry["status"] not in {"Packaged", "Published"}, entry["id"]


def test_a_candidate_missing_generated_by_surfaces_the_packages_rule(tmp_path: Path) -> None:
    """G: the adapter reports the package's exact refusal, not a rule of its own.

    `generated.by` is OKF conformance and belongs to the toolchain. If the
    adapter ever grew its own provenance check, this identifier would change and
    the two answers would begin to drift.
    """
    concept = _concept()
    stripped = concept.replace(f"generated:\n  by: {OWNER}\n", "generated:\n")
    assert "by:" not in stripped.split("---")[1], "the fixture must actually remove it"

    Repo(tmp_path / "repo").module(sources={"index.md": INDEX_MD, "model.md": stripped}).write()
    result = _run(tmp_path / "repo")
    assert result.returncode != 0
    assert "profile.generated.by" in _output(result), "the package's rule identifier"


def test_the_adapter_owns_no_provenance_rule() -> None:
    """Structural companion: no generated-provenance logic in the adapter."""
    source = (REPO_ROOT / "scripts" / "check-knowledge-content.mjs").read_text()
    code = "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith(("*", "/*", "//"))
    )
    for owned_by_the_package in ("generated", "OKF_ACTOR", "ISO_INSTANT"):
        assert owned_by_the_package not in code, (
            f"{owned_by_the_package!r} in the adapter — provenance rules belong to the package"
        )


def test_every_validated_module_is_pinned_to_its_reviewed_bytes() -> None:
    """Each Validated module binds a human review to the bytes actually on disk.

    Three facts must agree per module, and any disagreement is a real defect:
    the attestation's digest, the digest recomputed from the files, and the
    digest pinned here. The recomputation is what makes this more than a
    consistency check between two catalog fields.
    """
    catalog = json.loads((REPO_ROOT / "knowledge" / "catalog.json").read_text())
    validated = [m for m in catalog["modules"] if m["status"] == "Validated"]
    assert {m["id"] for m in validated} == set(REVIEWED_DIGESTS), (
        "a module was validated or unvalidated without updating the pinned digests"
    )

    for module in validated:
        pinned = REVIEWED_DIGESTS[module["id"]]
        review = module["contentReview"]
        assert isinstance(review, dict)
        assert review["by"] == "human:mikegtech"
        assert review["policy"] == "portable-knowledge-prohibited-content-v1"
        assert review["sourceDigest"] == pinned, module["id"]

        directory = REPO_ROOT / "knowledge" / module["id"]
        members = {
            f.name: f.read_bytes()
            for f in sorted(directory.iterdir())
            if f.is_file() and f.name != "README.md"
        }
        assert "sha256:" + _bundle_digest(members) == pinned, (
            f"{module['id']}: bytes on disk do not match the reviewed digest"
        )


def test_validated_modules_admit_and_package_nothing() -> None:
    """Every Validated module admits, and none of them packages."""
    seen = _spy_packaging(REPO_ROOT)
    assert seen["problems"] == [], seen["problems"]
    assert seen["calls"] == 0, "Validated is not Packaged"

    reported = {e["id"]: e["admittedDigest"] for e in seen["evidence"]}
    assert reported == REVIEWED_DIGESTS, (
        "the digest admission emitted must be each module's reviewed digest"
    )
