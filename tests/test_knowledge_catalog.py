"""Tests for ``scripts/check-knowledge.mjs`` and the knowledge registry.

**This validates the specification, not knowledge content.** Real-content
admission belongs to ``@secure-home/knowledge-toolchain``, which owns every
content rule; this file owns registry and scaffold concerns, and the two never
implement the same rule twice.

**Prohibited content is not established by machine inspection alone.** ADR-0016
corrected that claim: deterministic A/B indicators are machine-checked, the
semantic remainder requires a human content-review attestation, Proof A binds it
to exact bytes, and publication additionally requires Proof B — governed
human-review evidence that no mechanism in this repository produces. There are
currently no A classes.

``blockedByToolchain`` records whether the toolchain has been accepted;
``blockedByRollout`` records whether a module class may author. U7 asked a third
question — whether the format architecture was decided — and ADR-0015 answered
it.

The distinction matters enough to be asserted: a green run on the registry check
could otherwise be mistaken for evidence that content was checked. There is no
content, and ``test_no_specification_directory_contains_authored_content``
enforces that there is none.

Every fixture is built in ``tmp_path``. The checker takes a repository root for
exactly that reason.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CHECK = REPO_ROOT / "scripts" / "check-knowledge.mjs"
KNOWLEDGE = REPO_ROOT / "knowledge"
CATALOG = KNOWLEDGE / "catalog.json"
INDEX = KNOWLEDGE / "INDEX.md"

STATUSES = {
    "Planned",
    "Source-ready",
    "Validated",
    "Packaged",
    "Published",
    "Deprecated",
    "Retired",
}
# Three stages, not one flag. `POST_TOOLCHAIN` states need the readiness gate
# open; `PUBLISHABLE` additionally needs a governed Proof B producer, which does
# not exist. Proof B gates publication and nothing earlier.
POST_TOOLCHAIN = {"Validated", "Packaged", "Published"}
PUBLISHABLE = {"Published"}


def _catalog() -> dict[str, Any]:
    parsed: dict[str, Any] = json.loads(CATALOG.read_text())
    return parsed


def _run(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(CHECK), str(root)], capture_output=True, text=True, check=False
    )


def _output(result: subprocess.CompletedProcess[str]) -> str:
    return result.stdout + result.stderr


# --- the real repository ------------------------------------------------------


def test_the_repository_registry_is_valid() -> None:
    result = _run(REPO_ROOT)
    assert result.returncode == 0, _output(result)


def test_every_module_has_every_required_metadata_field() -> None:
    required = {
        "id",
        "purpose",
        "consumers",
        "owner",
        "status",
        "version",
        "asOf",
        "limitations",
        "governingSources",
        "sensitivity",
        "freshnessPolicy",
        "blockedByToolchain",
        "blockedByRollout",
    }
    for module in _catalog()["modules"]:
        missing = required - set(module)
        assert not missing, f"{module.get('id')}: missing {sorted(missing)}"


def test_module_and_set_ids_are_unique() -> None:
    catalog = _catalog()
    module_ids = [m["id"] for m in catalog["modules"]]
    set_ids = [s["id"] for s in catalog["sets"]]
    assert len(module_ids) == len(set(module_ids)), "duplicate module id"
    assert len(set_ids) == len(set(set_ids)), "duplicate set id"


def test_every_set_references_registered_modules_only() -> None:
    catalog = _catalog()
    registered = {m["id"] for m in catalog["modules"]}
    for s in catalog["sets"]:
        for field in ("required", "optional"):
            for ref in s[field]:
                assert ref in registered, f"set {s['id']}: {field} names unregistered {ref}"


def test_no_set_references_a_file_path() -> None:
    """A profile selects logical module IDs. A path would make the layout load-bearing."""
    catalog = _catalog()
    for s in catalog["sets"]:
        for ref in [*s["required"], *s["optional"], *s["deny"]]:
            assert not ref.endswith(".md"), f"set {s['id']}: {ref} is a file path"
            assert ".." not in ref, f"set {s['id']}: {ref} traverses"
            assert not ref.startswith("/"), f"set {s['id']}: {ref} is absolute"
            assert ref.count("/") <= 1, f"set {s['id']}: {ref} is not a module id"


def test_every_status_is_from_the_vocabulary_and_nothing_claims_more_than_planned() -> None:
    """Readiness is discharged, but nothing has been authored, so nothing has

    earned a later state. ``Validated`` and ``Packaged`` are now *representable*
    — that is the lifecycle separation working — and no entry may claim one
    while its directory holds no source that admission has seen.
    """
    catalog = _catalog()
    for entry in [*catalog["modules"], *catalog["sets"]]:
        assert entry["status"] in STATUSES, f"{entry['id']}: unknown status {entry['status']}"
        assert entry["blockedByToolchain"] is False
        assert entry["status"] == "Planned", (
            f"{entry['id']}: status {entry['status']} claims progress, but no module "
            "content is authored yet"
        )


def test_every_registered_module_has_a_specification_directory() -> None:
    for module in _catalog()["modules"]:
        readme = KNOWLEDGE / module["id"] / "README.md"
        assert readme.is_file(), f"{module['id']}: no specification README"


def test_every_module_directory_is_registered() -> None:
    """The reverse direction: an unregistered module is invisible to review."""
    registered = {m["id"] for m in _catalog()["modules"]}
    on_disk = {
        f"{group.name}/{module.name}"
        for group in KNOWLEDGE.iterdir()
        if group.is_dir()
        for module in group.iterdir()
        if module.is_dir()
    }
    assert on_disk == registered, f"unregistered: {sorted(on_disk - registered)}"


def _readme_only_required(module: dict[str, Any]) -> bool:
    """Whether this module's directory must hold README.md and nothing else.

    Scoped to the gate, matching ``check-knowledge.mjs``. **Extracted so the
    scoping is falsifiable.** Written inline over the live catalog it was not:
    every live module is gated today, so an unconditional rule and a scoped one
    select exactly the same 17 modules, and a mutation restoring the
    unconditional form survived with every test still green.
    """
    return module["blockedByToolchain"] is True


def test_the_readme_only_requirement_is_scoped_to_the_gate() -> None:
    """The transition, proven on the predicate rather than on today's catalog.

    toolchain true  + candidate source -> specification-only refusal stands
    toolchain false + candidate source -> this file does not police it;
                                          check-knowledge-content.mjs owns it
    """
    assert _readme_only_required({"blockedByToolchain": True, "blockedByRollout": True})
    assert _readme_only_required({"blockedByToolchain": True, "blockedByRollout": False})
    assert not _readme_only_required({"blockedByToolchain": False, "blockedByRollout": False}), (
        "once readiness is discharged, candidate source is what belongs in the directory"
    )
    assert not _readme_only_required({"blockedByToolchain": False, "blockedByRollout": True}), (
        "rollout gates AUTHORING ELIGIBILITY, not whether this file inspects content"
    )


def test_a_gated_specification_directory_contains_no_authored_content() -> None:
    """Scoped to the gate, matching `check-knowledge.mjs`.

    While a module's ``blockedByToolchain`` is true its directory is
    specification-only and authored content is a finding. Once that gate is
    discharged, candidate source is exactly what belongs there — and whether the
    content is *acceptable* is `check-knowledge-content.mjs`'s question, not
    this file's. Asserting README-only unconditionally would make this test a
    second, weaker authority over content the moment authoring opened, and it
    would have to be deleted rather than merely relaxed.

    Readiness is discharged, so NO live module is gated and this rule covers
    none of them. The vacuity is asserted rather than hidden: a test that
    silently stops covering anything is worse than one that says so, and the
    predicate itself is still proven directly below.
    """
    gated = [m for m in _catalog()["modules"] if _readme_only_required(m)]
    assert gated == [], (
        "readiness is discharged, so the README-only rule applies to no live module; "
        "content is check-knowledge-content.mjs's question now"
    )
    for module in gated:  # pragma: no cover - none are gated post-discharge
        entries = sorted(p.name for p in (KNOWLEDGE / module["id"]).iterdir())
        assert entries == ["README.md"], f"{module['id']}: authored content present — {entries}"


def test_no_module_has_authored_source_yet() -> None:
    """A STATE observation, not a rule.

    Authoring is now permitted for the ten rollout-eligible ``platform/**``
    modules, and none has been written. This records that the discharge landing
    changed a gate and nothing else — it is expected to change the first time a
    module is genuinely authored, and `check-knowledge-content.mjs` is what will
    judge that content.
    """
    authored = {
        module["id"]: sorted(p.name for p in (KNOWLEDGE / module["id"]).iterdir())
        for module in _catalog()["modules"]
    }
    assert all(entries == ["README.md"] for entries in authored.values()), authored


def test_this_file_does_not_police_content_once_the_gate_opens() -> None:
    """The ownership boundary, asserted structurally rather than described.

    Python governance must not grow a parallel admission implementation. If this
    module ever starts reading module source, the boundary has moved and the two
    answers will drift.
    """
    body = Path(__file__).read_text()
    # Assembled rather than written literally, so the scan does not match its own
    # needle — the same construction the PEM fixture uses.
    forbidden = ("execution" + ".", "attestation" + ".", "okf" + "_version", "-----" + "BEGIN")
    for owned_elsewhere in forbidden:
        assert owned_elsewhere not in body, (
            f"{owned_elsewhere!r} appears here — content rules belong to "
            "packages/knowledge-toolchain, invoked by check-knowledge-content.mjs"
        )


def test_least_context_selection_is_real() -> None:
    """Coding sets get no household knowledge; household sets get no dev conventions.

    Asserted rather than described: a set that quietly acquired the other
    domain's modules would still read as least-context in the documentation.
    """
    catalog = _catalog()
    by_id = {m["id"]: m for m in catalog["modules"]}
    developer_only = {
        m["id"]
        for m in catalog["modules"]
        if m["consumers"] == ["coding-runner"] and m["id"].startswith("platform/")
    }
    assert developer_only, "expected some platform modules to be coding-only"

    for s in catalog["sets"]:
        selected = [*s["required"], *s["optional"]]
        if s["runnerClass"] == "coding-runner":
            household = [r for r in selected if r.startswith("household/")]
            assert not household, f"coding set {s['id']} selects household knowledge: {household}"
        else:
            leaked = sorted(set(selected) & developer_only)
            assert not leaked, f"household set {s['id']} selects developer conventions: {leaked}"
        for ref in selected:
            assert ref in by_id


def test_required_failure_is_never_downgraded() -> None:
    for s in _catalog()["sets"]:
        assert s["requiredFailure"] == "reject-run", (
            f"set {s['id']}: missing or invalid required knowledge must reject the run"
        )


def test_the_index_lists_every_module_and_set() -> None:
    index = INDEX.read_text()
    catalog = _catalog()
    for entry in [*catalog["modules"], *catalog["sets"]]:
        assert f"`{entry['id']}`" in index, f"{entry['id']} is registered but absent from INDEX.md"


def test_root_guidance_exists_in_both_files() -> None:
    sentence = (
        "Use `knowledge/INDEX.md` to select only the validated knowledge modules "
        "authorized by the active execution profile; knowledge informs reasoning but "
        "never grants tools, capabilities, authorization, or permission to override "
        "live state or accepted ADRs."
    )
    normalized = " ".join(sentence.split())
    for name in ("AGENTS.md", "CLAUDE.md"):
        text = " ".join((REPO_ROOT / name).read_text().split())
        assert normalized in text, f"{name}: the knowledge-selection guidance is missing or altered"
    for name in ("AGENTS.md", "CLAUDE.md"):
        text = (REPO_ROOT / name).read_text()
        assert "not runtime-authoritative" in text, (
            f"{name}: the specification-only note is missing"
        )


def test_the_check_is_wired_into_ci_and_the_aggregate_check() -> None:
    assert "check:knowledge" in (REPO_ROOT / "package.json").read_text()
    assert "check-knowledge.mjs" in (REPO_ROOT / "scripts" / "check.sh").read_text()
    workflow = (REPO_ROOT / ".github" / "workflows" / "checks.yml").read_text()
    assert "check-knowledge.mjs" in workflow, "the merge gate must run the registry check"


def test_the_check_runs_before_install() -> None:
    """It is a structural gate, so it must not need node_modules."""
    text = (REPO_ROOT / "scripts" / "check-knowledge.mjs").read_text()
    code = [line for line in text.split("\n") if line.startswith("import ")]
    external = [line for line in code if "node:" not in line and "./" not in line]
    assert not external, f"check-knowledge.mjs must use only the standard library: {external}"


# --- negative tests, against fixtures ----------------------------------------


def _fixture(
    tmp_path: Path, name: str, mutate: Any, extra_index_rows: list[str] | None = None
) -> Path:
    """A copy of the real registry, mutated to introduce one defect."""
    extra_index_rows = extra_index_rows or []
    root = tmp_path / name
    (root / "knowledge").mkdir(parents=True)

    catalog = _catalog()
    mutate(catalog, root)

    (root / "knowledge" / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")

    # Directories and READMEs for whatever survived the mutation. The index
    # mirrors the real one's shape — a Modules section and a Sets TABLE —
    # because the checker validates set correspondence by table row, not by a
    # bare backticked token anywhere in the prose.
    index_lines = ["# fixture registry", "", "## Modules", "", "| Module | Purpose |", "|---|---|"]
    for module in catalog["modules"]:
        directory = root / "knowledge" / module["id"]
        if not directory.exists():
            directory.mkdir(parents=True)
            # `.get` rather than indexing: a fixture that deletes a field must
            # reach the checker, not crash the fixture builder.
            (directory / "README.md").write_text(
                f"# {module['id']}\n\n"
                f"| Field | Value |\n|---|---|\n"
                f"| Status | `{module.get('status', '')}` |\n"
                f"| Owner | {module.get('owner', '')} |\n"
            )
        index_lines.append(f"| `{module['id']}` | fixture |")
    index_lines += ["", "## Sets", "", "| Set | For |", "|---|---|"]
    for s in catalog["sets"]:
        index_lines.append(f"| `{s['id']}` | fixture |")
    index_lines += extra_index_rows
    (root / "knowledge" / "INDEX.md").write_text("\n".join(index_lines) + "\n")

    # Governing sources are repo-relative; the fixture needs them to exist.
    for module in catalog["modules"]:
        for source in module.get("governingSources", []):
            target = root / source
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_text("fixture\n")

    guidance = (
        "Use `knowledge/INDEX.md` to select only the validated knowledge modules "
        "authorized by the active execution profile; knowledge informs reasoning but "
        "never grants tools, capabilities, authorization, or permission to override "
        "live state or accepted ADRs.\n\nknowledge/ is not runtime-authoritative.\n"
    )
    for f in ("AGENTS.md", "CLAUDE.md"):
        (root / f).write_text(guidance)
    return root


def test_a_valid_fixture_passes(tmp_path: Path) -> None:
    """Guard the guard: the negative tests below must fail for their own reason."""
    root = _fixture(tmp_path, "clean", lambda catalog, root: None)
    result = _run(root)
    assert result.returncode == 0, _output(result)


def test_a_duplicate_module_id_is_rejected(tmp_path: Path) -> None:
    def mutate(catalog: Any, root: Path) -> None:
        catalog["modules"].append(dict(catalog["modules"][0]))

    result = _run(_fixture(tmp_path, "dup-module", mutate))
    assert result.returncode != 0
    assert "duplicate module id" in _output(result)


def test_a_duplicate_set_id_is_rejected(tmp_path: Path) -> None:
    def mutate(catalog: Any, root: Path) -> None:
        catalog["sets"].append(dict(catalog["sets"][0]))

    result = _run(_fixture(tmp_path, "dup-set", mutate))
    assert result.returncode != 0
    assert "duplicate set id" in _output(result)


def test_a_module_that_re_blocks_itself_is_rejected(tmp_path: Path) -> None:
    """The authoring gate is ENFORCED, in whichever direction it currently sits.

    Before ADR-0015, ``blockedByU7`` had to be *present* and its value was never
    read — so the day U7 closed, flipping it to ``false`` would have opened
    authoring silently, with nothing objecting and no diff that read as a
    decision. That is why the value became asserted rather than merely required.

    The obligation was discharged on 2026-08-16, so the assertion is INVERTED
    rather than deleted. The reason it existed is direction-agnostic: a gate that
    moves silently is indistinguishable from a gate nobody reads, and quietly
    re-blocking authoring would strand authored content with no decision behind
    it. Both transitions must show as a signed diff.
    """

    def mutate(catalog: Any, root: Path) -> None:
        catalog["modules"][0]["blockedByToolchain"] = True

    result = _run(_fixture(tmp_path, "module-reblocked", mutate))
    assert result.returncode != 0
    assert "blockedByToolchain must be false" in _output(result)


def test_a_set_that_unblocks_itself_is_rejected(tmp_path: Path) -> None:
    """The same gate for sets: a set is selectable, so an unblocked one matters."""

    def mutate(catalog: Any, root: Path) -> None:
        catalog["sets"][0]["blockedByToolchain"] = True

    result = _run(_fixture(tmp_path, "set-unblocked", mutate))
    assert result.returncode != 0
    assert "blockedByToolchain must be false" in _output(result)


def test_rollout_eligibility_matches_the_accepted_initial_values() -> None:
    """ADR-0016 §7a fixes the value by scope, and acceptance set it.

    Asserted against the live registry rather than a fixture, because the
    accepted initialization is a fact about THIS catalog: platform modules are
    rollout-eligible, household and runbook modules are not, and every set
    starts blocked.
    """
    catalog = _catalog()
    for module in catalog["modules"]:
        expected = not module["id"].startswith("platform/")
        assert module["blockedByRollout"] is expected, (
            f"{module['id']}: blockedByRollout must be {expected} per ADR-0016 §7a"
        )
    for s in catalog["sets"]:
        assert s["blockedByRollout"] is True, (
            f"{s['id']}: every set starts rollout-blocked per ADR-0016 §7a"
        )


def test_discharging_readiness_did_not_move_the_rollout_gate() -> None:
    """The two gates are INDEPENDENT — the whole point of separating them.

    The proof had to change shape at the discharge. Before it, independence
    showed as "rollout-eligible modules are still toolchain-blocked". After it,
    that assertion is VACUOUS: every entry has ``blockedByToolchain`` false, so
    checking it of the rollout-eligible ones proves nothing.

    What is not vacuous is the other direction — 13 entries now carry
    ``blockedByToolchain: false`` together with ``blockedByRollout: true``. That
    combination can only exist if discharging one gate left the other alone, and
    it is the assertion that would fail if a future change conflated them again,
    which is how the U7 defect looked the first time.
    """
    catalog = _catalog()
    entries = [*catalog["modules"], *catalog["sets"]]
    divergent = [
        e["id"]
        for e in entries
        if e["blockedByToolchain"] is False and e["blockedByRollout"] is True
    ]
    assert len(divergent) == 13, (
        f"discharging readiness must not have released rollout: {divergent}"
    )
    assert all(e["blockedByToolchain"] is False for e in entries)


def test_authoring_eligibility_is_exactly_the_rolled_out_platform_modules() -> None:
    """Authoring eligibility requires BOTH gates false.

    Discharging readiness opened authoring for the ten ``platform/**`` modules
    and for nothing else. This is the proof that the two gates were genuinely
    independent rather than one fact spelled twice: if discharging readiness had
    released everything, ``blockedByRollout`` was never load-bearing.
    """
    catalog = _catalog()
    open_on_both = sorted(
        e["id"]
        for e in [*catalog["modules"], *catalog["sets"]]
        if e["blockedByToolchain"] is False and e["blockedByRollout"] is False
    )
    assert len(open_on_both) == 10, open_on_both
    assert all(i.startswith("platform/") for i in open_on_both), open_on_both

    still_blocked = [
        e["id"] for e in [*catalog["modules"], *catalog["sets"]] if e["blockedByRollout"] is True
    ]
    assert len(still_blocked) == 13, still_blocked


def test_a_module_with_the_wrong_rollout_value_is_rejected(tmp_path: Path) -> None:
    """The value is ASSERTED, not merely required as a field."""

    def mutate(catalog: Any, root: Path) -> None:
        for module in catalog["modules"]:
            if module["id"].startswith("household/"):
                module["blockedByRollout"] = False
                return
        raise AssertionError("fixture has no household module to mutate")

    result = _run(_fixture(tmp_path, "household-rollout-open", mutate))
    assert result.returncode != 0
    assert "blockedByRollout must be true" in _output(result)


def test_a_set_that_unblocks_its_rollout_is_rejected(tmp_path: Path) -> None:
    """Every set starts blocked; releasing one is an explicit reviewed change."""

    def mutate(catalog: Any, root: Path) -> None:
        catalog["sets"][0]["blockedByRollout"] = False

    result = _run(_fixture(tmp_path, "set-rollout-open", mutate))
    assert result.returncode != 0
    assert "blockedByRollout must be true" in _output(result)


def test_the_gate_is_discharged_for_every_registered_entry() -> None:
    """The live registry, not a fixture: the transition covered all 23 entries.

    A partial discharge would be the worse outcome — some entries readable as
    "reviewed" and others not, with no record of which. The obligation was one
    obligation, and it was discharged once.
    """
    catalog = _catalog()
    entries = [*catalog["modules"], *catalog["sets"]]
    assert len(entries) == 23
    for entry in entries:
        assert entry["blockedByToolchain"] is False, (
            f"{entry['id']}: the ADR-0015 §12 obligation was discharged on 2026-08-16; "
            "an entry still carrying the gate would mean the transition was partial"
        )


def test_a_missing_metadata_field_is_rejected(tmp_path: Path) -> None:
    def mutate(catalog: Any, root: Path) -> None:
        del catalog["modules"][0]["owner"]

    result = _run(_fixture(tmp_path, "no-owner", mutate))
    assert result.returncode != 0
    assert "owner" in _output(result)


def test_a_set_referencing_an_unregistered_module_is_rejected(tmp_path: Path) -> None:
    def mutate(catalog: Any, root: Path) -> None:
        catalog["sets"][0]["required"].append("platform/does-not-exist")

    result = _run(_fixture(tmp_path, "ghost-module", mutate))
    assert result.returncode != 0
    assert "unregistered module" in _output(result)


def test_a_set_referencing_a_file_path_is_rejected(tmp_path: Path) -> None:
    """The rule that keeps the repository layout from becoming load-bearing."""
    for index, path in enumerate(
        ("knowledge/platform/governance/README.md", "../../etc/passwd", "/absolute/path")
    ):

        def mutate(catalog: Any, root: Path, path: str = path) -> None:
            catalog["sets"][0]["required"].append(path)

        result = _run(_fixture(tmp_path, f"path-ref-{index}", mutate))
        assert result.returncode != 0, f"{path} was accepted as a module reference"
        assert "not a module id" in _output(result)


def test_an_unregistered_module_directory_is_rejected(tmp_path: Path) -> None:
    def mutate(catalog: Any, root: Path) -> None:
        stray = root / "knowledge" / "platform" / "zz-unregistered"
        stray.mkdir(parents=True)
        (stray / "README.md").write_text("# stray\n")

    result = _run(_fixture(tmp_path, "stray-dir", mutate))
    assert result.returncode != 0
    assert "not registered" in _output(result)


def test_a_status_outside_the_vocabulary_is_rejected(tmp_path: Path) -> None:
    def mutate(catalog: Any, root: Path) -> None:
        catalog["modules"][0]["status"] = "Almost-ready"

    result = _run(_fixture(tmp_path, "bad-status", mutate))
    assert result.returncode != 0
    assert "status vocabulary" in _output(result)


def test_a_post_toolchain_status_is_refused_while_readiness_is_undischarged(
    tmp_path: Path,
) -> None:
    """Validated / Packaged / Published all need the readiness gate open first.

    The REASON matters as much as the refusal: while `blockedByToolchain` is
    true these are unreachable because the reviewed obligation is still open —
    not because Proof B is missing. Conflating the two made Proof B look like a
    prerequisite for validation, which inverts the lifecycle.
    """
    for index, status in enumerate(sorted(POST_TOOLCHAIN)):

        def mutate(catalog: Any, root: Path, status: str = status) -> None:
            catalog["modules"][0]["status"] = status
            # Explicitly re-blocked: since the discharge, this branch is only
            # reachable in a catalog that also fails the gate-value rule. Both
            # findings are expected; the one under test is the reason given for
            # the STATUS, which must be readiness rather than Proof B.
            catalog["modules"][0]["blockedByToolchain"] = True

        result = _run(_fixture(tmp_path, f"post-toolchain-{index}", mutate))
        assert result.returncode != 0, f"{status} was accepted while readiness is undischarged"
        assert "readiness has not been discharged" in _output(result)
        assert "Proof B" not in _output(result), (
            f"{status} must not be refused for a publication reason at this stage"
        )


def test_validated_and_packaged_become_representable_once_readiness_opens(
    tmp_path: Path,
) -> None:
    """THE LIFECYCLE SEPARATION.

    authoring -> admission/validation -> packaging -> publication.

    Once the toolchain gate is discharged, Validated and Packaged are ordinary
    states. Proof B gates publication and nothing earlier — admission and
    `packageBundle()` never require it, and must not start.
    """
    for index, status in enumerate(["Validated", "Packaged"]):

        def mutate(catalog: Any, root: Path, status: str = status) -> None:
            catalog["modules"][0]["status"] = status
            catalog["modules"][0]["blockedByToolchain"] = False

        result = _run(_fixture(tmp_path, f"readiness-open-{index}", mutate))
        output = _output(result)
        assert "readiness has not been discharged" not in output, (
            f"{status} is a post-toolchain state and must be representable once the gate opens"
        )
        assert "Proof B" not in output, f"{status} does not require Proof B"


def test_published_still_requires_proof_b_after_readiness_opens(tmp_path: Path) -> None:
    """The other half: discharging readiness does not release publication."""

    def mutate(catalog: Any, root: Path) -> None:
        catalog["modules"][0]["status"] = "Published"
        catalog["modules"][0]["blockedByToolchain"] = False

    result = _run(_fixture(tmp_path, "published-open", mutate))
    assert result.returncode != 0, "Published must stay refused while no Proof B producer exists"
    assert "no governed producer exists" in _output(result)


def test_publication_is_downstream_of_readiness_in_the_vocabulary() -> None:
    """Every publishable status must also be a post-toolchain status.

    Otherwise publication would be reachable at a stage readiness has not
    unlocked, and the ordering in the lifecycle would be decorative.
    """
    catalog = _catalog()
    assert catalog["publishableStatuses"] == ["Published"]
    assert set(catalog["publishableStatuses"]) <= set(catalog["postToolchainStatuses"])


def _authored_module(gated: bool) -> Any:
    def mutate(catalog: Any, root: Path) -> None:
        module = catalog["modules"][0]
        module["blockedByToolchain"] = gated
        directory = root / "knowledge" / module["id"]
        directory.mkdir(parents=True)
        (directory / "README.md").write_text(
            f"| Status | `{module['status']}` |\n| Owner | {module['owner']} |\n"
        )
        (directory / "facts.yaml").write_text("zones: []\n")

    return mutate


def test_authored_content_under_a_gated_module_is_rejected(tmp_path: Path) -> None:
    """The rule still works where it still applies."""
    result = _run(_fixture(tmp_path, "authored-gated", _authored_module(gated=True)))
    assert result.returncode != 0
    assert "only README.md is permitted" in _output(result)


def test_authored_content_under_an_open_module_is_not_a_registry_finding(
    tmp_path: Path,
) -> None:
    """THE POST-DISCHARGE HALF.

    Once readiness is discharged, candidate source is exactly what belongs in
    the directory. Whether the content is *acceptable* is
    `check-knowledge-content.mjs`'s question — the registry checker must not
    answer it, or it becomes a second and weaker authority over content.
    """
    result = _run(_fixture(tmp_path, "authored-open", _authored_module(gated=False)))
    assert "only README.md is permitted" not in _output(result), (
        "with the gate discharged, authored source is permitted here"
    )


def test_a_readme_that_disagrees_with_the_catalog_is_rejected(tmp_path: Path) -> None:
    """The prose view must not drift from the machine-readable one."""

    def mutate(catalog: Any, root: Path) -> None:
        module = catalog["modules"][0]
        directory = root / "knowledge" / module["id"]
        directory.mkdir(parents=True)
        (directory / "README.md").write_text(
            f"# {module['id']}\n\n| Field | Value |\n|---|---|\n"
            "| Status | `Source-ready` |\n"
            f"| Owner | {module['owner']} |\n"
        )

    result = _run(_fixture(tmp_path, "drifted", mutate))
    assert result.returncode != 0
    assert "must not drift" in _output(result)


def test_a_set_that_denies_what_it_selects_is_rejected(tmp_path: Path) -> None:
    """A contradiction the resolver would have to break a tie on."""

    def mutate(catalog: Any, root: Path) -> None:
        target = catalog["sets"][0]
        target["deny"].append(target["required"][0])

    result = _run(_fixture(tmp_path, "self-deny", mutate))
    assert result.returncode != 0
    assert "also selects" in _output(result)


def test_downgrading_required_failure_is_rejected(tmp_path: Path) -> None:
    """Required knowledge is never silently downgraded to optional."""

    def mutate(catalog: Any, root: Path) -> None:
        catalog["sets"][0]["requiredFailure"] = "warn"

    result = _run(_fixture(tmp_path, "downgrade", mutate))
    assert result.returncode != 0
    assert "never downgraded" in _output(result)


def test_missing_root_guidance_is_rejected(tmp_path: Path) -> None:
    for index, name in enumerate(("AGENTS.md", "CLAUDE.md")):

        def mutate(catalog: Any, root: Path, name: str = name) -> None:
            root.mkdir(parents=True, exist_ok=True)
            (root / name).write_text("# nothing about knowledge here\n")

        root = _fixture(tmp_path, f"no-guidance-{index}", lambda catalog, root: None)
        (root / name).write_text("# nothing about knowledge here\n")
        result = _run(root)
        assert result.returncode != 0, f"{name} lost its guidance without failing"
        assert name in _output(result)


def test_every_set_has_every_required_metadata_field() -> None:
    """#43 requires the full metadata contract for every module *and* set."""
    required = {
        "id",
        "purpose",
        "runnerClass",
        "owner",
        "status",
        "version",
        "asOf",
        "limitations",
        "governingSources",
        "sensitivity",
        "freshnessPolicy",
        "blockedByToolchain",
        "blockedByRollout",
    }
    for s in _catalog()["sets"]:
        missing = required - set(s)
        assert not missing, f"{s.get('id')}: missing {sorted(missing)}"


def test_set_governing_sources_exist() -> None:
    for s in _catalog()["sets"]:
        for source in s["governingSources"]:
            assert (REPO_ROOT / source).exists(), f"set {s['id']}: {source} does not exist"


def test_the_registry_is_version_capable() -> None:
    """A set is what a profile pins and what evidence records, so it must carry a version field.

    The field is present and currently null, which is the same rule modules
    follow: nothing is versioned until there is content to version.
    """
    for s in _catalog()["sets"]:
        assert "version" in s, f"set {s['id']}: no version field — a profile could not pin it"


def test_a_set_version_that_pins_unversioned_modules_is_rejected(tmp_path: Path) -> None:
    """A pin to nothing makes two different resolutions look identical in evidence."""

    def mutate(catalog: Any, root: Path) -> None:
        catalog["sets"][0]["version"] = "1.0.0"

    result = _run(_fixture(tmp_path, "phantom-pin", mutate))
    assert result.returncode != 0
    assert "unversioned module" in _output(result)


def test_a_set_version_is_accepted_once_its_modules_are_versioned(tmp_path: Path) -> None:
    """The rule constrains a phantom pin, not versioning itself."""

    def mutate(catalog: Any, root: Path) -> None:
        target = catalog["sets"][0]
        selected = set(target["required"]) | set(target["optional"])
        for module in catalog["modules"]:
            if module["id"] in selected:
                module["version"] = "1.0.0"
        target["version"] = "1.0.0"

    result = _run(_fixture(tmp_path, "real-pin", mutate))
    assert result.returncode == 0, _output(result)


def test_an_unregistered_set_advertised_in_the_index_is_rejected(tmp_path: Path) -> None:
    """The reverse direction for sets.

    A set id has no slash, so it cannot be recognised by shape the way a module
    id can — which is why an earlier revision caught fake modules and missed
    fake sets entirely. Correspondence is now checked against the Sets table.
    """
    root = _fixture(
        tmp_path,
        "ghost-set",
        lambda catalog, root: None,
        extra_index_rows=["| `future-default` | a set nobody registered |"],
    )
    result = _run(root)
    assert result.returncode != 0, "an unregistered set was advertised without failing"
    assert "future-default" in _output(result)


def test_a_registered_set_missing_from_the_index_is_rejected(tmp_path: Path) -> None:
    root = _fixture(tmp_path, "hidden-set", lambda catalog, root: None)
    index = root / "knowledge" / "INDEX.md"
    catalog = json.loads((root / "knowledge" / "catalog.json").read_text())
    dropped = catalog["sets"][0]["id"]
    index.write_text(
        "\n".join(
            line for line in index.read_text().split("\n") if not line.startswith(f"| `{dropped}`")
        )
    )
    result = _run(root)
    assert result.returncode != 0, "a registered set vanished from the index without failing"
    assert dropped in _output(result)


def test_a_missing_sets_section_is_rejected(tmp_path: Path) -> None:
    """The correspondence check must not pass by having nothing to check."""
    root = _fixture(tmp_path, "no-sets-section", lambda catalog, root: None)
    index = root / "knowledge" / "INDEX.md"
    index.write_text(index.read_text().replace("## Sets", "## Something else"))
    result = _run(root)
    assert result.returncode != 0
    assert "Sets" in _output(result)


def test_a_network_address_in_a_specification_is_rejected(tmp_path: Path) -> None:
    """Narrow and lexical, and honest about being so — see the module docstring."""

    def mutate(catalog: Any, root: Path) -> None:
        module = catalog["modules"][0]
        directory = root / "knowledge" / module["id"]
        directory.mkdir(parents=True)
        (directory / "README.md").write_text(
            f"# {module['id']}\n\n| Field | Value |\n|---|---|\n"
            f"| Status | `{module['status']}` |\n"
            f"| Owner | {module['owner']} |\n\n"
            "The controller lives at 192.168.1.40.\n"
        )

    result = _run(_fixture(tmp_path, "address", mutate))
    assert result.returncode != 0
    assert "network address" in _output(result)


# --- stale semantics, asserted rather than remembered -----------------------


STALE_PHRASES = (
    "Blocked by | [U7]",
    "toolchain does not exist",
    "validator does not exist",
    "toolchain is unbuilt",
    "until the validator",
    "validator still comes first",
    "Choosing the bundle format is U7",
    "Validated, Packaged, or Published until",
    # Stale since the 2026-08-16 discharge. Guidance that still describes the
    # gate as shut would send an agent looking for permission it already has.
    "blockedByToolchain is still true",
    "pending independent review",
    "records the review that remains",
    "gate is still shut",
)


def test_no_governed_guidance_still_describes_the_pre_toolchain_world() -> None:
    """Two sweeps missed live files; this is why it is now a test.

    U7 is RESOLVED and was never readiness in the first place — the format
    decision and the toolchain obligation are different facts, and guidance that
    conflates them teaches the conflation. Accepted ADRs are excluded: ADR-0016
    is the correction mechanism for older accepted claims, and the historical
    wording inside the resolved U7 entry stays historical.
    """
    swept = [
        *(KNOWLEDGE.rglob("*.md")),
        KNOWLEDGE / "catalog.json",
        REPO_ROOT / "AGENTS.md",
        REPO_ROOT / "CLAUDE.md",
        REPO_ROOT / "scripts" / "check-knowledge.mjs",
        REPO_ROOT / "scripts" / "check-knowledge-content.mjs",
        REPO_ROOT / ".github" / "workflows" / "checks.yml",
    ]
    for path in swept:
        text = path.read_text()
        for phrase in STALE_PHRASES:
            assert phrase not in text, (
                f"{path.relative_to(REPO_ROOT)} still says {phrase!r} — the toolchain and "
                "content admission exist; blockedByToolchain records the review that remains"
            )


def test_the_gate_value_lives_only_in_the_catalog() -> None:
    """No module README may mirror a mutable gate value.

    The `Blocked by` row duplicated one, and a duplicated mutable value drifts —
    it was still naming U7 long after U7 was resolved. Status and Owner are
    mirrored deliberately and `check-knowledge.mjs` enforces their agreement;
    the gates are machine-readable state with exactly one home.
    """
    for module in _catalog()["modules"]:
        text = (KNOWLEDGE / module["id"] / "README.md").read_text()
        assert "Blocked by" not in text, f"{module['id']}: README mirrors a gate value"
        for gate in ("blockedByToolchain", "blockedByRollout"):
            assert gate not in text, f"{module['id']}: README duplicates {gate}"
