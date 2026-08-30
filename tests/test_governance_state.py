"""PR-1 conformance tests for the offline governance-state checker.

The tests intentionally invoke the shipped Node entry point for every
current-state refusal. Python only prepares isolated temporary fixture trees
and checks the reported contract; it does not reimplement the model.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, cast

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CHECKER = REPOSITORY_ROOT / "scripts/check-governance-state.mjs"
FIXTURE_ROOT = REPOSITORY_ROOT / "tests/fixtures/governance/current"


def copy_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "fixture"
    shutil.copytree(FIXTURE_ROOT, root)
    return root


def canonicalize(root: Path, path: str = "state.json") -> str:
    result = subprocess.run(
        [
            "node",
            str(CHECKER),
            "--root",
            str(root),
            "--state",
            path,
            "--canonical",
        ],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def write_state(root: Path, state: dict[str, Any], path: str = "state.json") -> None:
    target = root / path
    target.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    target.write_text(canonicalize(root, path), encoding="utf-8")


def load_state(root: Path, path: str = "state.json") -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((root / path).read_text(encoding="utf-8")))


def run_checker(
    root: Path, path: str = "state.json", *, raw: str | None = None
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    target = root / path
    if raw is not None:
        target.write_text(raw, encoding="utf-8")
    result = subprocess.run(
        [
            "node",
            str(CHECKER),
            "--root",
            str(root),
            "--state",
            path,
            "--json",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
    )
    return result, json.loads(result.stdout)


def assert_refused(
    root: Path, *codes: str, path: str = "state.json", raw: str | None = None
) -> dict[str, Any]:
    result, payload = run_checker(root, path, raw=raw)
    assert result.returncode != 0, result.stderr
    reported = {problem["code"] for problem in payload["problems"]}
    assert set(codes) <= reported, (payload, result.stderr)
    return payload


def assert_valid(root: Path, path: str = "state.json") -> dict[str, Any]:
    result, payload = run_checker(root, path)
    assert result.returncode == 0, (payload, result.stderr)
    assert payload["ok"] is True
    return payload


def add_landing(
    state: dict[str, Any],
    *,
    landing_id: str,
    requires: list[str],
    kind: str = "implementation-landing",
) -> dict[str, Any]:
    landing = {
        "id": landing_id,
        "kind": kind,
        "requires": requires,
        "authorityAnchor": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 56,
        },
        "replaces": None,
        "replacement": None,
        "delivery": {
            "lifecycle": "Planned",
            "completionPolicy": (
                "reviewed-spike-evidence-v1" if kind == "spike-landing" else "reviewed-delivery-v1"
            ),
            "completion": None,
            "withdrawal": None,
        },
    }
    state["landings"].append(landing)
    return landing


def bind_acceptance_digest(root: Path, state: dict[str, Any], index: int) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { acceptanceDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const index = Number(process.env.ADR_INDEX)
state.adrs[index].acceptance.transitionDigest = acceptanceDigest(state, state.adrs[index])
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "ADR_INDEX": str(index)},
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def accepted_state(root: Path, question_ids: list[str]) -> dict[str, Any]:
    """Build a valid accepted fixture using the model's exported digest.

    The production checker still performs the validation. This helper only
    obtains the non-self-referential digest needed to make a positive fixture.
    """

    state = load_state(root)
    adr = state["adrs"][0]
    document = root / adr["path"]
    relationship_header = (
        "- **Closes:** "
        + ", ".join(
            f"[{question_id}](unresolved.md#{question_id.lower()})" for question_id in question_ids
        )
        if question_ids
        else "- **Closes:** no unresolved decision"
    )
    document.write_text(
        document.read_text(encoding="utf-8").replace("Proposed", "Accepted", 1)
        + f"\n{relationship_header}\n",
        encoding="utf-8",
    )
    adr["lifecycle"] = "Accepted"
    adr["resolves"] = question_ids
    adr["acceptance"] = {
        "transitionDigest": "0" * 64,
        "contentDigest": hashlib.sha256(document.read_bytes()).hexdigest(),
        "reviewedIdentity": {
            "class": "external-git-commit",
            "value": "1" * 40,
        },
        "actor": "@owner",
        "at": "2026-08-30T12:00:00Z",
        "outcome": "accepted",
        "authority": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 106,
        },
    }
    write_state(root, state)

    return bind_acceptance_digest(root, state, 0)


def replacement_state(root: Path) -> dict[str, Any]:
    state = load_state(root)
    old = state["landings"][0]
    replacement = {
        "id": "runner/L8-v2",
        "kind": old["kind"],
        "requires": [],
        "authorityAnchor": old["authorityAnchor"],
        "replaces": old["id"],
        "replacement": {
            "digest": "0" * 64,
            "attestation": {
                "digest": "0" * 64,
                "actor": "@owner",
                "at": "2026-08-30T12:00:00Z",
                "outcome": "replaced",
                "authority": {
                    "type": "github-issue",
                    "repository": "pulse-ops-ai/secure-home-agent-platform",
                    "number": 106,
                },
            },
        },
        "delivery": {
            "lifecycle": "Planned",
            "completionPolicy": "reviewed-delivery-v1",
            "completion": None,
            "withdrawal": None,
        },
    }
    state["landings"].append(replacement)
    write_state(root, state)
    return state


def bind_replacement_digest(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { replacementDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const oldNode = state.landings.find((node) => node.id === 'runner/L8')
const newNode = state.landings.find((node) => node.id === 'runner/L8-v2')
const digest = replacementDigest(oldNode, newNode)
newNode.replacement.digest = digest
newNode.replacement.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def bind_all_replacement_digests(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { replacementDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const nodes = [...state.gates, ...state.landings]
for (const node of nodes) {
  if (node.replaces === null) continue
  const oldNode = nodes.find((candidate) => candidate.id === node.replaces)
  const digest = replacementDigest(oldNode, node)
  node.replacement.digest = digest
  node.replacement.attestation.digest = digest
}
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def bind_completion_digest(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { completionDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const landing = state.landings[0]
const completion = landing.delivery.completion
const digest = completionDigest(landing, completion)
completion.digest = digest
completion.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def bind_withdrawal_digest(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    digest_script = """
import fs from 'node:fs'
import { withdrawalDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const landing = state.landings[0]
const withdrawal = landing.delivery.withdrawal
const digest = withdrawalDigest(landing, withdrawal)
withdrawal.digest = digest
withdrawal.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    updated_state = cast(dict[str, Any], json.loads(updated.stdout))
    write_state(root, updated_state)
    return updated_state


def complete_state(root: Path) -> dict[str, Any]:
    state = load_state(root)
    landing = state["landings"][0]
    artifact_path = state["adrs"][0]["path"]
    artifact_digest = hashlib.sha256((root / artifact_path).read_bytes()).hexdigest()
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-delivery",
            "deliveredIdentity": {
                "class": "content-sha256",
                "value": artifact_digest,
                "scope": [artifact_path],
            },
            "policyEvidenceIdentities": [
                {
                    "class": "content-sha256",
                    "value": artifact_digest,
                    "scope": [artifact_path],
                }
            ],
            "archivedOpenSpec": {
                "path": artifact_path,
                "contentDigest": artifact_digest,
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    return bind_completion_digest(root, state)


def withdrawn_state(root: Path) -> dict[str, Any]:
    state = load_state(root)
    landing = state["landings"][0]
    artifact_path = state["adrs"][0]["path"]
    artifact_digest = hashlib.sha256((root / artifact_path).read_bytes()).hexdigest()
    landing["delivery"]["lifecycle"] = "Withdrawn"
    landing["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": {
            "type": "withdrawal",
            "decisionIdentity": {
                "class": "content-sha256",
                "value": artifact_digest,
                "scope": [artifact_path],
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "withdrawn",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    return bind_withdrawal_digest(root, state)


def spike_state(root: Path) -> dict[str, Any]:
    state = load_state(root)
    landing = state["landings"][0]
    landing["kind"] = "spike-landing"
    landing["authorityAnchor"] = {
        "type": "github-issue",
        "repository": "pulse-ops-ai/secure-home-agent-platform",
        "number": 54,
    }
    landing["delivery"]["completionPolicy"] = "reviewed-spike-evidence-v1"
    evidence_root = root / "spike"
    evidence_root.mkdir()
    manifest_path = "spike/MANIFEST.sha256"
    findings_path = "spike/findings.md"
    (root / manifest_path).write_text("findings\n", encoding="utf-8")
    (root / findings_path).write_text("# Spike findings\n", encoding="utf-8")
    manifest_digest = hashlib.sha256((root / manifest_path).read_bytes()).hexdigest()
    findings_digest = hashlib.sha256((root / findings_path).read_bytes()).hexdigest()
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-spike-evidence",
            "deliveredIdentity": {
                "class": "external-git-commit",
                "value": "8" * 40,
                "scope": [manifest_path, findings_path],
            },
            "policyEvidenceIdentities": [
                {"class": "content-sha256", "value": manifest_digest, "scope": [manifest_path]},
                {"class": "content-sha256", "value": findings_digest, "scope": [findings_path]},
            ],
            "noOpenSpec": True,
            "evidenceRoot": "spike",
            "manifest": {"path": manifest_path, "contentDigest": manifest_digest},
            "findings": {"path": findings_path, "contentDigest": findings_digest},
            "mergedPullRequest": {
                "type": "github-pull-request",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 73,
            },
            "mergedCommit": {
                "class": "external-git-commit",
                "value": "9" * 40,
                "scope": [manifest_path, findings_path],
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 54,
            },
        },
    }
    landing["delivery"]["completion"]["digest"] = "0" * 64
    write_state(root, state)
    return bind_completion_digest(root, state)


def test_valid_fixture_derives_separate_readiness_axes(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    payload = assert_valid(root)
    assert assert_valid(root)["derived"] == payload["derived"]
    assert payload["derived"]["questions"]["U4"]["resolved"] is False
    assert payload["derived"]["gates"]["runner/GATE-U4"]["satisfied"] is False
    readiness = payload["derived"]["readiness"]["runner/L8"]
    assert readiness["state"] == "Ready"
    assert readiness["authorizationAssessment"] == "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION"


def test_missing_registry_is_not_an_empty_registry(tmp_path: Path) -> None:
    root = tmp_path / "empty"
    root.mkdir()
    assert_refused(root, "ADV-G23")


def test_duplicate_json_key_is_rejected_before_object_construction(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    assert_refused(
        root,
        "ADV-G01",
        raw='{"schemaVersion":1,"schemaVersion":1}',
    )


def test_unknown_field_and_noncanonical_bytes_are_rejected(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["questions"][0]["resolved"] = False
    write_state(root, state)
    assert_refused(root, "ADV-G02")

    root = copy_fixture(tmp_path / "noncanonical")
    assert_refused(root, "ADV-G03", raw=(root / "state.json").read_text() + "\n")


def test_unknown_collection_is_rejected_and_no_derived_answer_is_emitted(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["unclassifiedCollection"] = []
    write_state(root, state)
    payload = assert_refused(root, "ADV-G02", "ADV-G39")
    assert "derived" not in payload


def test_invalid_calendar_and_typed_anchor_shapes_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["adrs"][0]["proposedOn"] = "2026-02-30"
    write_state(root, state)
    assert_refused(root, "ADV-G02")

    root = copy_fixture(tmp_path / "anchor")
    state = load_state(root)
    del state["gates"][0]["authorityAnchor"]["repository"]
    write_state(root, state)
    assert_refused(root, "ADV-G12")


def test_v1_runner_node_identity_range_is_closed(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["id"] = "runner/L1"
    write_state(root, state)
    assert_refused(root, "ADV-G12")

    root = copy_fixture(tmp_path / "gate")
    state = load_state(root)
    state["gates"][0]["id"] = "runner/GATE-U9"
    write_state(root, state)
    assert_refused(root, "ADV-G12")


def test_truncated_state_never_reads_as_empty(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    raw = (root / "state.json").read_text(encoding="utf-8")
    assert_refused(root, "ADV-G01", "ADV-G23", raw=raw[: len(raw) // 2])


def test_duplicate_members_dangling_and_bare_references_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["sources"].append(state["gates"][0]["sources"][0])
    write_state(root, state)
    assert_refused(root, "ADV-G38")

    root = copy_fixture(tmp_path / "dangling")
    state = load_state(root)
    state["landings"][0]["requires"] = ["runner/L99"]
    write_state(root, state)
    assert_refused(root, "ADV-G12")

    root = copy_fixture(tmp_path / "bare")
    state = load_state(root)
    state["landings"][0]["requires"] = ["L8"]
    write_state(root, state)
    assert_refused(root, "ADV-G12")


def test_sequence_and_completion_envelope_collections_reject_duplicates(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["reviewedOrderingIntent"] = ["first", "first"]
    write_state(root, state)
    assert_refused(root, "ADV-G38")

    root = copy_fixture(tmp_path / "envelope")
    state = load_state(root)
    state["attestations"]["genesisCompletion"] = {
        "envelopeDigest": "0" * 64,
        "members": [
            {"landingId": "runner/L8", "digest": "1" * 64},
            {"landingId": "runner/L8", "digest": "2" * 64},
        ],
        "actor": "@owner",
        "at": "2026-08-30T12:00:00Z",
        "outcome": "attested",
        "authority": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 106,
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G65")


def test_prerequisite_cycle_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L10"])
    add_landing(state, landing_id="runner/L10", requires=["runner/L9"])
    write_state(root, state)
    assert_refused(root, "ADV-G10")


def test_proposed_resolver_and_unevaluable_predicate_do_not_satisfy_gate(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["adrs"][0]["resolves"] = ["U4"]
    document = root / state["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8") + "\n- **Decides:** [U4](unresolved.md#u4)\n",
        encoding="utf-8",
    )
    write_state(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["questions"]["U4"]["resolved"] is False

    root = copy_fixture(tmp_path / "predicate")
    state = load_state(root)
    state["gates"][0]["predicate"]["name"] = "always-true"
    write_state(root, state)
    assert_refused(root, "ADV-G09")


def test_relationship_header_must_mirror_registry(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    state = load_state(root)
    state["adrs"][0]["resolves"] = []
    write_state(root, state)
    assert_refused(root, "ADV-G14")


def test_two_current_accepted_resolvers_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, ["U4"])
    second_document = root / "docs/decisions/ADR-0002.md"
    second_document.parent.mkdir(parents=True, exist_ok=True)
    second_document.write_text(
        "# Second fixture\n\n- **Status:** Accepted\n- **Closes:** [U4](../unresolved.md#u4)\n",
        encoding="utf-8",
    )
    second = {
        "id": "ADR-0002",
        "path": "docs/decisions/ADR-0002.md",
        "title": "Second fixture decision",
        "lifecycle": "Accepted",
        "proposedOn": "2026-08-30",
        "resolves": ["U4"],
        "supersedes": [],
        "acceptance": {
            "transitionDigest": "0" * 64,
            "contentDigest": hashlib.sha256(second_document.read_bytes()).hexdigest(),
            "reviewedIdentity": {
                "class": "external-git-commit",
                "value": "2" * 40,
            },
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "accepted",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    state["adrs"].append(second)
    state = bind_acceptance_digest(root, state, 0)
    state = bind_acceptance_digest(root, state, 1)
    # The resolver uniqueness refusal is independent of transition evidence.
    assert_refused(root, "ADV-G06")


def test_accepted_bytes_and_header_mirror_are_bound(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    document = root / load_state(root)["adrs"][0]["path"]
    document.write_text("# Fixture decision\n\n- **Status:** Accepted\nchanged\n", encoding="utf-8")
    assert_refused(root, "ADV-G04")

    root = copy_fixture(tmp_path / "header")
    state = accepted_state(root, ["U4"])
    document = root / state["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8").replace("Accepted", "Proposed", 1),
        encoding="utf-8",
    )
    assert_refused(root, "ADV-G14")

    root = copy_fixture(tmp_path / "body-status")
    state = load_state(root)
    document = root / state["adrs"][0]["path"]
    document.write_text(
        "# Fixture decision\n\n---\n\n- **Status:** Proposed\n",
        encoding="utf-8",
    )
    assert_refused(root, "ADV-G14")


def test_convenience_resolution_fields_and_unknown_policy_are_refused(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["satisfied"] = True
    state["landings"][0]["blockedOn"] = []
    write_state(root, state)
    assert_refused(root, "ADV-G02")

    root = copy_fixture(tmp_path / "policy")
    state = load_state(root)
    state["landings"][0]["delivery"]["completionPolicy"] = "legacy"
    write_state(root, state)
    assert_refused(root, "ADV-G15", "ADV-G30")


def test_completion_requires_policy_specific_scoped_evidence(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Complete"
    state["landings"][0]["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-delivery",
            "deliveredIdentity": {
                "class": "external-git-commit",
                "value": "3" * 40,
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G26")


def test_valid_completion_binds_scope_and_separates_historical_authorization(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["state"] == "Ready"
    assert payload["derived"]["readiness"]["runner/L8"]["authorizationAssessment"] is None

    before = payload["digests"]
    state["landings"][0]["delivery"]["completion"]["attestation"]["actor"] = "@reviewer"
    write_state(root, state)
    after = assert_valid(root)["digests"]
    assert after == before

    root = copy_fixture(tmp_path / "evidence-binding")
    state = complete_state(root)
    state["landings"][0]["delivery"]["completion"]["evidence"]["type"] = "reviewed-delivery-v1"
    write_state(root, state)
    assert_refused(root, "ADV-G19")

    root = copy_fixture(tmp_path / "opaque-delivery")
    state = complete_state(root)
    state["landings"][0]["delivery"]["completion"]["evidence"]["deliveredIdentity"] = {
        "class": "external-git-commit",
        "value": "7" * 40,
        "scope": [state["adrs"][0]["path"]],
    }
    write_state(root, state)
    assert_refused(root, "ADV-G33")


def test_acceptance_provenance_change_does_not_change_transition_identity(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, ["U4"])
    before = assert_valid(root)["digests"]
    state["adrs"][0]["acceptance"]["reviewedIdentity"]["value"] = "2" * 40
    write_state(root, state)
    after = assert_valid(root)["digests"]
    assert after == before


def test_spike_policy_requires_bound_evidence_and_no_retrospective_openspec(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    spike_state(root)
    assert_valid(root)

    root = copy_fixture(tmp_path / "missing-evidence")
    state = load_state(root)
    landing = state["landings"][0]
    landing["kind"] = "spike-landing"
    landing["authorityAnchor"] = {
        "type": "github-issue",
        "repository": "pulse-ops-ai/secure-home-agent-platform",
        "number": 54,
    }
    landing["delivery"]["completionPolicy"] = "reviewed-spike-evidence-v1"
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-spike-evidence",
            "deliveredIdentity": {
                "class": "external-git-commit",
                "value": "8" * 40,
                "scope": ["spike/findings.md"],
            },
            "policyEvidenceIdentities": [],
            "noOpenSpec": True,
            "mergedPullRequest": {
                "type": "github-pull-request",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 73,
            },
            "mergedCommit": {
                "class": "external-git-commit",
                "value": "9" * 40,
                "scope": ["spike/findings.md"],
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 54,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G27")

    root = copy_fixture(tmp_path / "retrospective")
    state = spike_state(root)
    evidence = state["landings"][0]["delivery"]["completion"]["evidence"]
    evidence["noOpenSpec"] = False
    evidence["archivedOpenSpec"] = {
        "path": "spike/findings.md",
        "contentDigest": hashlib.sha256((root / "spike/findings.md").read_bytes()).hexdigest(),
    }
    write_state(root, state)
    assert_refused(root, "ADV-G28")


def test_withdrawal_is_typed_and_never_satisfies_prerequisites(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Withdrawn"
    state["landings"][0]["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": {"type": "withdrawal"},
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "withdrawn",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G67")

    root = copy_fixture(tmp_path / "withdrawn-valid")
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Withdrawn"
    state["landings"][0]["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": {
            "type": "withdrawal",
            "decisionIdentity": {
                "class": "content-sha256",
                "value": "4" * 64,
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "withdrawn",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    # The zero digest is intentionally wrong; this exercises the preimage check.
    assert_refused(root, "ADV-G67")

    root = copy_fixture(tmp_path / "withdrawn-bound")
    withdrawn_state(root)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["authorizationAssessment"] is None

    state = load_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L8"])
    write_state(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L9"]["unsatisfied"] == ["runner/L8"]


def test_malformed_terminal_envelopes_fail_closed_without_crashing(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Complete"
    state["landings"][0]["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": None,
        "attestation": None,
    }
    write_state(root, state)
    assert_refused(root, "ADV-G26")

    root = copy_fixture(tmp_path / "withdrawal")
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Withdrawn"
    state["landings"][0]["delivery"]["withdrawal"] = {
        "from": "Planned",
        "to": "Withdrawn",
        "digest": "0" * 64,
        "evidence": None,
        "attestation": None,
    }
    write_state(root, state)
    assert_refused(root, "ADV-G67")


def test_missing_local_commit_does_not_prove_completion(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Complete"
    state["landings"][0]["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "type": "reviewed-delivery",
            "deliveredIdentity": {
                "class": "local-git-commit",
                "value": "5" * 40,
                "scope": [state["adrs"][0]["path"]],
            },
            "policyEvidenceIdentities": [{"class": "external-git-commit", "value": "6" * 40}],
            "archivedOpenSpec": {
                "path": state["adrs"][0]["path"],
                "contentDigest": hashlib.sha256(
                    (root / state["adrs"][0]["path"]).read_bytes()
                ).hexdigest(),
            },
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "completed",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    write_state(root, state)
    assert_refused(root, "ADV-G33")


def test_malformed_top_level_collections_fail_without_derived_state(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["landings"] = {}
    write_state(root, state)
    payload = assert_refused(root, "ADV-G02")
    assert "derived" not in payload


def test_target_state_replacement_requires_digest_and_complete_closure(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = replacement_state(root)
    assert_refused(root, "ADV-G66")

    root = copy_fixture(tmp_path / "valid")
    state = replacement_state(root)
    state = bind_replacement_digest(root, state)
    assert_valid(root)

    root = copy_fixture(tmp_path / "dependent")
    state = replacement_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L8"])
    write_state(root, state)
    assert_refused(root, "ADV-G66")


def test_gate_replacement_digest_binds_source_references(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    old = state["gates"][0]
    replacement = json.loads(json.dumps(old))
    replacement["id"] = "runner/GATE-U4-v2"
    replacement["sources"] = ["adr.md#changed"]
    replacement["replaces"] = old["id"]
    replacement["replacement"] = {
        "digest": "0" * 64,
        "attestation": {
            "digest": "0" * 64,
            "actor": "@owner",
            "at": "2026-08-30T12:00:00Z",
            "outcome": "replaced",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        },
    }
    state["gates"].append(replacement)
    write_state(root, state)
    assert_refused(root, "ADV-G66")


def test_transitive_replacement_closure_repoints_every_dependent(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    add_landing(state, landing_id="runner/L9", requires=["runner/L8"])
    add_landing(state, landing_id="runner/L10", requires=["runner/L9"])
    old_l8, old_l9, old_l10 = state["landings"]
    for old, replacement_id, requirements in [
        (old_l8, "runner/L8-v2", []),
        (old_l9, "runner/L9-v2", ["runner/L8-v2"]),
        (old_l10, "runner/L10-v2", ["runner/L9-v2"]),
    ]:
        replacement = json.loads(json.dumps(old))
        replacement["id"] = replacement_id
        replacement["requires"] = requirements
        replacement["replaces"] = old["id"]
        replacement["replacement"] = {
            "digest": "0" * 64,
            "attestation": {
                "digest": "0" * 64,
                "actor": "@owner",
                "at": "2026-08-30T12:00:00Z",
                "outcome": "replaced",
                "authority": {
                    "type": "github-issue",
                    "repository": "pulse-ops-ai/secure-home-agent-platform",
                    "number": 106,
                },
            },
        }
        state["landings"].append(replacement)
    state = bind_all_replacement_digests(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["currentNodeIds"] == [
        "runner/GATE-U4",
        "runner/L10-v2",
        "runner/L8-v2",
        "runner/L9-v2",
    ]


def test_historical_references_and_three_node_chain_are_queryable(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = replacement_state(root)
    state = bind_replacement_digest(root, state)
    old = state["landings"][0]
    second = state["landings"][-1]
    third = {
        "id": "runner/L8-v3",
        "kind": "implementation-landing",
        "requires": [],
        "authorityAnchor": old["authorityAnchor"],
        "replaces": "runner/L8-v2",
        "replacement": {
            "digest": "0" * 64,
            "attestation": {
                "digest": "0" * 64,
                "actor": "@owner",
                "at": "2026-08-30T12:00:00Z",
                "outcome": "replaced",
                "authority": {
                    "type": "github-issue",
                    "repository": "pulse-ops-ai/secure-home-agent-platform",
                    "number": 106,
                },
            },
        },
        "delivery": {
            "lifecycle": "Planned",
            "completionPolicy": "reviewed-delivery-v1",
            "completion": None,
            "withdrawal": None,
        },
    }
    state["landings"].append(third)
    write_state(root, state)

    digest_script = """
import fs from 'node:fs'
import { replacementDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const oldNode = state.landings.find((node) => node.id === 'runner/L8-v2')
const newNode = state.landings.find((node) => node.id === 'runner/L8-v3')
const digest = replacementDigest(oldNode, newNode)
newNode.replacement.digest = digest
newNode.replacement.attestation.digest = digest
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", digest_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    state = json.loads(updated.stdout)
    write_state(root, state)
    payload = assert_valid(root)
    assert payload["derived"]["currentNodeIds"] == ["runner/GATE-U4", "runner/L8-v3"]
    assert second["replaces"] == "runner/L8"
    assert state["landings"][0]["requires"] == []


def test_set_reordering_is_canonical_and_digest_sensitive_to_real_changes(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = load_state(root)
    state["gates"][0]["sources"] = [
        "adr.md#z",
        "adr.md#a",
    ]
    write_state(root, state)
    first = canonicalize(root)
    payload = assert_valid(root)

    state["gates"][0]["sources"].reverse()
    (root / "state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    second = canonicalize(root)
    assert first == second

    state["gates"][0]["sources"] = ["adr.md#changed"]
    write_state(root, state)
    changed = assert_valid(root)
    assert changed["digests"]["primitiveDigest"] != payload["digests"]["primitiveDigest"]


def test_attestation_envelope_is_excluded_from_primitive_digest(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, ["U4"])
    before = assert_valid(root)["digests"]
    state["adrs"][0]["acceptance"]["actor"] = "@different-owner"
    write_state(root, state)
    after = assert_valid(root)["digests"]
    assert after == before


def test_policy_evidence_set_reordering_is_canonical(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    before_canonical = canonicalize(root)
    before = assert_valid(root)
    evidence = state["landings"][0]["delivery"]["completion"]["evidence"]
    evidence["policyEvidenceIdentities"].reverse()
    (root / "state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    assert canonicalize(root) == before_canonical
    (root / "state.json").write_text(before_canonical, encoding="utf-8")
    after = assert_valid(root)
    assert after["digests"] == before["digests"]


def test_current_checker_owns_no_semantic_rule(tmp_path: Path) -> None:
    del tmp_path
    source = CHECKER.read_text(encoding="utf-8")
    assert "exactly-one-current-accepted-resolver" not in source
    assert "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION" not in source


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "changed semantic input"),
        ("proposedOn", "2026-08-31"),
    ],
)
def test_primitive_preimage_changes_when_a_real_field_changes(
    tmp_path: Path, field: str, value: str
) -> None:
    root = copy_fixture(tmp_path)
    before = assert_valid(root)["digests"]["primitiveDigest"]
    state = load_state(root)
    state["adrs"][0][field] = value
    write_state(root, state)
    after = assert_valid(root)["digests"]["primitiveDigest"]
    assert after != before
