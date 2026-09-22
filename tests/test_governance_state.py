"""PR-1 conformance tests for the offline governance-state checker.

The tests intentionally invoke the shipped Node entry point for every
current-state refusal. Python only prepares isolated temporary fixture trees
and checks the reported contract; it does not reimplement the model.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CHECKER = REPOSITORY_ROOT / "scripts/check-governance-state.mjs"
FIXTURE_ROOT = REPOSITORY_ROOT / "tests/fixtures/governance/current"


@pytest.fixture(scope="module", autouse=True)
def historical_objects() -> None:
    subprocess.run(
        [
            "node",
            str(REPOSITORY_ROOT / "tests/fixtures/governance/genesis/objects.mjs"),
            str(REPOSITORY_ROOT),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


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


def bind_acceptance_digest(
    root: Path, state: dict[str, Any], index: int, path: str = "state.json"
) -> dict[str, Any]:
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
    write_state(root, updated_state, path)
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
        + "\n- **Accepted:** 2026-08-30\n- **Decider:** @owner\n"
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
        "decisionDate": "2026-08-30",
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


def bind_completion_digest(
    root: Path, state: dict[str, Any], path: str = "state.json"
) -> dict[str, Any]:
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
    write_state(root, updated_state, path)
    return updated_state


def bind_withdrawal_digest(
    root: Path, state: dict[str, Any], path: str = "state.json"
) -> dict[str, Any]:
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
    write_state(root, updated_state, path)
    return updated_state


# ── a real archived OpenSpec package, in a real Git repository ───────────────
#
# `reviewed-delivery-v1` binds a whole child change and two provenance
# identities, and the model answers with repository OBSERVATIONS: root presence,
# scoped trees, exact member bytes, and reachability from current history. None
# of that can be faked with a JSON literal, so the fixture is a real repository
# with a real active-to-archive move.
#
# The move is byte-identical on purpose — that is what makes the review-time
# digests still equal the archived member digests, and it is what the content
# form rests on.

CHANGE_ID = "demo-change"
ARCHIVE_DATE = "2026-09-10"
ACTIVE_ROOT = f"openspec/changes/{CHANGE_ID}"
ARCHIVE_ROOT = f"openspec/changes/archive/{ARCHIVE_DATE}-{CHANGE_ID}"
REVIEW_FILE = "preimplementation-review.md"

#: The planning projection, plus members deliberately OUTSIDE it. The archive
#: legitimately carries more than the review read.
PLANNING_MEMBERS = [
    ".openspec.yaml",
    "proposal.md",
    "specs/alpha/spec.md",
    "specs/beta/spec.md",
    "design.md",
    "assurance.md",
    "tasks.md",
]
NON_PLANNING_MEMBERS = ["README.md", "reviews/1-aaaaaaaaaaaa.md"]

GIT_ENV = {
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@e",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@e",
}


def git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
        env={**GIT_ENV, "PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(root)},
    ).stdout.strip()


def review_block(artifacts: list[dict[str, str]], **overrides: Any) -> str:
    record: dict[str, Any] = {
        "contract": "preimplementation-review-v2",
        "schema": "governed-spec-driven-v2",
        "rubric": "governed-preimplementation-review-v1",
        "reviewed_commit": "a" * 40,
        "reviewed_base_commit": "b" * 40,
        "review_epoch": 1,
        "scope_id": "demo-scope",
        "reviewed_at": "2026-09-01T10:00:00Z",
        "reviewer": "An Independent Reviewer",
        "verdict": "ARCHITECTURE_ACCEPTED",
        "unresolved_p1_count": 0,
        "unassigned_p2_p3_count": 0,
        "invariant_set_changed": False,
        "authority_allocation_complete": True,
        "reviewed_artifacts": artifacts,
    }
    record.update(overrides)
    return (
        "# Review\n\n<!-- openspec-review-gate\n" + json.dumps(record, indent=2) + "\n-->\n\nbody\n"
    )


def observed_members(archive: Path) -> list[dict[str, str]]:
    """Digests read off disk, never asserted."""
    return sorted(
        (
            {
                "path": str(p.relative_to(archive)),
                "contentSha256": hashlib.sha256(p.read_bytes()).hexdigest(),
            }
            for p in archive.rglob("*")
            if p.is_file()
        ),
        key=lambda m: m["path"].encode("utf-8"),
    )


def build_archived_repository(
    root: Path,
    *,
    review_overrides: dict[str, Any] | None = None,
    manifest_paths: list[str] | None = None,
    corrupt_review_digest: bool = False,
) -> dict[str, Any]:
    """Active package committed, then moved to the archive."""
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-q", "--allow-empty", "-m", "fixture base")

    active = root / ACTIVE_ROOT
    for relative in [*PLANNING_MEMBERS, *NON_PLANNING_MEMBERS]:
        target = active / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"# {relative}\n\ncontent for {relative}\n", encoding="utf-8")

    declared = manifest_paths if manifest_paths is not None else PLANNING_MEMBERS
    artifacts = [
        {
            "path": relative,
            "sha256": (
                "0" * 64
                if corrupt_review_digest
                else hashlib.sha256((active / relative).read_bytes()).hexdigest()
            ),
        }
        for relative in declared
    ]
    (active / REVIEW_FILE).write_text(
        review_block(artifacts, **(review_overrides or {})), encoding="utf-8"
    )

    git(root, "add", "-A")
    git(root, "commit", "-qm", "reviewed active package")
    reviewed_commit = git(root, "rev-parse", "HEAD")

    (root / ARCHIVE_ROOT).parent.mkdir(parents=True, exist_ok=True)
    git(root, "mv", ACTIVE_ROOT, ARCHIVE_ROOT)
    git(root, "commit", "-qm", "archive the delivered change")

    return {
        "reviewedCommit": reviewed_commit,
        "archivedCommit": git(root, "rev-parse", "HEAD"),
        "members": observed_members(root / ARCHIVE_ROOT),
    }


def compute_bundle_digest(archived: dict[str, Any]) -> str:
    """Computed by the shipped model, not reimplemented here."""
    script = """
import { bundleSha256 } from './scripts/governance/model/archived-openspec.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
process.stdout.write(bundleSha256(JSON.parse(raw)))
"""
    return subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(archived),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def archived_openspec(
    built: dict[str, Any], *, reviewed_form: str = "content", **overrides: Any
) -> dict[str, Any]:
    """The closed `archivedOpenSpec` object."""
    if reviewed_form == "content":
        digest = next(m["contentSha256"] for m in built["members"] if m["path"] == REVIEW_FILE)
        reviewed_identity = {
            "class": "content-sha256",
            "value": digest,
            "scope": [f"{ARCHIVE_ROOT}/{REVIEW_FILE}"],
        }
    else:
        reviewed_identity = {
            "class": "local-git-commit",
            "value": built["reviewedCommit"],
            "scope": [ACTIVE_ROOT],
        }

    archived = {
        "schemaVersion": 1,
        "contract": "archived-openspec-change-v1",
        "changeId": CHANGE_ID,
        "activeRoot": ACTIVE_ROOT,
        "archiveRoot": ARCHIVE_ROOT,
        "members": built["members"],
        "bundleSha256": "0" * 64,
        "reviewedIdentity": reviewed_identity,
        "archivedPackageIdentity": {
            "class": "local-git-commit",
            "value": built["archivedCommit"],
            "scope": [ARCHIVE_ROOT],
        },
    }
    archived.update(overrides)
    archived["bundleSha256"] = compute_bundle_digest(archived)
    return archived


def complete_state(
    root: Path,
    *,
    reviewed_form: str = "content",
    archived_overrides: dict[str, Any] | None = None,
    built: dict[str, Any] | None = None,
    path: str = "state.json",
    **build_kwargs: Any,
) -> dict[str, Any]:
    built = built if built is not None else build_archived_repository(root, **build_kwargs)
    state = load_state(root, path)
    landing = state["landings"][0]
    artifact_path = state["adrs"][0]["path"]
    artifact_digest = hashlib.sha256((root / artifact_path).read_bytes()).hexdigest()
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "policy": "reviewed-delivery-v1",
            "deliveredIdentity": {
                "class": "content-sha256",
                "value": artifact_digest,
                "scope": [artifact_path],
            },
            "archivedOpenSpec": archived_openspec(
                built, reviewed_form=reviewed_form, **(archived_overrides or {})
            ),
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
    write_state(root, state, path)
    return bind_completion_digest(root, state, path)


def withdrawn_state(root: Path, path: str = "state.json") -> dict[str, Any]:
    state = load_state(root, path)
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
    write_state(root, state, path)
    return bind_withdrawal_digest(root, state, path)


# The spike evidence root is a REAL local commit.
#
# `mergedEvidenceIdentity` must be a `local-git-commit` covering the complete
# evidence-root scope, so the fixture commits the evidence root and reads the
# commit back rather than asserting a literal. A JSON hash would prove nothing,
# which is the whole point of the requirement.

SPIKE_ROOT = "docs/spikes/runner-spike"
SPIKE_MANIFEST = f"{SPIKE_ROOT}/MANIFEST.sha256"
SPIKE_FINDINGS = f"{SPIKE_ROOT}/findings.md"
SPIKE_NOTES = f"{SPIKE_ROOT}/notes/observations.md"


def build_spike_repository(root: Path) -> dict[str, Any]:
    """Commit the evidence root; report the merged commit and its real scope."""
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "fixture base")

    documents = {SPIKE_FINDINGS: "# Spike findings\n", SPIKE_NOTES: "observations\n"}
    for relative, text in documents.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    (root / SPIKE_MANIFEST).write_text(
        "".join(
            f"{hashlib.sha256((root / r).read_bytes()).hexdigest()}  {r}\n"
            for r in sorted(documents)
        ),
        encoding="utf-8",
    )

    git(root, "add", "-A")
    git(root, "commit", "-qm", "merge spike evidence")
    return {
        "mergedCommit": git(root, "rev-parse", "HEAD"),
        # Every file actually under the evidence root, read off disk.
        "scope": sorted(
            str(path.relative_to(root)) for path in (root / SPIKE_ROOT).rglob("*") if path.is_file()
        ),
    }


def digest_of(root: Path, relative: str) -> str:
    return hashlib.sha256((root / relative).read_bytes()).hexdigest()


def spike_evidence(root: Path, built: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    """The exact `reviewed-spike-evidence-v1` branch of the merged contract."""
    evidence: dict[str, Any] = {
        "policy": "reviewed-spike-evidence-v1",
        "openSpecApplicability": "not-applicable",
        "mergedEvidencePullRequest": {
            "type": "github-pull-request",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 73,
        },
        "mergedEvidenceIdentity": {
            "class": "local-git-commit",
            "value": built["mergedCommit"],
            "scope": built["scope"],
        },
        "evidenceRoot": SPIKE_ROOT,
        "evidenceManifestIdentity": {
            "class": "content-sha256",
            "value": digest_of(root, SPIKE_MANIFEST),
            "scope": [SPIKE_MANIFEST],
        },
        "findingsIdentity": {
            "class": "content-sha256",
            "value": digest_of(root, SPIKE_FINDINGS),
            "scope": [SPIKE_FINDINGS],
        },
    }
    evidence.update(overrides)
    return evidence


def spike_state(
    root: Path,
    *,
    built: dict[str, Any] | None = None,
    evidence: dict[str, Any] | None = None,
    **overrides: Any,
) -> dict[str, Any]:
    built = built if built is not None else build_spike_repository(root)
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
        "evidence": (
            evidence if evidence is not None else spike_evidence(root, built, **overrides)
        ),
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
    return bind_completion_digest(root, state)


def completion_digest_of(landing: dict[str, Any]) -> str:
    """The shipped preimage, asked directly — no reimplementation here."""
    script = """
import { completionDigest } from './scripts/governance/model/index.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
const landing = JSON.parse(raw)
process.stdout.write(completionDigest(landing, landing.delivery.completion))
"""
    return subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(landing),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


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
        "# ADR-0002: Second fixture\n\n- **Status:** Accepted\n"
        "- **Accepted:** 2026-08-30\n- **Decider:** @owner\n"
        "- **Closes:** [U4](../unresolved.md#u4)\n",
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
            "outcome": "accepted",
            "decisionDate": "2026-08-30",
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
            "policy": "reviewed-delivery-v1",
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
    # The discriminator is refused on its own terms; the evidence branch
    # short-circuits before the digest check, which is why only the shape
    # refusal is asserted here. The digest binding has its own case below.
    state["landings"][0]["delivery"]["completion"]["evidence"]["policy"] = "reviewed-delivery"
    write_state(root, state)
    assert_refused(root, "ADV-G30")

    root = copy_fixture(tmp_path / "digest-binding")
    state = complete_state(root)
    # A well-formed digest that is simply not the computed one, so nothing but
    # the preimage binding can refuse it.
    state["landings"][0]["delivery"]["completion"]["digest"] = "9" * 64
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

    # An arbitrary issue and merged PR, with none of the bound evidence.
    root = copy_fixture(tmp_path / "missing-evidence")
    built = build_spike_repository(root)
    spike_state(
        root,
        built=built,
        evidence={
            "policy": "reviewed-spike-evidence-v1",
            "openSpecApplicability": "not-applicable",
            "mergedEvidencePullRequest": {
                "type": "github-pull-request",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 73,
            },
        },
    )
    assert_refused(root, "ADV-G27")

    # A manufactured archive cannot stand in for the explicit applicability
    # fact; it is both a foreign field and its own named adversary.
    root = copy_fixture(tmp_path / "retrospective")
    built = build_spike_repository(root)
    spike_state(
        root,
        built=built,
        archivedOpenSpec={
            "path": SPIKE_FINDINGS,
            "contentDigest": digest_of(root, SPIKE_FINDINGS),
        },
    )
    assert_refused(root, "ADV-G28", "ADV-G02")


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
            "policy": "reviewed-delivery-v1",
            "deliveredIdentity": {
                "class": "local-git-commit",
                "value": "5" * 40,
                "scope": [state["adrs"][0]["path"]],
            },
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
    # Digest invariance is not permission to mutate governed evidence.
    assert_refused(root, "ADV-G99")
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {primitiveDigest, relationshipDigest} "
            "from './scripts/governance/model/index.mjs';"
            "import fs from 'node:fs'; const s=JSON.parse(fs.readFileSync(0,'utf8'));"
            "console.log(JSON.stringify({primitiveDigest:primitiveDigest(s),relationshipDigest:relationshipDigest(s)}))",
        ],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    after = json.loads(result.stdout)
    assert after == before


def test_evidence_identity_scope_set_reordering_is_canonical(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    before_canonical = canonicalize(root)
    before = assert_valid(root)
    evidence = state["landings"][0]["delivery"]["completion"]["evidence"]
    evidence["archivedOpenSpec"]["reviewedIdentity"]["scope"].reverse()
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


# ── the archived OpenSpec identity: both reviewed forms ─────────────────────
#
# Every case below drives the shipped checker over a real Git repository. The
# model's answers come from repository observations — root presence, scoped
# trees, exact bytes, reachability — so none of this can be satisfied by a JSON
# literal that merely looks right.


def unreachable_commit(root: Path) -> str:
    """A real commit that exists and is reachable from nothing.

    Exactly the state `git fetch origin refs/pull/<n>/head` leaves behind: the
    object is in the store, no ref keeps it alive, and it can be pruned.
    """
    git(root, "checkout", "-q", "-b", "side")
    (root / "stray.txt").write_text("stray\n", encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "unreachable work")
    stray = git(root, "rev-parse", "HEAD")
    git(root, "checkout", "-q", "main")
    git(root, "branch", "-qD", "side")
    return stray


def unreachable_commit_carrying_active_package(root: Path, built: dict[str, Any]) -> str:
    """An unreachable commit that would otherwise satisfy every stage rule.

    The point of the durability guard is that this commit is indistinguishable
    from a valid reviewed snapshot except for reachability: the active root is
    present, the archive root is absent, and the scoped tree matches the
    declared members exactly. Anything less and the mutation below would be
    refused by some other rule, proving nothing.
    """
    head = git(root, "rev-parse", "HEAD")
    reviewed = built["reviewedCommit"]
    git(root, "checkout", "-q", "-b", "side", reviewed)
    stray = git(root, "rev-parse", "HEAD")
    git(root, "checkout", "-q", "main")
    git(root, "branch", "-qD", "side")
    assert stray == reviewed, "the side branch must name the reviewed snapshot"
    # Rewrite main so the reviewed snapshot is no longer an ancestor, while the
    # archive it produced stays exactly as it is.
    git(root, "checkout", "-q", "--orphan", "detached")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "re-rooted history without the reviewed snapshot")
    git(root, "branch", "-qM", "main")
    void = git(root, "rev-parse", "HEAD")
    assert void != head
    return stray


def test_a_content_backed_reviewed_identity_over_the_full_projection_is_accepted(
    tmp_path: Path,
) -> None:
    """The delivery shape a squash produces: the reviewed commit need not
    survive, and the accepted review record carries the whole-package claim."""
    root = copy_fixture(tmp_path)
    complete_state(root)
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["state"] == "Ready"


def test_a_commit_backed_reviewed_identity_reachable_from_head_is_accepted(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    complete_state(root, reviewed_form="commit")
    assert_valid(root)


def test_a_reviewed_commit_present_but_unreachable_is_refused(tmp_path: Path) -> None:
    """Object presence is not durability, and the checker must NOT silently
    downgrade the recorded form to the content one: the form is authored
    evidence, not a repair the checker performs."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    stray = unreachable_commit(root)

    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "local-git-commit",
                "value": stray,
                "scope": [ACTIVE_ROOT],
            }
        },
    )
    payload = assert_refused(root, "ADV-G81")
    assert any("not reachable" in p["message"] for p in payload["problems"]), payload


def test_an_unreachable_archived_package_identity_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    stray = unreachable_commit(root)

    complete_state(
        root,
        built=built,
        archived_overrides={
            "archivedPackageIdentity": {
                "class": "local-git-commit",
                "value": stray,
                "scope": [ARCHIVE_ROOT],
            }
        },
    )
    payload = assert_refused(root, "ADV-G81")
    assert any("not reachable" in p["message"] for p in payload["problems"]), payload


def test_an_external_git_commit_cannot_be_a_reviewed_identity(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "external-git-commit",
                "value": "c" * 40,
                "scope": [ACTIVE_ROOT],
            }
        },
    )
    assert_refused(root, "ADV-G81")


@pytest.mark.parametrize(
    ("label", "overrides"),
    [
        ("closure-verdict", {"verdict": "FOCUSED_CLOSURE_REQUIRED"}),
        ("rejection-verdict", {"verdict": "ARCHITECTURE_REJECTED"}),
        ("unresolved-p1", {"unresolved_p1_count": 1}),
        ("unassigned-p2-p3", {"unassigned_p2_p3_count": 2}),
        ("authority-incomplete", {"authority_allocation_complete": False}),
        ("invariant-set-changed", {"invariant_set_changed": True}),
        ("old-contract-version", {"contract": "preimplementation-review-v1"}),
        ("wrong-schema", {"schema": "governed-spec-driven-v1"}),
        ("wrong-rubric", {"rubric": "something-else-v1"}),
        ("placeholder-reviewer", {"reviewer": "REPLACE_WITH_INDEPENDENT_REVIEWER"}),
        ("impossible-instant", {"reviewed_at": "2026-02-30T00:00:00Z"}),
        ("malformed-reviewed-commit", {"reviewed_commit": "not-a-commit"}),
        ("epoch-below-one", {"review_epoch": 0}),
    ],
)
def test_a_review_record_that_is_not_a_complete_acceptance_is_refused(
    tmp_path: Path, label: str, overrides: dict[str, Any]
) -> None:
    """Every declared digest still matches in each of these.

    Digest agreement proves the bytes are the ones the record names; it never
    converts a record that was not an acceptance into one.
    """
    root = copy_fixture(tmp_path / label)
    complete_state(root, review_overrides=overrides)
    payload = assert_refused(root, "ADV-G81")
    assert any(
        "not a complete accepting" in problem["message"] for problem in payload["problems"]
    ), (label, payload)


@pytest.mark.parametrize(
    ("label", "declared"),
    [
        ("single-member", [".openspec.yaml"]),
        ("missing-delta-spec", [p for p in PLANNING_MEMBERS if p != "specs/beta/spec.md"]),
        ("missing-tasks", [p for p in PLANNING_MEMBERS if p != "tasks.md"]),
        ("non-planning-member", [*PLANNING_MEMBERS, "README.md"]),
    ],
)
def test_an_incomplete_planning_manifest_is_refused(
    tmp_path: Path, label: str, declared: list[str]
) -> None:
    """Equality against the planning projection, not containment.

    Every digest these declare is correct. A subset rule would accept a record
    that read one file and call it a review of the package.
    """
    root = copy_fixture(tmp_path / label)
    complete_state(root, manifest_paths=declared)
    payload = assert_refused(root, "ADV-G81")
    assert any(
        "complete planning projection" in problem["message"] for problem in payload["problems"]
    ), (label, payload)


def test_archive_members_outside_the_planning_projection_are_accepted(tmp_path: Path) -> None:
    """The control for the rule above.

    The fixture archive carries a README and a historical review round the
    review never read. Requiring the manifest to name them would have failed the
    first real package.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    member_paths = {member["path"] for member in built["members"]}
    assert {"README.md", "reviews/1-aaaaaaaaaaaa.md", REVIEW_FILE} <= member_paths
    assert set(PLANNING_MEMBERS) < member_paths, "the projection must be a proper subset here"

    complete_state(root, built=built)
    assert_valid(root)


def test_a_reviewed_artifact_digest_mismatch_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    complete_state(root, corrupt_review_digest=True)
    assert_refused(root, "ADV-G81")


def test_an_arbitrary_member_is_not_a_whole_package_reviewed_identity(tmp_path: Path) -> None:
    """A `content-sha256` over `proposal.md` is a valid digest of one file and
    carries no whole-package claim; the review record is what carries it."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    digest = next(m["contentSha256"] for m in built["members"] if m["path"] == "proposal.md")
    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "content-sha256",
                "value": digest,
                "scope": [f"{ARCHIVE_ROOT}/proposal.md"],
            }
        },
    )
    assert_refused(root, "ADV-G81")


def test_a_correct_bundle_without_a_review_witness_is_refused(tmp_path: Path) -> None:
    """`bundleSha256` is computed at completion over the delivered package. It
    proves what was delivered, never that those bytes were reviewed."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    (root / ARCHIVE_ROOT / REVIEW_FILE).write_text(
        "# Review\n\nno gate block at all\n", encoding="utf-8"
    )
    git(root, "add", "-A")
    git(root, "commit", "-qm", "strip the review witness")

    complete_state(
        root,
        built={
            **built,
            "members": observed_members(root / ARCHIVE_ROOT),
            "archivedCommit": git(root, "rev-parse", "HEAD"),
        },
    )
    assert_refused(root, "ADV-G81")


def test_an_empty_member_set_is_refused(tmp_path: Path) -> None:
    """Non-vacuity. An empty membership is an unanswered question, not a package
    with nothing in it."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(root, built=built, archived_overrides={"members": []})
    assert_refused(root, "ADV-G79")


def test_a_commit_stage_rule_against_a_content_identity_is_a_class_error() -> None:
    """Refused as a class error, not passed vacuously and not skipped silently.

    A rule that quietly stops applying and a rule that vacuously passes look
    identical from outside the checker; this makes them different.
    """
    script = """
import { assertStageRuleApplicable } from './scripts/governance/model/archived-openspec.mjs'
const content = { class: 'content-sha256', value: 'x', scope: ['a'] }
const commit = { class: 'local-git-commit', value: 'y', scope: ['a'] }
let refused = null
try {
  assertStageRuleApplicable(content, 'active-root presence')
} catch (error) {
  refused = error.code
}
const allowed = assertStageRuleApplicable(commit, 'active-root presence')
process.stdout.write(JSON.stringify({ refused, allowed }))
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert json.loads(out) == {"refused": "IDENTITY_CLASS_ERROR", "allowed": True}


@pytest.mark.parametrize(
    ("label", "body"),
    [
        ("all-unchecked", "- [ ] 1.1 one\n- [ ] 1.2 two\n"),
        ("all-checked", "- [x] 1.1 one\n- [x] 1.2 two\n"),
        ("partially-checked", "- [x] 1.1 one\n- [ ] 1.2 two\n"),
    ],
)
def test_planning_checkboxes_do_not_affect_completion(
    tmp_path: Path, label: str, body: str
) -> None:
    """Reviewed planning is immutable evidence; `delivery.lifecycle` plus its
    completion evidence is the mutable authority. The checkbox population is
    inside `bundleSha256` and is never read to derive completion."""
    root = copy_fixture(tmp_path / label)
    built = build_archived_repository(root)
    archive = root / ARCHIVE_ROOT

    (archive / "tasks.md").write_text(body, encoding="utf-8")
    # The bytes changed, so the member digest and the review-time digest are
    # re-derived. What must NOT change is the completion verdict.
    artifacts = [
        {"path": p, "sha256": hashlib.sha256((archive / p).read_bytes()).hexdigest()}
        for p in PLANNING_MEMBERS
    ]
    (archive / REVIEW_FILE).write_text(review_block(artifacts), encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", f"tasks.md: {label}")

    complete_state(
        root,
        built={
            **built,
            "members": observed_members(archive),
            "archivedCommit": git(root, "rev-parse", "HEAD"),
        },
    )
    payload = assert_valid(root)
    assert payload["derived"]["readiness"]["runner/L8"]["state"] == "Ready", label


# ── the shared review contract is shared in BEHAVIOUR, not in name ──────────


def test_the_governance_model_has_no_copy_of_the_review_contract() -> None:
    """A component that is imported while its rules are ALSO restated elsewhere
    passes every structural check and still leaves two authorities."""
    governance = REPOSITORY_ROOT / "scripts/governance"
    owned = {
        "preimplementation-review-v2",
        "governed-preimplementation-review-v1",
        "ARCHITECTURE_ACCEPTED",
        "unresolved_p1_count",
        "authority_allocation_complete",
        "invariant_set_changed",
    }
    offenders: list[str] = []
    for source in governance.rglob("*.mjs"):
        text = source.read_text(encoding="utf-8")
        for constant in owned:
            # A comment may name it; a string literal would be a second copy.
            if f'"{constant}"' in text or f"'{constant}'" in text:
                offenders.append(f"{source.relative_to(REPOSITORY_ROOT)}: {constant}")
    assert offenders == [], offenders


def test_one_acceptance_rule_change_moves_both_consumers(tmp_path: Path) -> None:
    """F12. The load-bearing proof that the owner is SHARED.

    One acceptance rule is weakened inside the shared component and BOTH REAL
    consumers must change their answer: the OpenSpec review gate CLI, and the
    governance checker reading a content-backed reviewed identity. A component
    that only one consumer actually reads is the same defect wearing a better
    name, and it passes every structural check.

    The rule chosen is the unresolved-P1 count, because it is owned ONLY by the
    shared component — the gate's prose checks have no equivalent, so a flip
    cannot come from anywhere else.
    """
    import test_openspec_review_gate as gate_tests

    # Consumer A: the review gate CLI, over a real planning repository.
    gate_repo = gate_tests._planning_repo(tmp_path / "gate")
    gate_tests._accept(gate_repo, gate_overrides={"unresolved_p1_count": 1})

    def ask_gate() -> tuple[int, str]:
        result = gate_tests._gate(gate_repo, "verify")
        return result.returncode, result.stdout + result.stderr

    # Consumer B: the governance checker, over a content-backed reviewed identity.
    state_root = copy_fixture(tmp_path / "governance")
    complete_state(state_root, review_overrides={"unresolved_p1_count": 1})

    def ask_governance() -> int:
        return run_checker(state_root)[0].returncode

    before_gate, before_gate_output = ask_gate()
    before_governance = ask_governance()

    contract = REPOSITORY_ROOT / "scripts/openspec-review-contract.mjs"
    original = contract.read_text(encoding="utf-8")
    anchor = "  if (gate.unresolved_p1_count !== 0) {"
    assert original.count(anchor) == 1
    mutated = original.replace(anchor, "  if (false) {", 1)
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        contract.write_text(mutated, encoding="utf-8")
        after_gate, _ = ask_gate()
        after_governance = ask_governance()
    finally:
        contract.write_text(original, encoding="utf-8")
        assert contract.read_text(encoding="utf-8") == original

    assert before_gate != 0 and "UNRESOLVED_P1" in before_gate_output, before_gate_output
    assert before_governance != 0
    assert after_gate == 0, (
        "the review gate did not respond to the shared rule, so it is not reading the owner"
    )
    assert after_governance == 0, (
        "the governance checker did not respond to the shared rule, so it is not reading the owner"
    )


# ── the real delivered archive, as the conformance example ──────────────────


def test_the_real_archived_typescript_change_satisfies_the_content_form() -> None:
    """The first change this repository actually delivered under this contract.

    A rule that only its own fixtures satisfy has not been tested against
    reality. This reads the shipped archive and the shipped review record
    through the SHARED contract, with no fixture in sight — the counts are
    derived, never hard-coded, because they belong to that package and not to
    the schema.
    """
    archives = sorted((REPOSITORY_ROOT / "openspec/changes/archive").glob("*-typescript-7-*"))
    assert len(archives) == 1, archives
    archive = archives[0]

    members = observed_members(archive)
    projection_script = """
import {
  deltaSpecPaths,
  extractReviewBlock,
  planningProjection,
  validateReviewRecordShapeAndAcceptance,
} from './scripts/openspec-review-contract.mjs'
import fs from 'node:fs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
const paths = JSON.parse(raw)
const record = validateReviewRecordShapeAndAcceptance(
  extractReviewBlock(fs.readFileSync(process.env.REVIEW, 'utf8')),
)
process.stdout.write(
  JSON.stringify({
    projection: planningProjection(deltaSpecPaths(paths)),
    declared: record.reviewed_artifacts,
    verdict: record.verdict,
  }),
)
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", projection_script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps([m["path"] for m in members]),
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "REVIEW": str(archive / REVIEW_FILE)},
    ).stdout
    result = json.loads(out)

    assert result["verdict"] == "ARCHITECTURE_ACCEPTED"
    assert sorted(a["path"] for a in result["declared"]) == sorted(result["projection"])
    assert len(result["projection"]) < len(members), (
        "the planning projection must be a PROPER subset of the archive members, or the "
        "non-planning members this rule tolerates are not present to tolerate"
    )

    by_path = {m["path"]: m["contentSha256"] for m in members}
    mismatched = [
        artifact["path"]
        for artifact in result["declared"]
        if by_path.get(artifact["path"]) != artifact["sha256"]
    ]
    assert mismatched == [], mismatched


# ── the new rules are load-bearing ──────────────────────────────────────────


def run_mutated_checker(
    tmp_path: Path, root: Path, source: Path, old: str, new: str
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    """Mutate a shipped module, run the real checker, and restore it.

    The mutation asserts its own effect on the subject bytes first: a mutation
    that changed nothing re-runs the unmutated checker under a different name.
    """
    original = source.read_text(encoding="utf-8")
    assert original.count(old) == 1, f"mutation anchor is not unique in {source.name}"
    mutated = original.replace(old, new, 1)
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        source.write_text(mutated, encoding="utf-8")
        return run_checker(root)
    finally:
        source.write_text(original, encoding="utf-8")
        assert source.read_text(encoding="utf-8") == original


def test_replacing_projection_equality_with_containment_reopens_the_hole(
    tmp_path: Path,
) -> None:
    """MUTATION. Completeness is what refuses a one-file review manifest."""
    root = copy_fixture(tmp_path)
    complete_state(root, manifest_paths=[".openspec.yaml"])
    assert_refused(root, "ADV-G81")

    result, _payload = run_mutated_checker(
        tmp_path,
        root,
        REPOSITORY_ROOT / "scripts/governance/model/archived-openspec.mjs",
        "  if (JSON.stringify(declared) !== JSON.stringify(wanted)) {",
        "  if (!declared.every((p) => wanted.includes(p))) {",
    )
    assert result.returncode == 0, (
        "containment did not reopen the hole, so equality is not what closes it"
    )


def test_weakening_durability_to_object_presence_reopens_the_hole(tmp_path: Path) -> None:
    """MUTATION. Reachability, not presence, is what refuses a fetched PR ref.

    The mutation must make the hostile case ACCEPT. A mutation that merely
    changes which refusal fires proves nothing: the guard could be redundant.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    stray = unreachable_commit_carrying_active_package(root, built)
    complete_state(
        root,
        built=built,
        archived_overrides={
            "reviewedIdentity": {
                "class": "local-git-commit",
                "value": stray,
                "scope": [ACTIVE_ROOT],
            }
        },
    )
    payload = assert_refused(root, "ADV-G81")
    assert any("not reachable" in p["message"] for p in payload["problems"]), payload

    result, _payload = run_mutated_checker(
        tmp_path,
        root,
        REPOSITORY_ROOT / "scripts/governance/git-tree/index.mjs",
        "      const result = run(repoRoot, ['merge-base', '--is-ancestor', oid, head])",
        "      return PRESENT\n      const result = run(repoRoot, "
        "['merge-base', '--is-ancestor', oid, head])",
    )
    assert result.returncode == 0, (
        "presence-only durability did not ACCEPT the fetched-but-unreachable case, so "
        "reachability is not the guard that refuses it"
    )


# ── independent-review closure regressions (F01-F16) ────────────────────────
#
# Each reproduces a finding against the pre-fix implementation and pins the
# refusal the production fix now produces. They drive the shipped checker over
# real Git repositories and a real checkout; none asserts from source alone.


def substitute_review_bytes(root: Path, **overrides: Any) -> str:
    """Replace the CHECKED-OUT review artifact with a different accepting one."""
    archive = root / ARCHIVE_ROOT
    artifacts = [
        {"path": p, "sha256": hashlib.sha256((archive / p).read_bytes()).hexdigest()}
        for p in PLANNING_MEMBERS
    ]
    substituted = review_block(artifacts, **({"reviewer": "Someone Else", **overrides}))
    (archive / REVIEW_FILE).write_text(substituted, encoding="utf-8")
    return hashlib.sha256(substituted.encode("utf-8")).hexdigest()


def test_f01_worktree_review_substitution_is_refused(tmp_path: Path) -> None:
    """F01. The content identity and the member bytes must be the SAME bytes.

    Pre-fix this returned ok:true: the member manifest and every Git-tree
    observation proved artifact A while the identity was the digest of whatever
    the read returned — B — and the accepting record validated was the one the
    archive does not contain.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    state = complete_state(root, built=built)

    digest_b = substitute_review_bytes(root)
    archived = state["landings"][0]["delivery"]["completion"]["evidence"]["archivedOpenSpec"]
    declared = next(m for m in archived["members"] if m["path"] == REVIEW_FILE)
    assert declared["contentSha256"] != digest_b, "the substitution changed no bytes"
    archived["reviewedIdentity"]["value"] = digest_b
    bind_completion_digest(root, state)

    assert_refused(root, "ADV-G85")


def test_f01_the_identity_must_equal_the_declared_member_digest(tmp_path: Path) -> None:
    """F01, at the seam.

    The whole-package comparison above refuses the substitution first, so the
    specific chain link — identity == declared member digest — is driven
    directly against the semantic owner with observations that AGREE with the
    manifest and a read that does not.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    state = complete_state(root, built=built)
    archived = state["landings"][0]["delivery"]["completion"]["evidence"]["archivedOpenSpec"]

    script = """
import fs from 'node:fs'
import { validateArchivedOpenSpec } from './scripts/governance/model/archived-openspec.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
const archived = JSON.parse(raw)
const problems = []
validateArchivedOpenSpec(archived, '$', problems, {
  // Observations AGREE with the manifest; only the read disagrees.
  observe: {
    commitExists: () => 'PRESENT',
    isReachable: () => 'PRESENT',
    pathExistsAt: (_o, p) => (p === archived.archiveRoot ? 'PRESENT' : 'ABSENT'),
    treeAt: () => ({ status: 'PRESENT', entries: toEntries(archived.members) }),
    currentTree: () => ({ status: 'PRESENT', entries: toEntries(archived.members) }),
    currentPathExists: () => 'ABSENT',
  },
  checkout: {
    tree: () => toEntries(archived.members),
    pathExists: () => false,
  },
  readBytes: () => Buffer.from(process.env.SUBSTITUTE, 'utf8'),
})
function toEntries(members) {
  return new Map(members.map((m) => [m.path, { mode: '100644', sha256: m.contentSha256 }]))
}
process.stdout.write(JSON.stringify(problems))
"""
    substitute = review_block(
        [
            {
                "path": p,
                "sha256": hashlib.sha256((root / ARCHIVE_ROOT / p).read_bytes()).hexdigest(),
            }
            for p in PLANNING_MEMBERS
        ],
        reviewer="Someone Else Entirely",
    )
    substitute_digest = hashlib.sha256(substitute.encode("utf-8")).hexdigest()
    assert substitute_digest != next(
        m["contentSha256"] for m in archived["members"] if m["path"] == REVIEW_FILE
    ), "the substitute must not be the archived bytes, or the case proves nothing"
    archived["reviewedIdentity"]["value"] = substitute_digest
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(archived),
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "SUBSTITUTE": substitute},
    ).stdout
    problems = json.loads(out)
    assert any("are not the declared" in p["message"] for p in problems), problems


@pytest.mark.parametrize("label", ["dirty", "deleted", "extra"])
def test_f02_the_current_checkout_is_proved_not_just_head(tmp_path: Path, label: str) -> None:
    """F02. `ls-tree` answers what a COMMIT contains.

    Pre-fix all three returned ok:true, because the "current" observation was
    HEAD. A checker that cannot see its own working tree is checking a different
    repository from the one it is running in.
    """
    root = copy_fixture(tmp_path / label)
    complete_state(root)
    archive = root / ARCHIVE_ROOT
    if label == "dirty":
        (archive / "design.md").write_text("# tampered\n", encoding="utf-8")
    elif label == "deleted":
        (archive / "design.md").unlink()
    else:
        (archive / "sneaked.md").write_text("# extra\n", encoding="utf-8")

    assert_refused(root, "ADV-G85")


def test_f03_a_symlinked_ancestor_cannot_escape_the_repository(tmp_path: Path) -> None:
    """F03. Lexical containment is not containment.

    The archive is moved outside the repository and an ancestor replaced with a
    symlink; pre-fix the bytes were read as though they were inside, because
    only the FINAL entry was checked for a symlink.
    """
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(root, built=built)

    outside = tmp_path / "outside"
    outside.mkdir()
    parent = (root / ARCHIVE_ROOT).parent
    moved = outside / parent.name
    parent.rename(moved)
    parent.symlink_to(moved)

    payload = assert_refused(root, "ADV-G84")
    assert any("symlink" in p["message"] for p in payload["problems"]), payload


def test_f03_a_symlinked_final_member_is_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    complete_state(root, built=built)
    target = root / ARCHIVE_ROOT / "design.md"
    target.unlink()
    target.symlink_to(tmp_path / "elsewhere.md")
    (tmp_path / "elsewhere.md").write_text("# elsewhere\n", encoding="utf-8")

    assert_refused(root, "ADV-G84")


def test_f04_an_unanswerable_observation_never_satisfies_absence(tmp_path: Path) -> None:
    """F04. Absence and failure are different answers.

    Pre-fix every nonzero Git exit became `undefined`, so a corrupt store — or
    any unexpected failure — was reported as "this path is absent", which is
    exactly what several stage rules REQUIRE.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    objects = root / ".git" / "objects"
    moved = root / ".git" / "objects-moved"
    objects.rename(moved)
    try:
        payload = assert_refused(root, "ADV-G81")
        assert any("could not be observed" in p["message"] for p in payload["problems"]), payload
    finally:
        moved.rename(objects)


def test_f04_the_observer_reports_three_distinct_answers() -> None:
    """The adapter's own contract, driven rather than read."""
    script = """
import { createGitTreeObserver } from './scripts/governance/git-tree/index.mjs'
const good = createGitTreeObserver(process.cwd())
const broken = createGitTreeObserver('/')
process.stdout.write(
  JSON.stringify({
    present: good.currentPathExists('package.json'),
    absent: good.currentPathExists('definitely-not-here-xyz'),
    error: broken.currentPathExists('package.json'),
    errorTree: broken.currentTree('package.json').status,
  }),
)
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert json.loads(out) == {
        "present": "PRESENT",
        "absent": "ABSENT",
        "error": "OBSERVATION_ERROR",
        "errorTree": "OBSERVATION_ERROR",
    }


@pytest.mark.parametrize(
    ("label", "lifecycle", "field"),
    [
        ("complete-with-withdrawal", "Complete", "withdrawal"),
        ("withdrawn-with-completion", "Withdrawn", "completion"),
    ],
)
def test_f05_mutually_exclusive_terminal_envelopes_are_refused(
    tmp_path: Path, label: str, lifecycle: str, field: str
) -> None:
    """F05. An early return that records nothing is indistinguishable from
    acceptance.

    Pre-fix a `Complete` landing carrying both envelopes produced no problem at
    all and went on to satisfy a prerequisite.
    """
    root = copy_fixture(tmp_path / label)
    state = complete_state(root) if lifecycle == "Complete" else withdrawn_state(root)
    state["landings"][0]["delivery"][field] = {}
    write_state(root, state)

    payload = assert_refused(root, "ADV-G67")
    assert any("mutually exclusive" in p["message"] for p in payload["problems"]), payload
    assert payload["ok"] is False


def test_f06_an_identity_whose_scope_does_not_resolve_is_refused(tmp_path: Path) -> None:
    """F06. Object existence proves only that some commit exists."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    state = complete_state(root, built=built)
    state["landings"][0]["delivery"]["completion"]["evidence"]["deliveredIdentity"] = {
        "class": "local-git-commit",
        "value": built["archivedCommit"],
        "scope": ["does/not/exist.md"],
    }
    bind_completion_digest(root, state)

    payload = assert_refused(root, "ADV-G33")
    assert any("does not exist at the bound commit" in p["message"] for p in payload["problems"])


@pytest.mark.parametrize(
    ("label", "scope"),
    [
        ("traversal", ["../escape"]),
        ("absolute", ["/etc/passwd"]),
        ("duplicate", ["a.md", "a.md"]),
        ("non-string", [123]),
    ],
)
def test_f07_nested_scopes_use_the_shared_canonical_path_set_rule(
    tmp_path: Path, label: str, scope: list[Any]
) -> None:
    """F07. One owner for canonical path sets.

    The nested archive identities checked only "non-empty array", so traversal,
    absolute paths, duplicates and non-strings reached the observation layer
    through that door while every other scope refused them.
    """
    root = copy_fixture(tmp_path / label)
    built = build_archived_repository(root)
    complete_state(
        root,
        built=built,
        archived_overrides={
            "archivedPackageIdentity": {
                "class": "local-git-commit",
                "value": built["archivedCommit"],
                "scope": scope,
            }
        },
    )
    assert_refused(root, "ADV-G84")


def test_f07_canonical_ordering_is_owned_by_the_shared_path_set_rule() -> None:
    """Ordering is proved at the seam: the canonical writer sorts a scope on
    its way into the registry, so an unsorted one cannot be expressed through a
    state file — but the rule the archive identity shares must still have it."""
    script = """
import { canonicalPathSetProblems } from './scripts/governance/model/paths.mjs'
process.stdout.write(
  JSON.stringify({
    unsorted: canonicalPathSetProblems(['b.md', 'a.md']),
    sorted: canonicalPathSetProblems(['a.md', 'b.md']),
    duplicate: canonicalPathSetProblems(['a.md', 'a.md']),
    traversal: canonicalPathSetProblems(['../x']),
  }),
)
"""
    out = json.loads(
        subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=REPOSITORY_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    assert out["sorted"] == []
    assert out["unsorted"] and "canonical path order" in out["unsorted"][0]
    assert out["duplicate"] and "duplicate" in out["duplicate"][0]
    assert out["traversal"], out


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        ("retired-type-discriminator", {"type": "reviewed-delivery-v1"}),
        ("cross-branch-field", {"evidenceRoot": "docs/spikes/x/"}),
        ("unknown-field", {"somethingElse": True}),
    ],
)
def test_f08_evidence_branches_are_closed_per_policy(
    tmp_path: Path, label: str, mutate: dict[str, Any]
) -> None:
    """F08. A broad union let a delivery carry spike fields, and accepted a
    legacy discriminator alias as a compatibility path."""
    root = copy_fixture(tmp_path / label)
    state = complete_state(root)
    state["landings"][0]["delivery"]["completion"]["evidence"].update(mutate)
    write_state(root, state)

    result, payload = run_checker(root)
    assert result.returncode != 0, (label, payload)


def test_f09_the_bundle_identity_is_order_insensitive() -> None:
    """F09. `archivedOpenSpec.members[]` is an entity set keyed by path.

    Pre-fix, reversing the members changed the bundle digest — turning a
    presentational difference into a different delivery.
    """
    script = """
import { bundleSha256 } from './scripts/governance/model/archived-openspec.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
const archived = JSON.parse(raw)
const forward = bundleSha256(archived)
const reverse = bundleSha256({ ...archived, members: [...archived.members].reverse() })
process.stdout.write(JSON.stringify({ forward, reverse }))
"""
    archived = {
        "schemaVersion": 1,
        "contract": "archived-openspec-change-v1",
        "changeId": "demo-change",
        "activeRoot": "openspec/changes/demo-change",
        "archiveRoot": "openspec/changes/archive/2026-09-10-demo-change",
        "members": [
            {"path": "a.md", "contentSha256": "1" * 64},
            {"path": "b.md", "contentSha256": "2" * 64},
        ],
    }
    out = json.loads(
        subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=REPOSITORY_ROOT,
            input=json.dumps(archived),
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    assert out["forward"] == out["reverse"], out


def test_f09_duplicate_member_paths_are_refused(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    duplicated = [*built["members"], built["members"][0]]
    duplicated.sort(key=lambda m: m["path"].encode("utf-8"))
    complete_state(root, built=built, archived_overrides={"members": duplicated})
    assert_refused(root, "ADV-G79")


#: An INDEPENDENT golden vector: the expected digest is computed here by a
#: literal canonical serialization, never by the production preimage function.
#: A bundle rule that silently dropped a field would agree with itself forever.
GOLDEN_BUNDLE_INPUT: dict[str, Any] = {
    "schemaVersion": 1,
    "contract": "archived-openspec-change-v1",
    "changeId": "golden-change",
    "activeRoot": "openspec/changes/golden-change",
    "archiveRoot": "openspec/changes/archive/2026-01-02-golden-change",
    "members": [
        {"path": "a.md", "contentSha256": "a" * 64},
        {"path": "b.md", "contentSha256": "b" * 64},
    ],
}
#: Written out BY HAND in the repository's canonical form, never produced by
#: `bundlePreimage`. A preimage function compared only with itself agrees
#: forever, including about a field it silently stopped including.
GOLDEN_BUNDLE_PREIMAGE = """{
  "schemaVersion": 1,
  "activeRoot": "openspec/changes/golden-change",
  "archiveRoot": "openspec/changes/archive/2026-01-02-golden-change",
  "changeId": "golden-change",
  "contract": "archived-openspec-change-v1",
  "members": [
    {
      "contentSha256": "AAAA",
      "path": "a.md"
    },
    {
      "contentSha256": "BBBB",
      "path": "b.md"
    }
  ]
}
""".replace("AAAA", "a" * 64).replace("BBBB", "b" * 64)


def production_bundle_digest(archived: dict[str, Any]) -> str:
    script = """
import { bundleSha256 } from './scripts/governance/model/archived-openspec.mjs'
let raw = ''
for await (const chunk of process.stdin) raw += chunk
process.stdout.write(bundleSha256(JSON.parse(raw)))
"""
    return subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(archived),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def test_f12_the_bundle_matches_an_independently_derived_golden_vector() -> None:
    expected = hashlib.sha256(GOLDEN_BUNDLE_PREIMAGE.encode("utf-8")).hexdigest()
    assert production_bundle_digest(GOLDEN_BUNDLE_INPUT) == expected


@pytest.mark.parametrize(
    "field",
    ["schemaVersion", "contract", "changeId", "activeRoot", "archiveRoot"],
)
def test_f12_removing_any_identity_bearing_bundle_field_fails_the_golden_vector(
    tmp_path: Path, field: str
) -> None:
    """F12. Removing `activeRoot` from the preimage left every focused test
    green, because nothing compared the digest to anything but itself."""
    expected = hashlib.sha256(GOLDEN_BUNDLE_PREIMAGE.encode("utf-8")).hexdigest()
    source = REPOSITORY_ROOT / "scripts/governance/model/archived-openspec.mjs"
    original = source.read_text(encoding="utf-8")
    anchor = {
        "schemaVersion": "    schemaVersion: 1,\n",
        "contract": "    contract: ARCHIVED_CONTRACT,\n",
        "changeId": "    changeId: archived.changeId,\n",
        "activeRoot": "    activeRoot: archived.activeRoot,\n",
        "archiveRoot": "    archiveRoot: archived.archiveRoot,\n",
    }[field]
    assert original.count(anchor) == 1, field
    mutated = original.replace(anchor, "", 1)
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        source.write_text(mutated, encoding="utf-8")
        assert production_bundle_digest(GOLDEN_BUNDLE_INPUT) != expected, field
    finally:
        source.write_text(original, encoding="utf-8")
        assert source.read_text(encoding="utf-8") == original


@pytest.mark.parametrize("index", [0, 1])
def test_f12_changing_any_member_changes_the_bundle(index: int) -> None:
    base = production_bundle_digest(GOLDEN_BUNDLE_INPUT)
    for key, replacement in (("path", "z.md"), ("contentSha256", "c" * 64)):
        members = [
            dict(member) for member in cast(list[dict[str, str]], GOLDEN_BUNDLE_INPUT["members"])
        ]
        members[index][key] = replacement
        assert production_bundle_digest({**GOLDEN_BUNDLE_INPUT, "members": members}) != base


def test_f10_a_bom_prefixed_registry_is_refused(tmp_path: Path) -> None:
    """F10. The canonical form is a BYTE contract.

    `TextDecoder` strips a leading U+FEFF, so the decoded text was canonical
    while the bytes were not.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    target = root / "state.json"
    target.write_bytes(b"\xef\xbb\xbf" + target.read_bytes())

    assert_refused(root, "ADV-G03")


def test_f11_a_package_without_a_delta_spec_is_refused(tmp_path: Path) -> None:
    """F11. Two different questions, deliberately not merged: the review
    planning projection covers every `specs/**/*.md`; the minimum package
    requires at least one `specs/**/spec.md`."""
    root = copy_fixture(tmp_path)
    built = build_archived_repository(root)
    archive = root / ARCHIVE_ROOT
    for stale in list(archive.glob("specs/*/spec.md")):
        stale.rename(stale.with_name("notes.md"))
    planning = [
        p if not p.endswith("/spec.md") else p[: -len("spec.md")] + "notes.md"
        for p in PLANNING_MEMBERS
    ]
    artifacts = [
        {"path": p, "sha256": hashlib.sha256((archive / p).read_bytes()).hexdigest()}
        for p in planning
    ]
    (archive / REVIEW_FILE).write_text(review_block(artifacts), encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "specs carry notes.md only")

    complete_state(
        root,
        built={
            **built,
            "members": observed_members(archive),
            "archivedCommit": git(root, "rev-parse", "HEAD"),
        },
    )
    payload = assert_refused(root, "ADV-G78")
    assert any("specs/**/spec.md" in p["message"] for p in payload["problems"]), payload


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("proposedOn", ["2026-08-30"]),
        ("id", 1234),
        ("path", {"x": 1}),
        ("title", ["t"]),
        ("lifecycle", ["Proposed"]),
        ("resolves", "U4"),
        ("supersedes", {"a": 1}),
    ],
)
def test_f14_wrong_json_types_become_refusals_not_crashes(
    tmp_path: Path, field: str, value: Any
) -> None:
    """F14. A RegExp coerces its argument, so `DATE.test(["2026-08-30"])` was
    TRUE and the next line threw a TypeError out of the checker.

    A crash is not a verdict: it exits nonzero with no problem list, which is
    indistinguishable from a tooling failure.
    """
    root = copy_fixture(tmp_path / field)
    state = load_state(root)
    state["adrs"][0][field] = value
    (root / "state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")

    result, payload = run_checker(root)
    assert result.returncode != 0
    assert "TypeError" not in result.stderr, result.stderr
    assert payload["problems"], payload


def test_f15_an_unparseable_relationship_claim_is_not_no_relationship(tmp_path: Path) -> None:
    """F15. Parse failure must not collapse to the same value as "no
    relationship".

    A plain `Closes: U4` line is not the structural form, so it parsed to
    nothing — and nothing is exactly what an empty registry relation looks like.
    """
    root = copy_fixture(tmp_path)
    accepted_state(root, [])
    document = root / load_state(root)["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8").rstrip("\n") + "\n\nCloses: U4\n", encoding="utf-8"
    )
    state = load_state(root)
    state["adrs"][0]["acceptance"]["contentDigest"] = hashlib.sha256(
        document.read_bytes()
    ).hexdigest()
    write_state(root, bind_acceptance_digest(root, state, 0))

    payload = assert_refused(root, "ADV-G14")
    assert any("cannot read structurally" in p["message"] for p in payload["problems"]), payload


def test_f15_the_structural_relationship_form_still_passes(tmp_path: Path) -> None:
    """The control. Tightening the parser must not refuse the form the
    repository actually authors."""
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    assert_valid(root)


def test_f16_a_resolved_question_names_its_acceptance_date(tmp_path: Path) -> None:
    """F16. The contract's resolution scenario requires the resolver AND its
    acceptance date."""
    root = copy_fixture(tmp_path)
    accepted_state(root, ["U4"])
    payload = assert_valid(root)
    question = payload["derived"]["questions"]["U4"]
    assert question["resolved"] is True
    assert question["resolver"] == "ADR-0001"
    assert question["resolvedOn"] == "2026-08-30", question
    assert "resolvedAt" not in question


def test_f13_the_extraction_preserved_the_review_gate_answer(tmp_path: Path) -> None:
    """F13. The extraction was required to preserve the gate's answers.

    A Windows-style drive path is the case that exposed a change. On POSIX
    `path.isAbsolute('C:/outside')` is FALSE, so pre-extraction such a path fell
    through the artifact-path check and surfaced later as ARTIFACT_SET_DRIFT.
    Adding a drive-letter test during the extraction turned that into
    INVALID_ARTIFACT_PATH — stricter, and still a behaviour change the refactor
    had no authority to make.

    Both implementations are run over the SAME fixture, so this compares
    answers rather than asserting one from source.
    """
    import test_openspec_review_gate as gate_tests

    pre_source = subprocess.run(
        [
            "git",
            "show",
            "fc1b9f4eef748f7cd0f6af7818bec94d3045f46e:scripts/openspec-review-gate.mjs",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout

    def answer(repo: Path, script: Path) -> str:
        result = subprocess.run(
            [
                "node",
                str(script),
                "verify",
                "--change",
                "demo",
                "--base",
                gate_tests.BASE,
                "--base-sha",
                subprocess.run(
                    ["git", "rev-parse", f"{gate_tests.BASE}^{{commit}}"],
                    cwd=repo,
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout.strip(),
            ],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0, result.stdout
        # The refusal CODE, the way the gate's own tests read it.
        match = re.search(r"REVIEW_GATE_REFUSED \[([A-Z_0-9]+)\]", result.stderr)
        assert match is not None, result.stderr + result.stdout
        return match.group(1)

    for name, script_path in (
        ("pre", None),
        ("post", REPOSITORY_ROOT / "scripts/openspec-review-gate.mjs"),
    ):
        repo = gate_tests._planning_repo(tmp_path / name)
        manifest = gate_tests._manifest(repo)
        gate_tests._accept(
            repo,
            gate_overrides={
                "reviewed_artifacts": [
                    *manifest["reviewed_artifacts"],
                    {"path": "C:/outside", "sha256": "0" * 64},
                ]
            },
        )
        if script_path is None:
            script_path = tmp_path / "pre-gate.mjs"
            script_path.write_text(pre_source, encoding="utf-8")
        globals().setdefault("_f13_answers", {})[name] = answer(repo, script_path)

    answers = globals()["_f13_answers"]
    assert answers["pre"] == answers["post"], (
        f"the extraction changed the gate's answer: pre={answers['pre']} post={answers['post']}"
    )
    assert answers["pre"] == "ARTIFACT_SET_DRIFT", answers


# ── F16b: a noncanonical registry is told what canonical would have been ────


def run_checker_human(root: Path) -> subprocess.CompletedProcess[str]:
    """The human-mode CLI, which is where the original finding was observed."""
    return subprocess.run(
        [
            "node",
            str(REPOSITORY_ROOT / "scripts/check-governance-state.mjs"),
            "--root",
            str(root),
            "--state",
            "state.json",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def write_noncanonical(root: Path) -> str:
    """Re-encode the SAME logical state with different whitespace.

    Logically identical, byte-different: the one case the contract names, and
    the one where "not canonical" is useless without saying what canonical is.
    Returns the canonical form the checker must report.
    """
    target = root / "state.json"
    canonical = target.read_text(encoding="utf-8")
    logical = json.loads(canonical)
    target.write_text(json.dumps(logical, indent=4) + "\n", encoding="utf-8")
    assert target.read_text(encoding="utf-8") != canonical, "the re-encoding changed no bytes"
    return canonical


def test_f16b_json_mode_reports_the_expected_canonical_form(tmp_path: Path) -> None:
    """F16b. The model already produced `canonical`; the CLI dropped it.

    Pre-fix the JSON payload carried only `ok` and `problems`, so a refusal said
    the bytes were wrong without ever saying what right looked like.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    canonical = write_noncanonical(root)

    result, payload = run_checker(root)
    assert result.returncode != 0
    assert any(problem["code"] == "ADV-G03" for problem in payload["problems"]), payload
    assert payload["canonical"] == canonical, "the reported canonical form is not the exact bytes"


def test_f16b_human_mode_reports_the_expected_canonical_form(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    complete_state(root)
    canonical = write_noncanonical(root)

    result = run_checker_human(root)
    assert result.returncode != 0
    assert "ADV-G03" in result.stderr, result.stderr
    assert "Expected canonical state:" in result.stderr, result.stderr
    emitted = result.stderr.split("Expected canonical state:\n", 1)[1]
    assert emitted.rstrip("\n") == canonical.rstrip("\n"), "human mode emitted different bytes"


def test_f16b_a_canonical_registry_still_succeeds(tmp_path: Path) -> None:
    """The positive control. A checker that refused everything would satisfy
    the requirement above and be useless."""
    root = copy_fixture(tmp_path)
    complete_state(root)

    assert_valid(root)
    human = run_checker_human(root)
    assert human.returncode == 0, human.stderr
    assert "Expected canonical state:" not in human.stderr + human.stdout


def test_f16b_unparseable_input_does_not_pretend_a_canonical_form_exists(
    tmp_path: Path,
) -> None:
    """The negative control.

    When parsing fails there is no logical state to serialize, so reporting a
    canonical form would mean inventing one. Absence here is the correct answer,
    not an omission.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    (root / "state.json").write_text("{ this is not json", encoding="utf-8")

    result, payload = run_checker(root)
    assert result.returncode != 0
    assert payload["problems"], payload
    assert "canonical" not in payload, payload

    human = run_checker_human(root)
    assert human.returncode != 0
    assert "Expected canonical state:" not in human.stderr, human.stderr


def test_f16b_the_reported_canonical_form_comes_from_the_model(tmp_path: Path) -> None:
    """MUTATION. The CLI must pass the model's serialization through, not hold a
    second opinion about canonical form.

    Changing the model's serializer must change what the checker reports. If it
    did not, the CLI would be canonicalizing on its own and the two could
    disagree about exactly the thing being reported.
    """
    root = copy_fixture(tmp_path)
    complete_state(root)
    write_noncanonical(root)
    before = run_checker(root)[1]["canonical"]

    source = REPOSITORY_ROOT / "scripts/governance/model/canonical.mjs"
    original = source.read_text(encoding="utf-8")
    anchor = "  return renderCanonical(canonicalizeValue(value), '') + '\\n'"
    assert original.count(anchor) == 1, "the serializer anchor moved"
    mutated = original.replace(
        anchor, "  return renderCanonical(canonicalizeValue(value), '') + '\\n\\n'", 1
    )
    assert mutated != original, "the mutation did not change the subject bytes"
    try:
        source.write_text(mutated, encoding="utf-8")
        after = run_checker(root)[1]["canonical"]
    finally:
        source.write_text(original, encoding="utf-8")
        assert source.read_text(encoding="utf-8") == original

    assert after != before, (
        "the checker did not follow the model's serializer, so it is reporting a canonical form "
        "of its own"
    )


# ---------------------------------------------------------------------------
# P2-1. A malformed `at` used to short-circuit every independent rule after it.
#
# The three validators guarded the timestamp as
# `typeof value.at !== 'string' || !validTimestamp(...)` and then returned.
# Both halves were defects: the type test short-circuited, so a non-string
# recorded NO problem at all, and the return abandoned fields a clock value
# says nothing about. Pre-fix, every case below exited 0 with an empty problem
# list. A malformed timestamp is one failure; it may not buy silence for the
# rest of the record.
# ---------------------------------------------------------------------------

MALFORMED_INSTANTS: list[Any] = [12345, None, ["2026-08-31T09:00:00Z"], {"at": "2026-08-31"}, True]


def test_p2_1_malformed_acceptance_at_does_not_hide_wrong_accepted_bytes(
    tmp_path: Path,
) -> None:
    for index, malformed in enumerate(MALFORMED_INSTANTS):
        root = copy_fixture(tmp_path / f"acceptance-{index}")
        state = accepted_state(root, ["U4"])
        state["adrs"][0]["acceptance"]["decisionDate"] = malformed
        state["adrs"][0]["acceptance"]["contentDigest"] = "b" * 64
        write_state(root, state)
        # ADV-G02 for the timestamp AND ADV-G04 for the accepted document bytes.
        assert_refused(root, "ADV-G02", "ADV-G04")


def test_p2_1_a_well_typed_but_invalid_acceptance_at_also_reports_both(
    tmp_path: Path,
) -> None:
    """Not merely the type test: a string that is not an instant behaves the same."""
    root = copy_fixture(tmp_path)
    state = accepted_state(root, ["U4"])
    state["adrs"][0]["acceptance"]["decisionDate"] = "2026-13-45T99:99:99Z"
    state["adrs"][0]["acceptance"]["contentDigest"] = "b" * 64
    write_state(root, state)
    payload = assert_refused(root, "ADV-G02", "ADV-G04")
    assert any(
        problem["path"].endswith(".acceptance.decisionDate")
        and "calendar date" in problem["message"]
        for problem in payload["problems"]
    ), payload


def test_p2_1_malformed_attestation_at_does_not_hide_a_wrong_outcome(
    tmp_path: Path,
) -> None:
    for index, malformed in enumerate(MALFORMED_INSTANTS):
        root = copy_fixture(tmp_path / f"outcome-{index}")
        state = complete_state(root)
        attestation = state["landings"][0]["delivery"]["completion"]["attestation"]
        attestation["at"] = malformed
        attestation["outcome"] = "not-completed"
        write_state(root, state)
        assert_refused(root, "ADV-G02", "ADV-G19")


def test_p2_1_malformed_attestation_at_does_not_hide_a_bad_authority(
    tmp_path: Path,
) -> None:
    for index, malformed in enumerate(MALFORMED_INSTANTS):
        root = copy_fixture(tmp_path / f"authority-{index}")
        state = complete_state(root)
        attestation = state["landings"][0]["delivery"]["completion"]["attestation"]
        attestation["at"] = malformed
        attestation["authority"] = {"type": "not-a-typed-anchor"}
        write_state(root, state)
        assert_refused(root, "ADV-G02", "ADV-G12")


def genesis_completion(**overrides: Any) -> dict[str, Any]:
    envelope: dict[str, Any] = {
        "envelopeDigest": "c" * 64,
        "members": [],
        "actor": "@owner",
        "at": "2026-08-30T12:00:00Z",
        "outcome": "attested",
        "authority": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 106,
        },
    }
    envelope.update(overrides)
    return envelope


def test_p2_1_malformed_genesis_at_does_not_hide_a_wrong_envelope_digest(
    tmp_path: Path,
) -> None:
    for index, malformed in enumerate(MALFORMED_INSTANTS):
        root = copy_fixture(tmp_path / f"envelope-{index}")
        state = load_state(root)
        # `envelopeDigest` is well-formed but is not the recomputed preimage, so
        # only the preimage comparison can refuse it.
        state["attestations"]["genesisCompletion"] = genesis_completion(at=malformed)
        write_state(root, state)
        payload = assert_refused(root, "ADV-G02", "ADV-G19")
        assert any(
            problem["path"].endswith(".envelopeDigest") for problem in payload["problems"]
        ), payload


def test_p2_1_malformed_genesis_at_does_not_hide_a_bad_authority_or_outcome(
    tmp_path: Path,
) -> None:
    for index, malformed in enumerate(MALFORMED_INSTANTS):
        root = copy_fixture(tmp_path / f"genesis-authority-{index}")
        state = load_state(root)
        state["attestations"]["genesisCompletion"] = genesis_completion(
            at=malformed,
            outcome="not-attested",
            authority={"type": "not-a-typed-anchor"},
        )
        write_state(root, state)
        payload = assert_refused(root, "ADV-G02", "ADV-G12", "ADV-G19")
        assert any(
            problem["path"].endswith(".outcome") and "attested" in problem["message"]
            for problem in payload["problems"]
        ), payload


def test_p2_1_valid_timestamps_remain_positive_controls(tmp_path: Path) -> None:
    """The repair records a refusal; it does not invent one."""
    root = copy_fixture(tmp_path / "acceptance")
    accepted_state(root, ["U4"])
    assert_valid(root)

    root = copy_fixture(tmp_path / "attestation")
    complete_state(root)
    assert_valid(root)

    root = copy_fixture(tmp_path / "genesis")
    state = load_state(root)
    state["attestations"]["genesisCompletion"] = genesis_completion()
    write_state(root, state)
    payload = assert_refused(root, "ADV-G19")
    # Exactly the envelope-digest refusal the fixture's placeholder earns, and
    # nothing about the well-formed timestamp.
    assert not any(problem["path"].endswith(".at") for problem in payload["problems"]), payload


# ---------------------------------------------------------------------------
# P2-2. The implementation's evidence vocabulary had drifted from the merged
# planning contract.
#
# The checker discriminated on `evidence.type`, carried a
# `policyEvidenceIdentities` set that the contract never defines, and built the
# spike branch out of `noOpenSpec`, `manifest`, `findings`, `mergedPullRequest`
# and `mergedCommit`. The accepted contract discriminates on `evidence.policy`
# and names the spike members `openSpecApplicability`,
# `mergedEvidencePullRequest`, `mergedEvidenceIdentity`, `evidenceRoot`,
# `evidenceManifestIdentity` and `findingsIdentity`. It refuses aliases, so
# nothing below is a compatibility path.
# ---------------------------------------------------------------------------


def spike_with(
    root: Path, mutate: dict[str, Any] | None = None, *, remove: tuple[str, ...] = ()
) -> dict[str, Any]:
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    for field in remove:
        del evidence[field]
    evidence.update(mutate or {})
    return spike_state(root, built=built, evidence=evidence)


def test_p2_2_the_exact_reviewed_delivery_branch_is_accepted(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    assert_valid(root)
    assert set(state["landings"][0]["delivery"]["completion"]["evidence"]) == {
        "policy",
        "deliveredIdentity",
        "archivedOpenSpec",
    }


@pytest.mark.parametrize(
    ("label", "mutate", "code"),
    [
        # The retired discriminator, under its retired name.
        ("type-discriminator", {"type": "reviewed-delivery-v1"}, "ADV-G02"),
        ("policy-evidence-identities", {"policyEvidenceIdentities": []}, "ADV-G02"),
        ("spike-field-applicability", {"openSpecApplicability": "not-applicable"}, "ADV-G02"),
        ("spike-field-evidence-root", {"evidenceRoot": "docs/spikes/x"}, "ADV-G02"),
        ("spike-field-merged-identity", {"mergedEvidenceIdentity": {}}, "ADV-G02"),
        ("unknown-field", {"somethingElse": True}, "ADV-G02"),
        # The discriminator is a mirror of the landing's selected policy.
        ("cross-policy-discriminator", {"policy": "reviewed-spike-evidence-v1"}, "ADV-G30"),
        ("absent-discriminator", {"policy": None}, "ADV-G30"),
    ],
)
def test_p2_2_the_reviewed_delivery_branch_is_closed(
    tmp_path: Path, label: str, mutate: dict[str, Any], code: str
) -> None:
    root = copy_fixture(tmp_path / label)
    state = complete_state(root)
    state["landings"][0]["delivery"]["completion"]["evidence"].update(mutate)
    write_state(root, state)
    assert_refused(root, code)


def test_p2_2_a_reviewed_delivery_branch_without_its_discriminator_is_refused(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    del state["landings"][0]["delivery"]["completion"]["evidence"]["policy"]
    write_state(root, state)
    assert_refused(root, "ADV-G30")


def test_p2_2_the_exact_spike_branch_is_accepted(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    state = spike_state(root)
    assert_valid(root)
    assert set(state["landings"][0]["delivery"]["completion"]["evidence"]) == {
        "policy",
        "openSpecApplicability",
        "mergedEvidencePullRequest",
        "mergedEvidenceIdentity",
        "evidenceRoot",
        "evidenceManifestIdentity",
        "findingsIdentity",
    }


def test_p2_2_the_retired_spike_implementation_branch_is_refused(tmp_path: Path) -> None:
    """Every name the implementation used before the merged contract."""
    root = copy_fixture(tmp_path)
    built = build_spike_repository(root)
    spike_state(
        root,
        built=built,
        evidence={
            "type": "reviewed-spike-evidence-v1",
            "deliveredIdentity": {
                "class": "external-git-commit",
                "value": "8" * 40,
                "scope": [SPIKE_FINDINGS],
            },
            "policyEvidenceIdentities": [],
            "noOpenSpec": True,
            "evidenceRoot": SPIKE_ROOT,
            "manifest": {"path": SPIKE_MANIFEST, "contentDigest": digest_of(root, SPIKE_MANIFEST)},
            "findings": {"path": SPIKE_FINDINGS, "contentDigest": digest_of(root, SPIKE_FINDINGS)},
            "mergedPullRequest": {
                "type": "github-pull-request",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 73,
            },
            "mergedCommit": {
                "class": "local-git-commit",
                "value": built["mergedCommit"],
                "scope": built["scope"],
            },
        },
    )
    payload = assert_refused(root, "ADV-G02", "ADV-G30")
    refused = {problem["path"].rsplit(".", 1)[-1] for problem in payload["problems"]}
    for retired in [
        "type",
        "deliveredIdentity",
        "policyEvidenceIdentities",
        "noOpenSpec",
        "manifest",
        "findings",
        "mergedPullRequest",
        "mergedCommit",
    ]:
        assert retired in refused, (retired, payload)


@pytest.mark.parametrize(
    ("label", "applicability"),
    [
        ("old-boolean-fact", True),
        ("boolean-false", False),
        ("null", None),
        ("alias", "notApplicable"),
        ("other-string", "applicable"),
        ("empty-string", ""),
    ],
)
def test_p2_2_open_spec_applicability_has_exactly_one_value(
    tmp_path: Path, label: str, applicability: Any
) -> None:
    root = copy_fixture(tmp_path / label)
    spike_with(root, {"openSpecApplicability": applicability})
    assert_refused(root, "ADV-G27")


def test_p2_2_the_retired_no_open_spec_boolean_does_not_state_the_fact(
    tmp_path: Path,
) -> None:
    """`noOpenSpec: true` is a foreign field AND leaves the fact unstated."""
    root = copy_fixture(tmp_path)
    spike_with(root, {"noOpenSpec": True}, remove=("openSpecApplicability",))
    assert_refused(root, "ADV-G02", "ADV-G27")


@pytest.mark.parametrize(
    "missing",
    [
        "openSpecApplicability",
        "mergedEvidencePullRequest",
        "mergedEvidenceIdentity",
        "evidenceRoot",
        "evidenceManifestIdentity",
        "findingsIdentity",
    ],
)
def test_p2_2_every_spike_member_is_required(tmp_path: Path, missing: str) -> None:
    root = copy_fixture(tmp_path / missing)
    spike_with(root, remove=(missing,))
    assert_refused(root, "ADV-G27")


@pytest.mark.parametrize(
    ("label", "mutate"),
    [
        (
            "delivered-identity",
            {"deliveredIdentity": {"class": "content-sha256", "value": "0" * 64}},
        ),
        ("archived-openspec", {"archivedOpenSpec": {"schemaVersion": 1}}),
        ("unknown-field", {"somethingElse": True}),
    ],
)
def test_p2_2_the_spike_branch_refuses_foreign_fields(
    tmp_path: Path, label: str, mutate: dict[str, Any]
) -> None:
    root = copy_fixture(tmp_path / label)
    spike_with(root, mutate)
    assert_refused(root, "ADV-G02")


def test_p2_2_a_manufactured_archive_keeps_its_own_named_refusal(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path)
    spike_with(root, {"archivedOpenSpec": {"schemaVersion": 1}})
    assert_refused(root, "ADV-G28")


def test_p2_2_the_spike_discriminator_mirrors_the_landing_policy(tmp_path: Path) -> None:
    root = copy_fixture(tmp_path / "cross-policy")
    spike_with(root, {"policy": "reviewed-delivery-v1"})
    assert_refused(root, "ADV-G30")

    root = copy_fixture(tmp_path / "absent")
    spike_with(root, remove=("policy",))
    assert_refused(root, "ADV-G30")


def test_p2_2_the_merged_evidence_identity_must_cover_the_whole_evidence_root(
    tmp_path: Path,
) -> None:
    """A convenient single file inside the root is not the evidence root.

    `mergedEvidencePullRequest` is supporting external provenance and proves
    nothing offline, so the local merged commit carries the whole burden. The
    declared scope is compared against the complete enumeration of the root at
    that commit, in both directions.
    """
    # Control: the complete scope is accepted, and it really is more than one
    # file — otherwise "complete" would be trivially satisfied.
    root = copy_fixture(tmp_path / "complete")
    state = spike_state(root)
    assert_valid(root)
    complete_scope = state["landings"][0]["delivery"]["completion"]["evidence"][
        "mergedEvidenceIdentity"
    ]["scope"]
    assert len(complete_scope) >= 3, complete_scope

    # One evidence file left out of the scope.
    root = copy_fixture(tmp_path / "partial")
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    evidence["mergedEvidenceIdentity"]["scope"] = [SPIKE_FINDINGS, SPIKE_MANIFEST]
    evidence["mergedEvidenceIdentity"]["scope"].sort()
    spike_state(root, built=built, evidence=evidence)
    payload = assert_refused(root, "ADV-G27")
    assert any(
        SPIKE_NOTES in problem["message"] and "not covered" in problem["message"]
        for problem in payload["problems"]
    ), payload

    # A scope entry outside the declared evidence root.
    root = copy_fixture(tmp_path / "outside")
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    evidence["mergedEvidenceIdentity"]["scope"] = sorted([*built["scope"], "adr.md"])
    spike_state(root, built=built, evidence=evidence)
    payload = assert_refused(root, "ADV-G27")
    assert any("outside the declared evidence root" in p["message"] for p in payload["problems"])

    # A scope entry that does not exist at the bound commit.
    root = copy_fixture(tmp_path / "nonexistent")
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    evidence["mergedEvidenceIdentity"]["scope"] = sorted(
        [*built["scope"], f"{SPIKE_ROOT}/never-committed.md"]
    )
    spike_state(root, built=built, evidence=evidence)
    assert_refused(root, "ADV-G33")


@pytest.mark.parametrize(
    ("label", "identity", "code"),
    [
        ("opaque-external", {"class": "external-git-commit", "value": "9" * 40}, "ADV-G33"),
        ("content-digest", {"class": "content-sha256", "value": "0" * 64}, "ADV-G33"),
        ("absent-local-object", {"class": "local-git-commit", "value": "5" * 40}, "ADV-G33"),
    ],
)
def test_p2_2_the_merged_evidence_identity_must_be_locally_verifiable(
    tmp_path: Path, label: str, identity: dict[str, Any], code: str
) -> None:
    root = copy_fixture(tmp_path / label)
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    evidence["mergedEvidenceIdentity"] = {**identity, "scope": built["scope"]}
    spike_state(root, built=built, evidence=evidence)
    assert_refused(root, code)


def test_p2_2_the_manifest_and_findings_identities_are_locally_verified(
    tmp_path: Path,
) -> None:
    # Wrong manifest bytes.
    root = copy_fixture(tmp_path / "manifest-bytes")
    spike_with(root, {})
    state = load_state(root)
    evidence = state["landings"][0]["delivery"]["completion"]["evidence"]
    evidence["evidenceManifestIdentity"]["value"] = "0" * 64
    write_state(root, state)
    assert_refused(root, "ADV-G04")

    # Wrong findings bytes: the digest of a real file, but not THAT file.
    root = copy_fixture(tmp_path / "findings-bytes")
    spike_with(root, {})
    state = load_state(root)
    evidence = state["landings"][0]["delivery"]["completion"]["evidence"]
    evidence["findingsIdentity"]["value"] = digest_of(root, SPIKE_MANIFEST)
    write_state(root, state)
    assert_refused(root, "ADV-G04")

    # The manifest path is fixed by the contract.
    root = copy_fixture(tmp_path / "manifest-path")
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    evidence["evidenceManifestIdentity"] = {
        "class": "content-sha256",
        "value": digest_of(root, SPIKE_NOTES),
        "scope": [SPIKE_NOTES],
    }
    spike_state(root, built=built, evidence=evidence)
    assert_refused(root, "ADV-G27")

    # Findings outside the declared evidence root.
    root = copy_fixture(tmp_path / "findings-path")
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    evidence["findingsIdentity"] = {
        "class": "content-sha256",
        "value": digest_of(root, "adr.md"),
        "scope": ["adr.md"],
    }
    spike_state(root, built=built, evidence=evidence)
    payload = assert_refused(root, "ADV-G27")
    assert any("outside the declared evidence root" in p["message"] for p in payload["problems"])

    # A commit identity cannot stand in for verified bytes.
    root = copy_fixture(tmp_path / "findings-class")
    built = build_spike_repository(root)
    evidence = spike_evidence(root, built)
    evidence["findingsIdentity"] = {
        "class": "local-git-commit",
        "value": built["mergedCommit"],
        "scope": [SPIKE_FINDINGS],
    }
    spike_state(root, built=built, evidence=evidence)
    assert_refused(root, "ADV-G27")


SPIKE_DIGEST_MUTATIONS: list[tuple[str, dict[str, Any]]] = [
    ("policy", {"policy": "reviewed-delivery-v1"}),
    ("openSpecApplicability", {"openSpecApplicability": "applicable"}),
    (
        "mergedEvidencePullRequest",
        {
            "mergedEvidencePullRequest": {
                "type": "github-pull-request",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 74,
            }
        },
    ),
    (
        "mergedEvidenceIdentity",
        {"mergedEvidenceIdentity": {"class": "local-git-commit", "value": "4" * 40, "scope": []}},
    ),
    ("evidenceRoot", {"evidenceRoot": "docs/spikes/other-spike"}),
    (
        "evidenceManifestIdentity",
        {
            "evidenceManifestIdentity": {
                "class": "content-sha256",
                "value": "1" * 64,
                "scope": [SPIKE_MANIFEST],
            }
        },
    ),
    (
        "findingsIdentity",
        {
            "findingsIdentity": {
                "class": "content-sha256",
                "value": "2" * 64,
                "scope": [SPIKE_FINDINGS],
            }
        },
    ),
]


@pytest.mark.parametrize(("field", "mutate"), SPIKE_DIGEST_MUTATIONS)
def test_p2_2_the_completion_digest_binds_every_spike_evidence_field(
    tmp_path: Path, field: str, mutate: dict[str, Any]
) -> None:
    """The generic completion preimage already binds the whole branch.

    Asked of the shipped `completionDigest`, so a field that stopped
    participating would show up here rather than in a second, spike-specific
    digest algorithm this change deliberately does not introduce.
    """
    root = copy_fixture(tmp_path / field)
    state = spike_state(root)
    landing = state["landings"][0]
    before = completion_digest_of(landing)
    assert before == landing["delivery"]["completion"]["digest"]

    landing["delivery"]["completion"]["evidence"].update(mutate)
    assert completion_digest_of(landing) != before, field


def test_p2_2_the_completion_digest_binds_the_reviewed_delivery_branch(
    tmp_path: Path,
) -> None:
    root = copy_fixture(tmp_path)
    state = complete_state(root)
    landing = state["landings"][0]
    before = completion_digest_of(landing)
    assert before == landing["delivery"]["completion"]["digest"]

    for mutate in (
        {"policy": "reviewed-spike-evidence-v1"},
        {"deliveredIdentity": {"class": "content-sha256", "value": "3" * 64, "scope": ["adr.md"]}},
    ):
        candidate = json.loads(json.dumps(landing))
        candidate["delivery"]["completion"]["evidence"].update(mutate)
        assert completion_digest_of(candidate) != before, mutate

    candidate = json.loads(json.dumps(landing))
    candidate["delivery"]["completion"]["evidence"]["archivedOpenSpec"]["bundleSha256"] = "4" * 64
    assert completion_digest_of(candidate) != before


# ===========================================================================
# PR-2 · Task 4 — two-revision history validation
#
# Every case below runs the real `check-governance-history.mjs` against a real
# Git repository. A history rule proven against a Python reimplementation would
# prove that the reimplementation works.
# ===========================================================================

HISTORY_CHECKER = REPOSITORY_ROOT / "scripts/check-governance-history.mjs"
RENDERER = REPOSITORY_ROOT / "scripts/render-governance-state.mjs"
QUERY = REPOSITORY_ROOT / "scripts/query-governance-state.mjs"

#: Inside a throwaway fixture repository only. The prohibition this landing is
#: under is that the path must not exist in THIS repository's tree, which
#: `test_pr2_the_canonical_registry_does_not_exist_yet` asserts directly.
REGISTRY_PATH = "governance/state.json"


def history_repository(tmp_path: Path, name: str = "history") -> Path:
    """A real repository whose registry can be advanced commit by commit."""
    root = tmp_path / name
    shutil.copytree(FIXTURE_ROOT, root)
    (root / "governance").mkdir()
    (root / REGISTRY_PATH).write_text(
        (root / "state.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (root / "state.json").unlink()
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "genesis-free base")
    return root


def registry(root: Path) -> dict[str, Any]:
    return load_state(root, REGISTRY_PATH)


def commit_registry(root: Path, state: dict[str, Any], message: str) -> str:
    write_state(root, state, REGISTRY_PATH)
    git(root, "add", "-A")
    # `--allow-empty` on purpose: a revision that changes nothing about the
    # registry is a legal comparison window, and the checker must pass it.
    git(root, "commit", "-q", "--allow-empty", "-m", message)
    return git(root, "rev-parse", "HEAD")


def run_history(
    root: Path,
    *,
    base: str | None,
    target: str | None = None,
    state: str = REGISTRY_PATH,
    checker: Path = HISTORY_CHECKER,
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    command = ["node", str(checker), "--root", str(root), "--state", state, "--json"]
    if base is not None:
        command += ["--base", base]
    if target is not None:
        command += ["--target", target]
    result = subprocess.run(command, cwd=REPOSITORY_ROOT, capture_output=True, text=True)
    return result, json.loads(result.stdout)


def assert_history_refused(
    root: Path, *codes: str, base: str | None, target: str | None = None
) -> dict[str, Any]:
    result, payload = run_history(root, base=base, target=target)
    assert result.returncode != 0, (payload, result.stderr)
    reported = {problem["code"] for problem in payload["problems"]}
    assert set(codes) <= reported, (payload, result.stderr)
    return payload


def assert_history_clean(root: Path, *, base: str, target: str | None = None) -> dict[str, Any]:
    result, payload = run_history(root, base=base, target=target)
    assert result.returncode == 0, (payload, result.stderr)
    assert payload["ok"] is True
    return payload


def two_revisions(tmp_path: Path, mutate: Any, *, name: str = "history") -> tuple[Path, str, str]:
    """Commit the fixture registry, apply `mutate`, commit again."""
    root = history_repository(tmp_path, name)
    base = commit_registry(root, registry(root), "base registry")
    state = registry(root)
    mutate(root, state)
    target = commit_registry(root, state, "target registry")
    return root, base, target


def test_pr2_the_canonical_registry_does_not_exist_yet() -> None:
    """The PR-2 completion gate, asserted rather than asserted about.

    The canonical authority first appears in PR-3. A fixture path is a
    candidate; a tracked `governance/state.json` would be the authority itself.
    """
    tracked = subprocess.run(
        ["git", "ls-files", "governance"],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    assert tracked == [], tracked
    assert not (REPOSITORY_ROOT / "governance").exists()


# --- 4.2 · explicit base selection -----------------------------------------


def test_adv_g21_the_base_is_explicit_and_has_no_fallback(tmp_path: Path) -> None:
    root, base, target = two_revisions(tmp_path, lambda root, state: None)

    # No base at all: the checker infers none.
    result, payload = run_history(root, base=None, target=target)
    assert result.returncode != 0
    assert {problem["code"] for problem in payload["problems"]} == {"ADV-G21"}
    assert "infers none" in payload["problems"][0]["message"]

    # An unresolvable base is a refusal, never a fallback to merge-base or HEAD~1.
    for unusable in ["0" * 40, "refs/heads/does-not-exist", "not a revision"]:
        payload = assert_history_refused(root, "ADV-G21", base=unusable, target=target)
        assert payload["comparison"] == "refused"

    # A name that resolves to a NON-commit is answered, and the answer is no.
    blob = git(root, "rev-parse", "HEAD:" + REGISTRY_PATH)
    assert_history_refused(root, "ADV-G21", base=blob, target=target)

    assert_history_clean(root, base=base, target=target)


def test_adv_g21_a_self_selecting_window_is_refused(tmp_path: Path) -> None:
    """A window containing no change proves nothing, so it may not pass."""
    root, base, target = two_revisions(tmp_path, lambda root, state: None)
    payload = assert_history_refused(root, "ADV-G21", base=target, target=target)
    assert any("selects the target revision itself" in p["message"] for p in payload["problems"])
    # And the same revision reached by a different name is still the same revision.
    assert_history_refused(root, "ADV-G21", base="HEAD", target=target)
    assert_history_clean(root, base=base, target=target)


# --- 4.2 · decision history ------------------------------------------------


def accepted_registry(root: Path) -> dict[str, Any]:
    """The fixture registry with ADR-0001 accepted, committed-ready."""
    state = registry(root)
    adr = state["adrs"][0]
    document = root / adr["path"]
    document.write_text(
        document.read_text(encoding="utf-8").replace("Proposed", "Accepted", 1)
        + "\n- **Accepted:** 2026-08-30\n- **Decider:** @owner\n"
        + "\n- **Closes:** [U4](unresolved.md#u4)\n",
        encoding="utf-8",
    )
    adr["lifecycle"] = "Accepted"
    adr["resolves"] = ["U4"]
    adr["acceptance"] = {
        "transitionDigest": "0" * 64,
        "contentDigest": hashlib.sha256(document.read_bytes()).hexdigest(),
        "reviewedIdentity": {"class": "external-git-commit", "value": "1" * 40},
        "actor": "@owner",
        "outcome": "accepted",
        "decisionDate": "2026-08-30",
        "authority": {
            "type": "github-issue",
            "repository": "pulse-ops-ai/secure-home-agent-platform",
            "number": 106,
        },
    }
    write_state(root, state, REGISTRY_PATH)
    return bind_acceptance_digest(root, state, 0, path=REGISTRY_PATH)


def introduce_decision(root: Path, state: dict[str, Any], lifecycle: str) -> None:
    """Introduce a fixture ADR without manufacturing a Proposed predecessor."""
    adr = {
        **state["adrs"][0],
        "id": "ADR-0002",
        "path": "adr2.md",
        "lifecycle": lifecycle,
        "resolves": ["U4"] if lifecycle == "Accepted" else [],
        "supersedes": [],
        "acceptance": None,
    }
    header = "Accepted" if lifecycle == "Superseded" else lifecycle
    text = f"# ADR-0002: Fixture decision\n\n- **Status:** {header}\n\n## Decision\n"
    if lifecycle != "Proposed":
        closes = "[U4](unresolved.md#u4)" if lifecycle == "Accepted" else "no unresolved decision"
        text += f"\n- **{header}:** 2026-08-30\n- **Decider:** @owner\n- **Closes:** {closes}\n"
        adr["acceptance"] = {
            "transitionDigest": "0" * 64,
            "contentDigest": hashlib.sha256(text.encode()).hexdigest(),
            "reviewedIdentity": {"class": "external-git-commit", "value": "1" * 40},
            "actor": "@owner",
            "outcome": header.lower(),
            "decisionDate": "2026-08-30",
            "authority": {
                "type": "github-issue",
                "repository": "pulse-ops-ai/secure-home-agent-platform",
                "number": 106,
            },
        }
    (root / adr["path"]).write_text(text, encoding="utf-8")
    state["adrs"].append(adr)


@pytest.mark.parametrize("lifecycle", ["Accepted", "Rejected", "Superseded"])
@pytest.mark.parametrize("rebind", [False, True], ids=["zero-digest", "recomputed-digest"])
def test_adv_g08_target_only_terminal_decisions_are_refused(
    tmp_path: Path, lifecycle: str, rebind: bool
) -> None:
    root = history_repository(tmp_path, "terminal-introduction")
    before = registry(root)
    assert_valid(root, REGISTRY_PATH)
    base = git(root, "rev-parse", "HEAD")
    # A Superseded target also needs a current Accepted successor to make the
    # single snapshot valid. It still has no prior Accepted revision.
    state = accepted_registry(root) if lifecycle == "Superseded" else registry(root)
    introduce_decision(root, state, lifecycle)
    if lifecycle == "Superseded":
        state["adrs"][0]["supersedes"] = ["ADR-0002"]
        document = root / state["adrs"][0]["path"]
        document.write_text(document.read_text() + "\n- **Supersedes:** [ADR-0002](adr2.md)\n")
        state["adrs"][0]["acceptance"]["contentDigest"] = hashlib.sha256(
            document.read_bytes()
        ).hexdigest()
    # A forged but mathematically correct Proposed->terminal preimage cannot
    # supply the absent predecessor. Bind the real successor transition too.
    script = """
import fs from 'node:fs'
import {transitionDigest,primitiveDigest,relationshipDigest}
  from './scripts/governance/model/index.mjs'
const {before,state,rebind}=JSON.parse(fs.readFileSync(0,'utf8'))
for (const adr of state.adrs) {
  if (!adr.acceptance || (!rebind && adr.id === 'ADR-0002')) continue
  adr.acceptance.transitionDigest=transitionDigest({schemaVersion:state.schemaVersion,
    priorStateDigest:primitiveDigest(before),targetPrimitiveDigest:primitiveDigest(state),
    subject:adr.id,from:'Proposed',to:adr.lifecycle,
    contentDigest:adr.acceptance.contentDigest,relationshipDigest:relationshipDigest(state)})
}
console.log(JSON.stringify(state))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps({"before": before, "state": state, "rebind": rebind}),
        capture_output=True,
        text=True,
        check=True,
    )
    target = commit_registry(root, json.loads(result.stdout), "hostile terminal first appearance")
    current = assert_valid(root, REGISTRY_PATH)
    if lifecycle == "Accepted":
        assert current["derived"]["questions"]["U4"]["resolved"] is True
        assert current["derived"]["gates"]["runner/GATE-U4"]["satisfied"] is True
    payload = assert_history_refused(root, "ADV-G08", base=base, target=target)
    assert {p["code"] for p in payload["problems"]} == {"ADV-G08"}
    assert any(p["path"] == "$.adrs.ADR-0002.lifecycle" for p in payload["problems"])


def test_a_target_only_proposed_decision_is_legal(tmp_path: Path) -> None:
    root = history_repository(tmp_path, "proposed-introduction")
    base = git(root, "rev-parse", "HEAD")
    state = registry(root)
    introduce_decision(root, state, "Proposed")
    target = commit_registry(root, state, "introduce Proposed decision")
    assert_history_clean(root, base=base, target=target)


@pytest.mark.parametrize("regressed", ["Proposed", "Rejected"])
def test_adv_g08_an_accepted_decision_cannot_regress(tmp_path: Path, regressed: str) -> None:
    root = history_repository(tmp_path, "regress-" + regressed)
    accepted_registry(root)
    base = commit_registry(root, registry(root), "accepted")

    state = registry(root)
    state["adrs"][0]["lifecycle"] = regressed
    document = root / state["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8").replace("Accepted", regressed, 1), encoding="utf-8"
    )
    state["adrs"][0]["acceptance"]["contentDigest"] = hashlib.sha256(
        document.read_bytes()
    ).hexdigest()
    state["adrs"][0]["acceptance"]["outcome"] = (
        "rejected" if regressed == "Rejected" else "accepted"
    )
    commit_registry(root, state, "regress the decision")

    payload = assert_history_refused(root, "ADV-G08", base=base)
    assert any("not a legal decision transition" in p["message"] for p in payload["problems"])


def test_adv_g04h_accepted_bytes_and_the_recorded_digest_cannot_move_together(
    tmp_path: Path,
) -> None:
    """The attack the one-revision checker cannot see.

    Rewriting the accepted document AND its recorded digest leaves a
    self-consistent snapshot: every current-revision check passes, because the
    digest really does describe the bytes on disk. Only the prior revision knows
    the bytes were different.
    """
    root = history_repository(tmp_path, "bytes")
    accepted_registry(root)
    base = commit_registry(root, registry(root), "accepted")

    state = registry(root)
    document = root / state["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8") + "\nsilently added after acceptance\n",
        encoding="utf-8",
    )
    state["adrs"][0]["acceptance"]["contentDigest"] = hashlib.sha256(
        document.read_bytes()
    ).hexdigest()
    target = commit_registry(root, state, "rewrite accepted bytes and the digest together")

    # The target is internally consistent: the one-revision checker accepts it.
    single = subprocess.run(
        ["node", str(CHECKER), "--root", str(root), "--state", REGISTRY_PATH, "--json"],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
    )
    assert single.returncode == 0, single.stdout

    assert_history_refused(root, "ADV-G40", base=base, target=target)


def test_adv_g40_acceptance_evidence_of_a_decided_adr_is_immutable(tmp_path: Path) -> None:
    root = history_repository(tmp_path, "evidence")
    accepted_registry(root)
    base = commit_registry(root, registry(root), "accepted")

    state = registry(root)
    state["adrs"][0]["acceptance"]["actor"] = "@someone-else"
    commit_registry(root, state, "rewrite the acceptance actor")
    assert_history_refused(root, "ADV-G40", base=base)


def test_adv_g35_a_resolved_questions_resolver_cannot_disappear(tmp_path: Path) -> None:
    root = history_repository(tmp_path, "resolver")
    accepted_registry(root)
    base = commit_registry(root, registry(root), "accepted, U4 resolved")
    assert registry(root)["adrs"][0]["resolves"] == ["U4"]

    state = registry(root)
    state["adrs"][0]["resolves"] = []
    document = root / state["adrs"][0]["path"]
    document.write_text(
        document.read_text(encoding="utf-8").replace(
            "- **Closes:** [U4](unresolved.md#u4)", "- **Closes:** no unresolved decision"
        ),
        encoding="utf-8",
    )
    state["adrs"][0]["acceptance"]["contentDigest"] = hashlib.sha256(
        document.read_bytes()
    ).hexdigest()
    commit_registry(root, state, "drop the resolver relationship")

    # Both the disappearance and the acceptance-record mutation are reported:
    # one rule does not excuse the other.
    assert_history_refused(root, "ADV-G35", "ADV-G40", base=base)


def test_adv_g34_a_record_cannot_be_deleted_or_renumbered(tmp_path: Path) -> None:
    cases: list[tuple[str, Callable[[dict[str, Any]], None]]] = [
        ("landings", lambda state: state["landings"].clear()),
        ("gates", lambda state: state["gates"].clear()),
        ("questions", lambda state: state["questions"].clear()),
    ]
    for collection, mutate in cases:
        root = history_repository(tmp_path, "delete-" + collection)
        base = commit_registry(root, registry(root), "base")
        state = registry(root)
        mutate(state)
        # Removing a question orphans the gate predicate; removing a gate is
        # clean. Either way the pairwise fact is the deletion.
        if collection == "questions":
            state["gates"].clear()
        if collection == "gates":
            pass
        commit_registry(root, state, "delete " + collection)
        assert_history_refused(root, "ADV-G34", base=base)


# --- 4.2 · rule inputs are immutable in place ------------------------------


@pytest.mark.parametrize(
    ("code", "mutate"),
    [
        ("ADV-G11", lambda state: state["gates"][0]["predicate"].__setitem__("question", "U6")),
        ("ADV-G13", lambda state: state["landings"][0].__setitem__("requires", [])),
        (
            "ADV-G14",
            lambda state: state["landings"][0]["authorityAnchor"].__setitem__("number", 999),
        ),
        ("ADV-G15", lambda state: state["landings"][0].__setitem__("kind", "spike-landing")),
        (
            "ADV-G15",
            lambda state: state["landings"][0]["delivery"].__setitem__(
                "completionPolicy", "reviewed-spike-evidence-v1"
            ),
        ),
    ],
)
def test_rule_inputs_cannot_be_mutated_in_place(tmp_path: Path, code: str, mutate: Any) -> None:
    """ADV-G11/G13/G14/G15 — one mechanism, distinct refusals."""
    root = history_repository(tmp_path, "rule-" + code + str(abs(hash(str(mutate))))[:6])
    state = registry(root)
    # A second question, so a repointed predicate stays EVALUABLE: otherwise the
    # target is refused for being unevaluable and the rule-input mutation this
    # case exists to prove is never reached.
    state["questions"].append(
        {
            "id": "U6",
            "anchor": "unresolved.md#u6",
            "title": "A second open question",
            "severity": "medium",
        }
    )
    (root / "unresolved.md").write_text(
        (root / "unresolved.md").read_text(encoding="utf-8")
        + "\n## U6\n\nA second open question\n",
        encoding="utf-8",
    )
    # A prerequisite, so its removal is observable.
    state["landings"][0]["requires"] = ["runner/GATE-U4"]
    base = commit_registry(root, state, "base with a prerequisite")

    state = registry(root)
    mutate(state)
    commit_registry(root, state, "mutate a rule input")
    assert_history_refused(root, code, base=base)


# --- 4.2 · delivery succession --------------------------------------------


def delivery_history_repository(tmp_path: Path, name: str) -> tuple[Path, dict[str, Any]]:
    """A real repository carrying the registry AND a real archived package."""
    root = tmp_path / name
    shutil.copytree(FIXTURE_ROOT, root)
    (root / "governance").mkdir()
    (root / REGISTRY_PATH).write_text(
        (root / "state.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (root / "state.json").unlink()
    built = build_archived_repository(root)
    return root, built


def test_ex_g27_a_legal_completion_transition_passes(tmp_path: Path) -> None:
    """The positive control. Without it every refusal below could be vacuous."""
    root, built = delivery_history_repository(tmp_path, "complete")
    base = commit_registry(root, registry(root), "planned")
    assert registry(root)["landings"][0]["delivery"]["lifecycle"] == "Planned"

    complete_state(root, built=built, path=REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "complete the landing")

    payload = assert_history_clean(root, base=base)
    assert payload["comparison"] == "pairwise"


def test_adv_g15_a_policy_cannot_be_changed_during_completion(tmp_path: Path) -> None:
    root, built = delivery_history_repository(tmp_path, "policy-swap")
    state = registry(root)
    state["landings"][0]["delivery"]["completionPolicy"] = "reviewed-spike-evidence-v1"
    state["landings"][0]["kind"] = "spike-landing"
    base = commit_registry(root, state, "planned as a spike landing")

    # The completion arrives AND the policy changes with it.
    state = registry(root)
    state["landings"][0]["kind"] = "implementation-landing"
    state["landings"][0]["delivery"]["completionPolicy"] = "reviewed-delivery-v1"
    write_state(root, state, REGISTRY_PATH)
    complete_state(root, built=built, path=REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "complete, changing the policy")

    assert_history_refused(root, "ADV-G15", base=base)


def test_adv_g29_terminal_delivery_evidence_is_immutable(tmp_path: Path) -> None:
    root, built = delivery_history_repository(tmp_path, "terminal")
    complete_state(root, built=built, path=REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "completed")
    base = git(root, "rev-parse", "HEAD")

    # Mutated: the attestation actor is provenance the envelope pins.
    state = registry(root)
    state["landings"][0]["delivery"]["completion"]["attestation"]["actor"] = "@someone-else"
    commit_registry(root, state, "rewrite terminal evidence")
    assert_history_refused(root, "ADV-G29", base=base)

    # Removed: a terminal envelope cannot be dropped by regressing the lifecycle.
    root, built = delivery_history_repository(tmp_path, "terminal-removed")
    complete_state(root, built=built, path=REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "completed")
    base = git(root, "rev-parse", "HEAD")
    state = registry(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Planned"
    state["landings"][0]["delivery"]["completion"] = None
    commit_registry(root, state, "un-complete the landing")
    payload = assert_history_refused(root, "ADV-G29", base=base)
    assert any("terminal" in problem["message"] for problem in payload["problems"])


def test_ex_g25_withdrawal_succession_is_proved_pairwise(tmp_path: Path) -> None:
    for source in ["Planned", "InProgress"]:
        root = history_repository(tmp_path, "withdraw-" + source)
        state = registry(root)
        state["landings"][0]["delivery"]["lifecycle"] = source
        base = commit_registry(root, state, "base " + source)

        withdrawn_state(root, REGISTRY_PATH)
        state = registry(root)
        state["landings"][0]["delivery"]["withdrawal"]["from"] = source
        bind_withdrawal_digest(root, state, REGISTRY_PATH)
        git(root, "add", "-A")
        git(root, "commit", "-qm", "withdraw")
        payload = assert_history_clean(root, base=base)
        assert payload["comparison"] == "pairwise"


def test_adv_g75_an_illegal_withdrawal_source_lifecycle_is_refused(tmp_path: Path) -> None:
    """Target-state validity cannot infer a legal predecessor.

    The withdrawn target is perfectly well formed on its own; only the base
    revision knows the landing was already `Complete`.
    """
    root, built = delivery_history_repository(tmp_path, "withdraw-complete")
    complete_state(root, built=built, path=REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "completed")
    base = git(root, "rev-parse", "HEAD")

    state = registry(root)
    state["landings"][0]["delivery"]["lifecycle"] = "Planned"
    state["landings"][0]["delivery"]["completion"] = None
    write_state(root, state, REGISTRY_PATH)
    withdrawn_state(root, REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "withdraw a completed landing")

    payload = assert_history_refused(root, "ADV-G75", base=base)
    assert any("Planned or InProgress base" in p["message"] for p in payload["problems"])


def test_adv_g75_a_withdrawal_envelope_cannot_claim_a_source_it_did_not_have(
    tmp_path: Path,
) -> None:
    root = history_repository(tmp_path, "withdraw-from")
    base = commit_registry(root, registry(root), "planned")

    withdrawn_state(root, REGISTRY_PATH)
    state = registry(root)
    state["landings"][0]["delivery"]["withdrawal"]["from"] = "InProgress"
    bind_withdrawal_digest(root, state, REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "withdraw claiming InProgress")

    assert_history_refused(root, "ADV-G75", base=base)


def test_adv_g29_terminal_withdrawal_evidence_is_immutable(tmp_path: Path) -> None:
    root = history_repository(tmp_path, "withdrawn-terminal")
    withdrawn_state(root, REGISTRY_PATH)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "withdrawn")
    base = git(root, "rev-parse", "HEAD")

    state = registry(root)
    state["landings"][0]["delivery"]["withdrawal"]["attestation"]["actor"] = "@someone-else"
    commit_registry(root, state, "rewrite withdrawal evidence")
    assert_history_refused(root, "ADV-G29", base=base)


# --- 4.2 · post-genesis node identity --------------------------------------


def replacement_pair(root: Path, state: dict[str, Any], old_id: str, new_id: str) -> dict[str, Any]:
    """Add `new_id` as a sanctioned replacement of `old_id`, digest bound."""
    old = next(node for node in state["landings"] if node["id"] == old_id)
    replacement = json.loads(json.dumps(old))
    replacement["id"] = new_id
    replacement["replaces"] = old_id
    # `replaces` and `replacement` are paired on the NEW identity: the envelope
    # is the evidence for the transition that introduced it.
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
    replacement["delivery"] = {
        "lifecycle": "Planned",
        "completionPolicy": old["delivery"]["completionPolicy"],
        "completion": None,
        "withdrawal": None,
    }
    state["landings"].append(replacement)
    return state


def bind_replacements(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    script = """
import fs from 'node:fs'
import { replacementDigest } from './scripts/governance/model/index.mjs'
const state = JSON.parse(fs.readFileSync(0, 'utf8'))
const nodes = [...state.gates, ...state.landings]
for (const node of nodes) {
  if (!node.replacement || node.replaces === null) continue
  const oldNode = nodes.find((member) => member.id === node.replaces)
  const digest = replacementDigest(oldNode, node)
  node.replacement.digest = digest
  node.replacement.attestation.digest = digest
}
process.stdout.write(JSON.stringify(state))
"""
    updated = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    return cast(dict[str, Any], json.loads(updated.stdout))


def test_ex_g26_a_legal_replacement_first_appearance_passes(tmp_path: Path) -> None:
    root = history_repository(tmp_path, "replace-legal")
    base = commit_registry(root, registry(root), "base")

    state = bind_replacements(
        root, replacement_pair(root, registry(root), "runner/L8", "runner/L8-v2")
    )
    commit_registry(root, state, "replace runner/L8")
    assert_history_clean(root, base=base)


def test_adv_g16_an_unlinked_post_genesis_identity_is_refused(tmp_path: Path) -> None:
    root = history_repository(tmp_path, "replace-unlinked")
    base = commit_registry(root, registry(root), "base")

    state = registry(root)
    fresh = json.loads(json.dumps(state["landings"][0]))
    fresh["id"] = "runner/L11"
    fresh["requires"] = []
    state["landings"].append(fresh)
    commit_registry(root, state, "introduce a brand new landing")

    payload = assert_history_refused(root, "ADV-G16", base=base)
    assert any("without a replacement relationship" in p["message"] for p in payload["problems"])


def test_adv_g16_a_replacement_target_must_have_been_current_in_the_base(
    tmp_path: Path,
) -> None:
    """The fact only a second revision holds.

    In the target the cascade is perfectly well formed, so the shared model
    accepts it. Whether `runner/L8` was still current BEFORE the change is
    invisible from one snapshot.
    """
    root = history_repository(tmp_path, "replace-stale")
    state = bind_replacements(
        root, replacement_pair(root, registry(root), "runner/L8", "runner/L8-v2")
    )
    base = commit_registry(root, state, "L8 already replaced by L8a")

    # A second replacement naming the ALREADY non-current runner/L8.
    state = registry(root)
    state = replacement_pair(root, state, "runner/L8", "runner/L8-v3")
    commit_registry(root, bind_replacements(root, state), "replace an already-replaced identity")

    payload = assert_history_refused(root, "ADV-G16", base=base)
    assert any("non-current in the base revision" in p["message"] for p in payload["problems"])


def test_adv_g16_an_existing_replacement_relationship_cannot_be_edited(
    tmp_path: Path,
) -> None:
    root = history_repository(tmp_path, "replace-edited")
    state = bind_replacements(
        root, replacement_pair(root, registry(root), "runner/L8", "runner/L8-v2")
    )
    base = commit_registry(root, state, "L8 replaced")

    state = registry(root)
    for landing in state["landings"]:
        if landing["id"] == "runner/L8-v2":
            landing["replaces"] = None
    commit_registry(root, state, "detach the replacement relationship")
    assert_history_refused(root, "ADV-G16", base=base)


# --- 4.2 · authorization records -------------------------------------------


def test_adv_g18_an_authorization_record_is_refused_as_an_introduction(
    tmp_path: Path,
) -> None:
    """Both facts are reported: the unknown field, and that it was INTRODUCED.

    The current model can say the field is unknown. Only a second revision can
    say it appeared — which is the fact a reviewer needs.
    """
    root = history_repository(tmp_path, "authorization")
    base = commit_registry(root, registry(root), "base")

    state = registry(root)
    state["landings"][0]["authorizationEvidence"] = {
        "actor": "@owner",
        "outcome": "authorized",
    }
    commit_registry(root, state, "introduce an authorization record")

    payload = assert_history_refused(root, "ADV-G18", "ADV-G02", base=base)
    assert any("was introduced" in p["message"] for p in payload["problems"])


# --- 4.2 · the one genesis exception, admitted by binding -------------------


def registry_less_repository(tmp_path: Path, name: str) -> tuple[Path, str]:
    """A registry-less repository with real source/freeze/freshness proof inputs."""
    root = isolated_genesis(tmp_path, name)
    return root, git(root, "rev-parse", "HEAD")


def activate(root: Path, base: str, **overrides: Any) -> str:
    state = install_test_genesis(root, base)
    state["attestations"]["genesis"].update(overrides)
    return commit_registry(root, state, "activation")


def test_the_bound_activation_revision_is_the_one_genesis_exception(tmp_path: Path) -> None:
    root, base = registry_less_repository(tmp_path, "genesis-legal")
    activate(root, base)
    payload = assert_history_clean(root, base=base)
    assert payload["comparison"] == "genesis"


def test_adv_g58_an_unbound_registry_less_base_cannot_claim_the_exception(
    tmp_path: Path,
) -> None:
    """Absence is not a binding.

    Every commit before activation lacks a registry, so if absence alone
    qualified, any of them could be supplied as the exceptional base.
    """
    root, base = registry_less_repository(tmp_path, "genesis-unbound")
    (root / "note.md").write_text("another pre-activation commit\n", encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "a second registry-less commit")
    older = base
    newer = git(root, "rev-parse", "HEAD")
    activate(root, newer)

    assert_history_clean(root, base=newer)
    payload = assert_history_refused(root, "ADV-G58", base=older)
    assert any("not the bound activation base" in p["message"] for p in payload["problems"])


@pytest.mark.parametrize(
    ("label", "overrides"),
    [
        ("stale-freshness", {"activationFreshness": {"outcome": "stale", "digest": "5" * 64}}),
        ("wrong-base", {"activationBaseCommit": "9" * 40}),
    ],
)
def test_adv_g58_the_exception_requires_the_complete_binding(
    tmp_path: Path, label: str, overrides: dict[str, Any]
) -> None:
    root, base = registry_less_repository(tmp_path, "genesis-" + label)
    activate(root, base, **overrides)
    assert_history_refused(root, "ADV-G58", base=base)


def test_adv_g41_a_registry_appearing_without_genesis_evidence_is_refused(
    tmp_path: Path,
) -> None:
    root, base = registry_less_repository(tmp_path, "genesis-absent")
    state = load_state(root, "tests/fixtures/governance/candidate/state.json")
    (root / "governance").mkdir(exist_ok=True)
    shutil.copyfile(
        root / "tests/fixtures/governance/candidate/source-manifest.json",
        root / "governance/genesis-source-manifest.json",
    )
    commit_registry(root, state, "registry with an empty genesis attestation")
    payload = assert_history_refused(root, "ADV-G41", base=base)
    assert any("records no genesis attestation" in p["message"] for p in payload["problems"])


def test_adv_g41_and_g59_a_replacement_activation_is_not_a_second_genesis(
    tmp_path: Path,
) -> None:
    """A registry-less base whose ancestry once held a registry is a revert.

    Version one defines no reactivation, and the difference between "before the
    first activation" and "after a revert" is a fact about the ancestry, not
    about the base's own tree.
    """
    root, first_base = registry_less_repository(tmp_path, "reactivation")
    activate(root, first_base)

    # Revert: the registry is deleted.
    (root / REGISTRY_PATH).unlink()
    (root / "governance/genesis-source-manifest.json").unlink()
    git(root, "add", "-A")
    git(root, "commit", "-qm", "revert the activation")
    reverted = git(root, "rev-parse", "HEAD")

    # A second activation, bound to the post-revert base.
    activate(root, reverted)

    payload = assert_history_refused(root, "ADV-G41", "ADV-G59", base=reverted)
    assert any("post-activation" in p["message"] for p in payload["problems"])
    assert any("no reactivation protocol" in p["message"] for p in payload["problems"])


# --- 4.1 · the adapter carries no rules ------------------------------------


HISTORY_ADAPTER = REPOSITORY_ROOT / "scripts/governance/history/index.mjs"
GIT_TREE_ADAPTER = REPOSITORY_ROOT / "scripts/governance/git-tree/index.mjs"

#: Vocabulary that would mean a governance RULE had moved into the adapter.
RULE_VOCABULARY = [
    "Accepted",
    "Proposed",
    "Rejected",
    "Superseded",
    "Complete",
    "Withdrawn",
    "regression",
    "reviewed-delivery-v1",
    "reviewed-spike-evidence-v1",
    "ADV-G",
    "activationBaseCommit",
]


def test_mut_g06_a_rule_moved_into_the_history_adapter_is_detected() -> None:
    """The boundary, and proof the boundary test can fail.

    First the real adapter is checked. Then a rule is planted in a copy and the
    same check is run over it — otherwise a scan that matched nothing would look
    identical to a scan that could never match.
    """
    source = HISTORY_ADAPTER.read_text(encoding="utf-8")
    found = [word for word in RULE_VOCABULARY if word in source]
    assert found == [], found

    planted = source.replace(
        "  const reader = {",
        "  const reader = {\n    isRegression(from, to) {\n"
        "      return from === 'Accepted' && to === 'Proposed'\n    },",
        1,
    )
    assert planted != source, "the mutation did not change the subject bytes"
    replanted = [word for word in RULE_VOCABULARY if word in planted]
    assert "Accepted" in replanted and "Proposed" in replanted, replanted


def test_the_two_adapters_agree_on_which_git_failures_are_answers() -> None:
    """One Git, one vocabulary for 'that name does not resolve'.

    Two adapters that classified the same stderr differently would disagree
    about whether a required absence had been observed or merely not looked for.
    """
    pattern = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import { EXPECTED_MISS_PATTERN } from './scripts/governance/history/index.mjs'\n"
            "process.stdout.write(EXPECTED_MISS_PATTERN)",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert pattern, "the history adapter exports no miss vocabulary"
    assert pattern in GIT_TREE_ADAPTER.read_text(encoding="utf-8"), pattern


# ===========================================================================
# PR-2 · Task 5 — renderer and query
# ===========================================================================

BEGIN = "<!-- governance:begin {} -->"
END = "<!-- governance:end {} -->"


def projection_root(tmp_path: Path, name: str = "projections") -> Path:
    """A root carrying the registry and every registered projection target."""
    root = tmp_path / name
    shutil.copytree(FIXTURE_ROOT, root)
    (root / "governance").mkdir()
    (root / REGISTRY_PATH).write_text(
        (root / "state.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (root / "state.json").unlink()
    (root / "docs" / "decisions").mkdir(parents=True)
    (root / "docs" / "architecture").mkdir(parents=True)
    (root / "docs/decisions/INDEX.md").write_text(
        "# Decisions\n\nprose above\n\n"
        + BEGIN.format("decision-lifecycle")
        + "\n"
        + END.format("decision-lifecycle")
        + "\n\nprose below\n",
        encoding="utf-8",
    )
    (root / "docs/architecture/unresolved-decisions.md").write_text(
        "# Unresolved\n\n"
        + BEGIN.format("question-summary")
        + "\n"
        + END.format("question-summary")
        + "\n\nmiddle prose\n\n"
        + BEGIN.format("resolution-banners")
        + "\n"
        + END.format("resolution-banners")
        + "\n",
        encoding="utf-8",
    )
    return root


def run_renderer(root: Path, mode: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", str(RENDERER), "--root", str(root), "--state", REGISTRY_PATH, "--" + mode],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
    )


def target_bytes(root: Path) -> dict[str, bytes]:
    return {
        name: (root / name).read_bytes()
        for name in [
            "governance/STATE.md",
            "docs/decisions/INDEX.md",
            "docs/architecture/unresolved-decisions.md",
        ]
        if (root / name).exists()
    }


def test_ex_g11_check_is_a_byte_exact_no_op_and_writes_nothing(tmp_path: Path) -> None:
    root = projection_root(tmp_path)

    # Before any write, `--check` fails — and changes nothing on disk.
    before = target_bytes(root)
    failed = run_renderer(root, "check")
    assert failed.returncode != 0, failed.stdout
    assert "ADV-G36" in failed.stderr, failed.stderr
    assert target_bytes(root) == before, "--check wrote to the working tree"
    assert not (root / "governance/STATE.md").exists()

    # Write mode is the separate invocation that changes bytes.
    written = run_renderer(root, "write")
    assert written.returncode == 0, written.stderr
    assert (root / "governance/STATE.md").exists()

    # Now `--check` is a no-op, and still writes nothing.
    after = target_bytes(root)
    clean = run_renderer(root, "check")
    assert clean.returncode == 0, clean.stderr
    assert "byte-for-byte no-op" in clean.stdout
    assert target_bytes(root) == after

    # Idempotent: a second write changes nothing either.
    assert run_renderer(root, "write").returncode == 0
    assert target_bytes(root) == after


def test_adv_g36_a_hand_edited_generated_region_is_detected(tmp_path: Path) -> None:
    root = projection_root(tmp_path)
    assert run_renderer(root, "write").returncode == 0

    index = root / "docs/decisions/INDEX.md"
    index.write_text(
        index.read_text(encoding="utf-8").replace("| Proposed |", "| Accepted |", 1),
        encoding="utf-8",
    )
    result = run_renderer(root, "check")
    assert result.returncode != 0
    assert "ADV-G36" in result.stderr
    assert "docs/decisions/INDEX.md" in result.stderr

    # Prose OUTSIDE a generated region is not drift.
    assert run_renderer(root, "write").returncode == 0
    index.write_text(
        index.read_text(encoding="utf-8").replace("prose below", "different prose below"),
        encoding="utf-8",
    )
    assert run_renderer(root, "check").returncode == 0


def test_adv_g22_an_unregistered_marker_or_missing_target_is_an_error(
    tmp_path: Path,
) -> None:
    root = projection_root(tmp_path)
    assert run_renderer(root, "write").returncode == 0

    index = root / "docs/decisions/INDEX.md"
    index.write_text(
        index.read_text(encoding="utf-8")
        + "\n"
        + BEGIN.format("program-blockers")
        + "\nhand written\n"
        + END.format("program-blockers")
        + "\n",
        encoding="utf-8",
    )
    result = run_renderer(root, "check")
    assert result.returncode != 0
    assert "ADV-G22" in result.stderr
    assert "program-blockers" in result.stderr

    # A registered target that has lost its markers is an error, not a skip.
    root = projection_root(tmp_path / "missing-markers")
    (root / "docs/decisions/INDEX.md").write_text("# Decisions\n\nno markers\n", encoding="utf-8")
    result = run_renderer(root, "check")
    assert result.returncode != 0
    assert "ADV-G22" in result.stderr


def test_prop_g04_rendering_is_deterministic_and_order_insensitive(
    tmp_path: Path,
) -> None:
    """The same logical state renders the same bytes, however it was written."""
    root = projection_root(tmp_path, "deterministic")
    assert run_renderer(root, "write").returncode == 0
    first = target_bytes(root)

    other = projection_root(tmp_path, "reordered")
    state = registry(other)
    # A set-valued relationship reversed: canonically the same value.
    state["landings"][0]["requires"] = list(reversed(state["landings"][0].get("requires", [])))
    state["questions"] = list(reversed(state["questions"]))
    write_state(other, state, REGISTRY_PATH)
    assert run_renderer(other, "write").returncode == 0

    assert target_bytes(other) == first


def test_mut_g07_check_must_be_byte_exact(tmp_path: Path) -> None:
    """A `--check` that compared loosely would pass a real hand edit."""
    root = projection_root(tmp_path)
    assert run_renderer(root, "write").returncode == 0
    index = root / "docs/decisions/INDEX.md"
    # Whitespace only, inside the generated region: a trimming comparison would
    # call this equal.
    index.write_text(
        index.read_text(encoding="utf-8").replace("| ADR-0001 |", "|  ADR-0001  |", 1),
        encoding="utf-8",
    )
    assert run_renderer(root, "check").returncode != 0

    anchor = "    if (expected === actual) continue"
    subject = mutant_subject(
        tmp_path,
        [
            (
                "render-governance-state.mjs",
                anchor,
                "    if (expected.replace(/\\s+/gu, '') === "
                "String(actual).replace(/\\s+/gu, '')) continue",
            )
        ],
    )
    weakened = subprocess.run(
        [
            "node",
            str(subject / "scripts/render-governance-state.mjs"),
            "--root",
            str(root),
            "--state",
            REGISTRY_PATH,
            "--check",
        ],
        capture_output=True,
        text=True,
    )
    assert weakened.returncode == 0, "the byte-exact comparison is not load-bearing"


# --- 5.2 · the query never authorizes --------------------------------------


def run_query(
    root: Path, *, json_form: bool, node: str | None = None
) -> subprocess.CompletedProcess[str]:
    command = ["node", str(QUERY), "--root", str(root), "--state", REGISTRY_PATH]
    if json_form:
        command.append("--json")
    if node is not None:
        command += ["--node", node]
    return subprocess.run(command, cwd=REPOSITORY_ROOT, capture_output=True, text=True)


@pytest.mark.parametrize("satisfied", [False, True], ids=["unsatisfied", "satisfied"])
def test_a_targeted_gate_keeps_its_collection_and_human_explanation(
    tmp_path: Path, satisfied: bool
) -> None:
    root = projection_root(tmp_path, "targeted-gate")
    if satisfied:
        accepted_registry(root)
    full = run_query(root, json_form=True)
    assert full.returncode == 0, full.stderr
    expected = json.loads(full.stdout)["gates"][0]
    result = run_query(root, json_form=True, node="runner/GATE-U4")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"nodes": [], "gates": [expected], "questions": []}
    human = run_query(root, json_form=False, node="runner/GATE-U4")
    assert human.returncode == 0, human.stderr
    status = "satisfied" if satisfied else "unsatisfied"
    assert f"runner/GATE-U4  {status}" in human.stdout
    assert "delivery state" not in human.stdout
    assert "prerequisite readiness" not in human.stdout
    assert "undefined" not in human.stdout


def test_a_targeted_landing_keeps_its_query_axes(tmp_path: Path) -> None:
    root = projection_root(tmp_path, "targeted-landing")
    full = run_query(root, json_form=True)
    assert full.returncode == 0, full.stderr
    expected = json.loads(full.stdout)["nodes"][0]
    result = run_query(root, json_form=True, node="runner/L8")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"nodes": [expected], "gates": [], "questions": []}
    human = run_query(root, json_form=False, node="runner/L8")
    assert human.returncode == 0, human.stderr
    assert "delivery state         Planned" in human.stdout
    assert "prerequisite readiness Ready" in human.stdout
    assert "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION" in human.stdout


@pytest.mark.parametrize("json_form", [False, True], ids=["human", "json"])
def test_a_targeted_unknown_node_is_still_refused(tmp_path: Path, json_form: bool) -> None:
    root = projection_root(tmp_path, "unknown-node")
    result = run_query(root, json_form=json_form, node="runner/missing")
    assert result.returncode != 0
    assert result.stdout == ""
    assert "ADV-G12" in result.stderr


def test_prop_g05_no_query_output_ever_contains_authorized(tmp_path: Path) -> None:
    """Over every shape the fixture can take, in both output forms."""
    shapes: list[tuple[str, Any]] = [
        ("planned-blocked", lambda root: None),
        ("ready", lambda root: registry_requires(root, [])),
        ("complete", lambda root: None),
        ("withdrawn", lambda root: withdrawn_state(root, REGISTRY_PATH)),
    ]
    for label, prepare in shapes:
        root = projection_root(tmp_path / ("query-" + label))
        if label == "complete":
            built = build_archived_repository(root)
            complete_state(root, built=built, path=REGISTRY_PATH)
        else:
            prepare(root)
        for json_form in [True, False]:
            result = run_query(root, json_form=json_form)
            assert result.returncode == 0, (label, result.stderr)
            assert "AUTHORIZED" not in result.stdout, (label, json_form, result.stdout)
            assert "AUTHORIZED" not in result.stderr


def registry_requires(root: Path, requires: list[str]) -> None:
    state = registry(root)
    state["landings"][0]["requires"] = requires
    write_state(root, state, REGISTRY_PATH)


def test_adv_g17_readiness_is_reported_as_readiness_not_permission(
    tmp_path: Path,
) -> None:
    root = projection_root(tmp_path, "blocked")
    registry_requires(root, ["runner/GATE-U4"])
    payload = json.loads(run_query(root, json_form=True).stdout)
    landing = payload["nodes"][0]
    assert landing["prerequisiteReadiness"]["state"] == "NotReady"
    assert landing["prerequisiteReadiness"]["unsatisfied"] == ["runner/GATE-U4"]
    assert landing["authorizationAssessment"] == "PREREQUISITES_NOT_READY"
    assert landing["authorityAnchor"]["number"] == 56

    # Ready is still not permission.
    registry_requires(root, [])
    payload = json.loads(run_query(root, json_form=True).stdout)
    landing = payload["nodes"][0]
    assert landing["prerequisiteReadiness"]["state"] == "Ready"
    assert landing["authorizationAssessment"] == "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION"


def test_a_completed_landing_is_not_described_as_awaiting_start_authorization(
    tmp_path: Path,
) -> None:
    root = projection_root(tmp_path, "terminal-query")
    built = build_archived_repository(root)
    complete_state(root, built=built, path=REGISTRY_PATH)
    payload = json.loads(run_query(root, json_form=True).stdout)
    landing = payload["nodes"][0]
    assert landing["deliveryState"] == "Complete"
    assert landing["authorizationAssessment"] is None
    assert (
        landing["historicalAuthorization"] == "RECORDED_DELIVERY_WITHOUT_LOCAL_AUTHORIZATION_CLAIM"
    )

    explanation = run_query(root, json_form=False).stdout
    assert "not applicable to a terminal delivery" in explanation


def test_mut_g05_collapsing_the_axes_is_detected(tmp_path: Path) -> None:
    """A single collapsed status would read as permission."""
    root = projection_root(tmp_path, "axes")
    registry_requires(root, [])
    payload = json.loads(run_query(root, json_form=True).stdout)
    landing = payload["nodes"][0]
    assert {"deliveryState", "prerequisiteReadiness", "authorizationAssessment"} <= set(landing)

    source = QUERY.read_text(encoding="utf-8")
    anchor = "    authorizationAssessment: readiness?.authorizationAssessment ?? null,"
    assert source.count(anchor) == 1, "the axis anchor moved"
    mutated = source.replace(anchor, "    status: readiness?.state ?? 'NotReady',", 1)
    assert mutated != source, "the mutation did not change the subject bytes"
    try:
        QUERY.write_text(mutated, encoding="utf-8")
        collapsed = json.loads(run_query(root, json_form=True).stdout)
    finally:
        QUERY.write_text(source, encoding="utf-8")
        assert QUERY.read_text(encoding="utf-8") == source
    assert "authorizationAssessment" not in collapsed["nodes"][0], (
        "the separate authorization axis is not load-bearing"
    )


def test_ex_g18_a_hypothetical_acceptance_is_proven_as_a_fixture(
    tmp_path: Path,
) -> None:
    """The derived chain for a hypothetical ADR-0020 acceptance.

    Proven over a FIXTURE. No registry is transitioned, and nothing here
    accepts ADR-0020, resolves U4, or satisfies GATE-U4 in this repository.
    """
    root = projection_root(tmp_path, "hypothetical")
    registry_requires(root, ["runner/GATE-U4"])

    before = json.loads(run_query(root, json_form=True).stdout)
    assert before["questions"][0]["resolved"] is False
    assert before["gates"][0]["satisfied"] is False
    assert before["nodes"][0]["prerequisiteReadiness"]["state"] == "NotReady"

    accepted_registry(root)
    state = registry(root)
    state["landings"][0]["requires"] = ["runner/GATE-U4"]
    write_state(root, state, REGISTRY_PATH)

    after = json.loads(run_query(root, json_form=True).stdout)
    assert after["questions"][0]["resolved"] is True
    assert after["gates"][0]["satisfied"] is True
    assert after["nodes"][0]["prerequisiteReadiness"]["state"] == "Ready"
    # And still not permission.
    assert after["nodes"][0]["authorizationAssessment"] == (
        "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION"
    )


def test_the_query_writes_nothing(tmp_path: Path) -> None:
    root = projection_root(tmp_path, "read-only")
    before = {path: path.read_bytes() for path in sorted(root.rglob("*")) if path.is_file()}
    assert run_query(root, json_form=True).returncode == 0
    assert run_query(root, json_form=False).returncode == 0
    after = {path: path.read_bytes() for path in sorted(root.rglob("*")) if path.is_file()}
    assert after == before


# ===========================================================================
# PR-2 · Task 7.3 — mutation coverage
#
# Every mutation first proves it changed the subject bytes. A mutation runner
# that silently failed to apply its edit would report "the rule is load-bearing"
# for a rule it never removed.
# ===========================================================================

HISTORY_MODEL = REPOSITORY_ROOT / "scripts/governance/model/history.mjs"


def with_mutated_source(
    tmp_path: Path, path: Path, anchor: str, replacement: str, action: Any
) -> Any:
    subject = mutant_subject(
        tmp_path, [(str(path.relative_to(REPOSITORY_ROOT / "scripts")), anchor, replacement)]
    )
    return action(subject / "scripts/check-governance-history.mjs")


def test_mut_g04_explicit_base_exclusivity_is_load_bearing(tmp_path: Path) -> None:
    """Weaken the base rule to a silent fallback and the corpus must notice."""
    root, _base, target = two_revisions(tmp_path, lambda root, state: None, name="mut-base")

    assert run_history(root, base=None, target=target)[0].returncode != 0

    fallback = with_mutated_source(
        tmp_path,
        HISTORY_CHECKER,
        "  if (base === undefined || base === null || base === '') {",
        "  base = base ?? 'HEAD~1' // MUTANT: silently inferred base\n"
        "  if (base === undefined || base === null || base === '') {",
        lambda checker: run_history(root, base=None, target=target, checker=checker),
    )
    assert fallback[0].returncode == 0, (fallback[1], fallback[0].stderr)


def test_mut_g04_the_self_selecting_window_refusal_is_load_bearing(
    tmp_path: Path,
) -> None:
    root, _base, target = two_revisions(tmp_path, lambda root, state: None, name="mut-window")
    assert run_history(root, base=target, target=target)[0].returncode != 0

    allowed = with_mutated_source(
        tmp_path,
        HISTORY_MODEL,
        "  if (baseCommit === targetCommit) {",
        "  if (false) {",
        lambda checker: run_history(root, base=target, target=target, checker=checker),
    )
    assert allowed[0].returncode == 0, "a base==target window is refused by something else"


def test_mut_g08_rule_input_immutability_is_load_bearing(tmp_path: Path) -> None:
    """Remove the in-place mutation rule and an edited anchor must pass."""
    root = history_repository(tmp_path, "mut-rule-input")
    state = registry(root)
    state["landings"][0]["requires"] = ["runner/GATE-U4"]
    base = commit_registry(root, state, "base")
    state = registry(root)
    state["landings"][0]["authorityAnchor"]["number"] = 999
    commit_registry(root, state, "repoint the authority anchor")

    assert run_history(root, base=base)[0].returncode != 0

    permitted = with_mutated_source(
        tmp_path,
        HISTORY_MODEL,
        "      if (canonicalText(baseIdentity[field]) === "
        "canonicalText(targetIdentity[field])) continue",
        "      if (true) continue",
        lambda checker: run_history(root, base=base, checker=checker),
    )
    assert permitted[0].returncode == 0, "the rule-input comparison is not load-bearing"


def test_mut_g08_replacement_relationship_immutability_is_load_bearing(
    tmp_path: Path,
) -> None:
    """MUT-G08 covers identity-bearing replacement evidence, not only ordinary edits."""
    root = history_repository(tmp_path, "mut-replacement")
    state = bind_replacements(
        root, replacement_pair(root, registry(root), "runner/L8", "runner/L8-v2")
    )
    base = commit_registry(root, state, "L8 replaced")
    state = registry(root)
    for landing in state["landings"]:
        if landing["id"] == "runner/L8-v2":
            landing["replacement"]["attestation"]["actor"] = "@someone-else"
    commit_registry(root, state, "edit the replacement attestation")

    assert run_history(root, base=base)[0].returncode != 0

    permitted = with_mutated_source(
        tmp_path,
        HISTORY_MODEL,
        "      if (canonicalText(baseNode.replacement) !== "
        "canonicalText(targetNode.replacement)) {",
        "      if (false) {",
        lambda checker: run_history(root, base=base, checker=checker),
    )
    assert permitted[0].returncode == 0, "replacement-evidence immutability is not load-bearing"


def test_the_history_checker_owns_no_current_state_rule() -> None:
    """The entry point selects revisions, reads bytes and reports. Nothing else."""
    source = HISTORY_CHECKER.read_text(encoding="utf-8")
    for owned_elsewhere in [
        "exactly-one-current-accepted-resolver",
        "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION",
        "reviewed-delivery-v1",
        "canonicalSerialize",
        "LEGAL_ADR_TRANSITIONS",
    ]:
        assert owned_elsewhere not in source, owned_elsewhere


def structural_pipes(row: str) -> int:
    """Pipes that actually separate columns: those preceded by an EVEN run of
    backslashes. A naive "is there a backslash before it" test calls an injected
    pipe escaped, which is exactly the confusion being tested."""
    count = 0
    backslashes = 0
    for character in row:
        if character == "\\":
            backslashes += 1
            continue
        if character == "|" and backslashes % 2 == 0:
            count += 1
        backslashes = 0
    return count


def question_row(root: Path) -> str:
    rendered = (root / "governance/STATE.md").read_text(encoding="utf-8")
    return next(line for line in rendered.split("\n") if line.startswith("| U4 |"))


def rendered_with_title(root: Path, title: str) -> str:
    state = registry(root)
    state["questions"][0]["title"] = title
    write_state(root, state, REGISTRY_PATH)
    assert run_renderer(root, "write").returncode == 0
    return question_row(root)


def test_authored_text_cannot_forge_a_generated_projection(tmp_path: Path) -> None:
    """A projection must not be forgeable from the content it renders.

    A question title is free-form authored text. Escaping only the pipe left a
    backslash immediately before one able to close its own cell: the escape we
    added became an escaped backslash, and the pipe behind it a live column
    separator. CodeQL named it `js/incomplete-sanitization`; escaping
    backslashes FIRST is the fix, and the order is what makes it work.
    """
    root = projection_root(tmp_path, "forgery")

    # Five columns, so six structural separators, whatever the title contains.
    assert structural_pipes(rendered_with_title(root, "an ordinary title")) == 6

    # The injection: a backslash immediately before a pipe.
    row = rendered_with_title(root, "a\\|b")
    assert structural_pipes(row) == 6, row
    # And the value still reaches the reader intact.
    assert "a\\\\\\|b" in row, row

    # A bare pipe is escaped, not structural.
    assert structural_pipes(rendered_with_title(root, "a | b")) == 6

    # A trailing backslash cannot swallow the separator either.
    assert structural_pipes(rendered_with_title(root, "ends with a backslash \\")) == 6

    # A newline would otherwise end the row; it collapses into the cell.
    row = rendered_with_title(root, "first line\nsecond line")
    assert structural_pipes(row) == 6, row
    assert "first line second line" in row, row


# PR-2 resumption: the real post-PR-2A genesis recipe, exercised only in copies.
DURABLE_PR2A = "83e6cd8fa7d2d05ab246a39de039129b4056966d"
CANDIDATE_ROOT = REPOSITORY_ROOT / "tests/fixtures/governance/candidate"
POST_BRIDGE_SOURCE = "c82fda72927464d813ec769aee53f4079ebe3b20"
TEST_ENVELOPE = REPOSITORY_ROOT / "tests/fixtures/governance/genesis/envelope.mjs"
FRESHNESS = REPOSITORY_ROOT / "scripts/governance/genesis/freshness.mjs"


def isolated_genesis(tmp_path: Path, name: str = "isolated-genesis") -> Path:
    """Full historical objects, but independent refs, index, and working tree."""
    root = tmp_path / name
    subprocess.run(
        ["git", "clone", "--quiet", "--shared", "--no-checkout", str(REPOSITORY_ROOT), str(root)],
        check=True,
        capture_output=True,
        text=True,
    )
    git(root, "checkout", "--quiet", "--detach", git(REPOSITORY_ROOT, "rev-parse", "HEAD"))
    changed = subprocess.run(
        ["git", "diff", "--name-only", "-z", "HEAD"],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "-z"],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    for name in sorted(set((changed + untracked).split("\0")) - {""}):
        source, target = REPOSITORY_ROOT / name, root / name
        if source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif target.is_file():
            target.unlink()
    git(root, "add", "-A")
    git(root, "commit", "-q", "--allow-empty", "-m", "isolated TEST pre-activation source")
    return root


def install_test_genesis(root: Path, base: str | None = None) -> dict[str, Any]:
    """No owner act: the actor and authority explicitly name an isolated fixture."""
    result = subprocess.run(
        ["node", str(TEST_ENVELOPE), str(root), base or git(root, "rev-parse", "HEAD")],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    state = cast(dict[str, Any], json.loads(result.stdout))
    (root / "governance").mkdir(exist_ok=True)
    shutil.copyfile(
        root / "tests/fixtures/governance/candidate/source-manifest.json",
        root / "governance/genesis-source-manifest.json",
    )
    write_state(root, state, REGISTRY_PATH)
    return state


@pytest.fixture(scope="session")
def temporal_genesis_template(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Prepare T.5 copies before T.6 changes the three real candidate members."""
    root = isolated_genesis(tmp_path_factory.mktemp("temporal-proof"))
    result = subprocess.run(
        [
            "node",
            str(REPOSITORY_ROOT / "scripts/governance/genesis/extract.mjs"),
            "--root",
            str(root),
            "--source",
            POST_BRIDGE_SOURCE,
            "--inventory-source",
            "WORKTREE",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    prepared = json.loads(result.stdout)
    for name, key in [
        ("state.json", "state"),
        ("source-manifest.json", "manifest"),
        ("consumers.json", "inventory"),
    ]:
        write_state(root, prepared[key], "tests/fixtures/governance/candidate/" + name)
    git(root, "add", "-A")
    git(
        root,
        "commit",
        "--allow-empty",
        "-qm",
        "isolated temporal TEST candidate, not a real freeze",
    )
    state = install_test_genesis(root)
    commit_registry(root, state, "isolated temporal TEST genesis, never owner attestation")
    assert_valid(root, REGISTRY_PATH)
    return root


@pytest.fixture
def temporal_genesis(tmp_path: Path, temporal_genesis_template: Path) -> Path:
    root = tmp_path / "temporal-genesis"
    subprocess.run(
        ["git", "clone", "--quiet", "--shared", str(temporal_genesis_template), str(root)],
        check=True,
        capture_output=True,
        text=True,
    )
    git(root, "config", "user.name", "fixture")
    git(root, "config", "user.email", "fixture@example.invalid")
    git(root, "config", "commit.gpgsign", "false")
    return root


def test_temporal_real_source_and_archive_split(temporal_genesis: Path) -> None:
    root = temporal_genesis
    payload = assert_valid(root, REGISTRY_PATH)
    state = registry(root)
    manifest = load_state(root, "governance/genesis-source-manifest.json")
    assert manifest["sourceSnapshotIdentity"]["value"] == POST_BRIDGE_SOURCE
    assert len(manifest["decisionEvidence"]) == 23
    assert payload["derived"]["questions"]["U7"]["resolvedOn"] == "2026-08-15"
    assert "resolvedAt" not in payload["derived"]["questions"]["U7"]
    assert (
        next(a for a in state["adrs"] if a["id"] == "ADR-0022")["acceptance"]["decisionDate"]
        == "2026-09-01"
    )
    for landing in state["landings"]:
        if landing["id"] in ["runner/L4", "runner/L5", "runner/L7"]:
            archive = landing["delivery"]["completion"]["evidence"]["archivedOpenSpec"]
            assert archive["archivedPackageIdentity"]["value"] == DURABLE_PR2A


@pytest.fixture
def temporal_candidate(temporal_genesis: Path) -> Path:
    base = registry(temporal_genesis)["attestations"]["genesis"]["activationBaseCommit"]
    git(temporal_genesis, "checkout", "--quiet", "--detach", base)
    return temporal_genesis


@pytest.mark.parametrize(
    "value",
    [
        None,
        20260901,
        "2026-02-30",
        "0000-01-01",
        "2026-09-01T00:00:00Z",
        "2026-09-01T12:00:00Z",
        "2026-09-01+00:00",
    ],
)
def test_temporal_adv_g100_closed_calendar_date(tmp_path: Path, value: Any) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, [])
    state["adrs"][0]["acceptance"]["decisionDate"] = value
    write_state(root, state)
    assert_refused(root, "ADV-G02")


@pytest.mark.parametrize("field", ["at", "recordedAt", "gitCommitterAt", "gitAuthorAt"])
def test_temporal_adv_g100_no_legacy_alias(tmp_path: Path, field: str) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, [])
    state["adrs"][0]["acceptance"][field] = "2026-08-30T00:00:00Z"
    write_state(root, state)
    assert_refused(root, "ADV-G02")


@pytest.mark.parametrize(
    "case",
    [
        "date",
        "missing-row",
        "duplicate-row",
        "missing-transition",
        "missing-source",
        "duplicate-source",
        "wrong-source-revision",
        "source-hash",
        "selector",
        "delivery-transition",
        "predecessor",
        "decided-bytes",
        "message",
        "author",
        "committer",
        "author-as-committer",
        "external-transition",
        "no-disposition",
        "false-comparison",
        "wrong-comparison-date",
        "legacy-kind",
        "legacy-recorded",
        "legacy-differs",
        "legacy-date",
        "extra",
        "unknown-adr",
    ],
)
def test_temporal_rehashed_manifest_refuses(temporal_candidate: Path, case: str) -> None:
    root = temporal_candidate
    path = "tests/fixtures/governance/candidate/source-manifest.json"
    manifest = load_state(root, path)
    row = next(r for r in manifest["decisionEvidence"] if r["adrId"] == "ADR-0022")
    transition = row["transition"]
    if case == "date":
        row["decisionDate"] = "2026-09-02"
        candidate = load_state(root, "tests/fixtures/governance/candidate/state.json")
        next(a for a in candidate["adrs"] if a["id"] == "ADR-0022")["acceptance"][
            "decisionDate"
        ] = "2026-09-02"
        write_state(root, candidate, "tests/fixtures/governance/candidate/state.json")
    elif case == "missing-row":
        manifest["decisionEvidence"].remove(row)
    elif case == "duplicate-row":
        manifest["decisionEvidence"].append(row.copy())
    elif case == "missing-transition":
        del row["transition"]
    elif case == "missing-source":
        row["sources"].pop()
    elif case == "duplicate-source":
        row["sources"].append(row["sources"][0].copy())
    elif case == "wrong-source-revision":
        row["sources"][0]["revision"] = POST_BRIDGE_SOURCE
    elif case == "source-hash":
        row["sources"][0]["contentSha256"] = "a" * 64
    elif case == "selector":
        row["sources"][0]["selector"] = "first-main-v1"
    elif case == "delivery-transition":
        transition["identity"]["value"] = git(
            root,
            "rev-list",
            "--first-parent",
            "--reverse",
            POST_BRIDGE_SOURCE,
            "--",
            "docs/decisions/ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md",
        ).splitlines()[-1]
    elif case == "predecessor":
        transition["predecessorIdentity"]["value"] = POST_BRIDGE_SOURCE
    elif case == "decided-bytes":
        transition["contentDigest"] = "b" * 64
    elif case == "message":
        transition["messageSha256"] = "c" * 64
    elif case == "author":
        transition["gitAuthorAt"] = "2026-09-01T12:00:00Z"
    elif case == "committer":
        transition["gitCommitterAt"] = "2026-09-01T12:00:00Z"
    elif case == "author-as-committer":
        row = next(r for r in manifest["decisionEvidence"] if r["adrId"] == "ADR-0015")
        row["transition"]["gitCommitterAt"] = row["transition"]["gitAuthorAt"]
    elif case == "external-transition":
        transition["identity"]["class"] = "external-git-commit"
    elif case == "no-disposition":
        row["disposition"] = None
    elif case == "false-comparison":
        row["committerUtcDateDiffers"] = False
    elif case == "wrong-comparison-date":
        row["disposition"]["committerUtcDate"] = "2026-09-01"
    elif case == "legacy-kind":
        row["disposition"]["kind"] = "decision-date-recording-latency-v1"
    elif case == "legacy-recorded":
        row["recordedAt"] = transition["gitCommitterAt"]
    elif case == "legacy-differs":
        row["recordingDateDiffers"] = True
    elif case == "legacy-date":
        row["disposition"]["recordingDate"] = "2026-09-02"
    elif case == "extra":
        row["futureCommit"] = "d" * 40
    else:
        row["adrId"] = "ADR-0099"
    write_state(root, manifest, path)
    rebind_test_candidate(root)
    forged_test_genesis(root)
    assert_refused(root, "ADV-G104", path=REGISTRY_PATH)


@pytest.mark.parametrize("lifecycle", ["Accepted", "Rejected", "Superseded"])
def test_temporal_adv_g105_rehashed_date_history(tmp_path: Path, lifecycle: str) -> None:
    root = history_repository(tmp_path, "temporal-history")
    state = accepted_registry(root)
    adr = state["adrs"][0]
    document = root / adr["path"]
    if lifecycle == "Rejected":
        document.write_text(
            document.read_text()
            .replace("Accepted", "Rejected")
            .replace("- **Closes:** [U4](unresolved.md#u4)", "- **Closes:** no unresolved decision")
        )
        adr["lifecycle"], adr["resolves"], adr["acceptance"]["outcome"] = "Rejected", [], "rejected"
    elif lifecycle == "Superseded":
        successor = json.loads(json.dumps(adr))
        successor["id"], successor["path"], successor["supersedes"] = (
            "ADR-0002",
            "successor.md",
            [adr["id"]],
        )
        successor_bytes = (
            document.read_text().replace("ADR-0001", "ADR-0002")
            + "\n- **Supersedes:** [ADR-0001](adr.md)\n"
        )
        (root / successor["path"]).write_text(successor_bytes)
        successor["acceptance"]["contentDigest"] = hashlib.sha256(
            successor_bytes.encode()
        ).hexdigest()
        state["adrs"].append(successor)
        adr["lifecycle"] = "Superseded"
    adr["acceptance"]["contentDigest"] = hashlib.sha256(document.read_bytes()).hexdigest()
    base = commit_registry(root, state, "TEST terminal decision")
    assert_valid(root, REGISTRY_PATH)
    before = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {primitiveDigest} from './scripts/governance/model/index.mjs';"
            "import fs from 'node:fs';"
            "console.log(primitiveDigest(JSON.parse(fs.readFileSync(0,'utf8'))))",
        ],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        text=True,
        capture_output=True,
        check=True,
    ).stdout
    adr["acceptance"]["decisionDate"] = "2026-08-31"
    # First the excluded-metadata property, independently of admissibility.
    after = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {primitiveDigest} from './scripts/governance/model/index.mjs';"
            "import fs from 'node:fs';"
            "console.log(primitiveDigest(JSON.parse(fs.readFileSync(0,'utf8'))))",
        ],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        text=True,
        capture_output=True,
        check=True,
    ).stdout
    assert after == before
    # Then change even the mirror/content hash: history still owns immutability.
    document.write_text(document.read_text().replace("2026-08-30", "2026-08-31"))
    adr["acceptance"]["contentDigest"] = hashlib.sha256(document.read_bytes()).hexdigest()
    state = bind_acceptance_digest(root, state, 0, REGISTRY_PATH)
    commit_registry(root, state, "HOSTILE rewritten decision date with recomputed digests")
    assert_valid(root, REGISTRY_PATH)
    assert_history_refused(root, "ADV-G40", base=base)
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/history.mjs",
                "if (canonicalText(baseAdr.acceptance) !== canonicalText(targetAdr.acceptance)) {",
                "if (false) {",
            )
        ],
    )
    result, payload = run_subject(subject, root, base=base)
    assert result.returncode == 0, payload  # Independent MUT-G20 kill.


@pytest.mark.parametrize(
    "field", ["gitCommitterAt", "sources", "disposition", "coverage", "recordedAt"]
)
def test_temporal_mut_g21_independent_manifest_kills(
    temporal_candidate: Path, tmp_path: Path, field: str
) -> None:
    root = temporal_candidate
    path = "tests/fixtures/governance/candidate/source-manifest.json"
    manifest = load_state(root, path)
    row = next(r for r in manifest["decisionEvidence"] if r["adrId"] == "ADR-0022")
    if field == "gitCommitterAt":
        row["transition"][field] = "2026-09-01T00:00:00Z"
    elif field == "sources":
        row["sources"].pop()
    elif field == "disposition":
        row[field] = None
    elif field == "coverage":
        manifest["decisionEvidence"].pop()
    else:
        row[field] = "2026-09-02T08:03:21Z"
    write_state(root, manifest, path)
    rebind_test_candidate(root)
    forged_test_genesis(root)
    assert_refused(root, "ADV-G104", path=REGISTRY_PATH)
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/decision-evidence.mjs",
                "if (!same(manifest.decisionEvidence, expected))",
                "if (false)",
            )
        ],
    )
    result, payload = run_subject(subject, root)
    assert result.returncode == 0, payload


@pytest.mark.parametrize("mutation", ["primitive-date", "transition-date"])
def test_temporal_prop_g12_mut_g20_causal_exclusions(tmp_path: Path, mutation: str) -> None:
    root = copy_fixture(tmp_path)
    state = accepted_state(root, [])
    script = """
import {pathToFileURL} from 'node:url'
import fs from 'node:fs'
const m=await import(pathToFileURL(process.argv[1]).href)
const a=JSON.parse(fs.readFileSync(0,'utf8')), b=structuredClone(a)
b.adrs[0].acceptance.decisionDate='2026-08-31'
const values=s=>[m.primitiveDigest(s),m.acceptanceDigest(s,s.adrs[0])]
console.log(JSON.stringify({before:values(a),after:values(b),bytesDiffer:m.canonicalSerialize(a)!==m.canonicalSerialize(b)}))
"""

    def evaluate(subject: Path) -> dict[str, Any]:
        result = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                script,
                str(subject / "scripts/governance/model/index.mjs"),
            ],
            cwd=REPOSITORY_ROOT,
            input=json.dumps(state),
            text=True,
            capture_output=True,
            check=True,
        )
        return cast(dict[str, Any], json.loads(result.stdout))

    control = evaluate(REPOSITORY_ROOT)
    assert control["before"] == control["after"] and control["bytesDiffer"]
    anchor, replacement = (
        ("      delete adr.acceptance.decisionDate", "      void adr.acceptance.decisionDate")
        if mutation == "primitive-date"
        else (
            "    targetPrimitiveDigest: target,",
            "    targetPrimitiveDigest: sha256Text(target + adr.acceptance.decisionDate),",
        )
    )
    subject = mutant_subject(tmp_path, [("governance/model/digests.mjs", anchor, replacement)])
    mutant = evaluate(subject)
    assert mutant["before"] != mutant["after"]


def test_temporal_projection_and_query_dates(temporal_genesis: Path) -> None:
    root = temporal_genesis
    for path, regions in [
        ("docs/decisions/INDEX.md", ["decision-lifecycle"]),
        ("docs/architecture/unresolved-decisions.md", ["question-summary", "resolution-banners"]),
    ]:
        with (root / path).open("a", encoding="utf-8") as stream:
            for region in regions:
                stream.write("\n" + BEGIN.format(region) + "\n" + END.format(region) + "\n")
    result = run_renderer(root, "write")
    assert result.returncode == 0, result.stderr
    assert run_renderer(root, "check").returncode == 0
    rendered = (root / "governance/STATE.md").read_text()
    assert "| ADR-0022 | Accepted | 2026-09-01 |" in rendered
    resolutions = (root / "docs/architecture/unresolved-decisions.md").read_text()
    assert "**U7** — resolved on 2026-08-15" in resolutions
    query = run_query(root, json_form=True)
    assert query.returncode == 0, query.stderr
    data = json.loads(query.stdout)
    assert next(q for q in data["questions"] if q["id"] == "U7")["resolvedOn"] == "2026-08-15"
    assert next(q for q in data["questions"] if q["id"] == "U4")["resolvedOn"] is None
    assert "resolvedAt" not in query.stdout
    assert "U7  resolved by ADR-0015 on 2026-08-15" in run_query(root, json_form=False).stdout
    (root / "governance/STATE.md").write_text(rendered.replace("2026-09-01", "2026-09-02"))
    assert run_renderer(root, "check").returncode != 0


def test_temporal_frozen_planning_bytes_and_rule_values_both_bind(temporal_candidate: Path) -> None:
    root = temporal_candidate
    tasks = root / "openspec/changes/governance-state-substrate/tasks.md"
    tasks.write_text(tasks.read_text() + "\nTEST bookkeeping progress only.\n")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "TEST task progress without governance input changes")
    result, payload = run_freshness(root, git(root, "rev-parse", "HEAD"))
    assert result.returncode != 0 and "ADV-G73" in {p["code"] for p in payload["problems"]}, payload
    design = root / "openspec/changes/governance-state-substrate/design.md"
    text = design.read_text()
    old = "| `runner/L8` | implementation-landing | `runner/L7` | issue #56 | **Planned** |"
    assert text.count(old) == 1
    design.write_text(text.replace(old, old.replace("**Planned**", "**InProgress**")))
    git(root, "add", "-A")
    git(root, "commit", "-qm", "HOSTILE changed planning source primitive")
    result, payload = run_freshness(root, git(root, "rev-parse", "HEAD"))
    assert result.returncode != 0 and "ADV-G69" in {p["code"] for p in payload["problems"]}


@pytest.mark.parametrize("case", ["missing", "mixed-revision", "hash", "dropped-preparation"])
def test_temporal_preparation_planning_bindings_refuse_rehashed_drift(
    temporal_candidate: Path,
    case: str,
) -> None:
    root = temporal_candidate
    path = "tests/fixtures/governance/candidate/source-manifest.json"
    manifest = load_state(root, path)
    historic = {
        "7a2d731837ea9f14cae09436ddb78e6e47607ee5",
        "fc1b9f4eef748f7cd0f6af7818bec94d3045f46e",
        "5447e78fa9d63ce2c20ea8de81a1cd321bdf9b6a",
        POST_BRIDGE_SOURCE,
    }
    prepared = [row for row in manifest["planningSources"] if row["revision"] not in historic]
    assert len(prepared) == 5
    if case == "missing":
        manifest["planningSources"].remove(prepared[0])
    elif case == "mixed-revision":
        prepared[0]["revision"] = git(root, "rev-parse", "HEAD")
    elif case == "hash":
        prepared[0]["contentSha256"] = "a" * 64
    else:
        manifest["planningSources"] = [r for r in manifest["planningSources"] if r not in prepared]
    write_state(root, manifest, path)
    rebind_test_candidate(root)
    forged_test_genesis(root)
    assert_refused(
        root, "ADV-G73" if case == "dropped-preparation" else "ADV-G31", path=REGISTRY_PATH
    )


def test_temporal_extraction_replays_exact_preparation_without_rebinding(tmp_path: Path) -> None:
    root = isolated_genesis(tmp_path)
    preparation = git(root, "rev-parse", "HEAD")
    command = [
        "node",
        str(REPOSITORY_ROOT / "scripts/governance/genesis/extract.mjs"),
        "--root",
        str(root),
        "--source",
        POST_BRIDGE_SOURCE,
        "--inventory-source",
        "WORKTREE",
    ]
    original = subprocess.run(command, capture_output=True, text=True)
    assert original.returncode == 0, original.stderr
    git(root, "commit", "--allow-empty", "-qm", "TEST later proof commit")
    replay = subprocess.run(
        [*command, "--planning-source", preparation], capture_output=True, text=True
    )
    assert replay.returncode == 0, replay.stderr
    assert replay.stdout == original.stdout
    ambiguous = subprocess.run(
        [*command, "--planning-source", "HEAD"], capture_output=True, text=True
    )
    assert ambiguous.returncode != 0 and not ambiguous.stdout
    assert "full commit identity" in ambiguous.stderr
    tasks = root / "openspec/changes/governance-state-substrate/tasks.md"
    tasks.write_text(tasks.read_text() + "\nHOSTILE planning drift after checkpoint.\n")
    changed = subprocess.run(
        [*command, "--planning-source", preparation], capture_output=True, text=True
    )
    assert changed.returncode != 0 and not changed.stdout
    assert "checkpoint current planning bytes" in changed.stderr


def test_temporal_missing_transition_never_emits_partial_candidate(tmp_path: Path) -> None:
    root = tmp_path / "shallow-evidence"
    root.mkdir()
    git(root, "init", "-q")
    git(root, "remote", "add", "origin", str(REPOSITORY_ROOT))
    git(root, "fetch", "--depth=1", "origin", POST_BRIDGE_SOURCE)
    git(root, "checkout", "--quiet", "--detach", "FETCH_HEAD")
    result = subprocess.run(
        [
            "node",
            str(REPOSITORY_ROOT / "scripts/governance/genesis/extract.mjs"),
            "--root",
            str(root),
            "--source",
            POST_BRIDGE_SOURCE,
            "--patch",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0 and not result.stdout
    assert "historical acceptance audit blocks candidate generation" in result.stderr
    assert "ADR-0015" in result.stderr and "ADR-0022" in result.stderr
    assert not (root / "tests/fixtures/governance/candidate").exists()


def test_temporal_archive_stage_cannot_be_rebound_to_common_source(
    temporal_candidate: Path,
) -> None:
    root = temporal_candidate
    path = "tests/fixtures/governance/candidate/source-manifest.json"
    manifest = load_state(root, path)
    row = next(r for r in manifest["historicalCompletions"] if r["landingId"] == "runner/L4")
    archive = row["evidence"]["archivedOpenSpec"]
    archive["archivedPackageIdentity"]["value"] = POST_BRIDGE_SOURCE
    script = (
        "import fs from 'node:fs';import {bundleSha256} from "
        "'./scripts/governance/model/archived-openspec.mjs';"
        "console.log(bundleSha256(JSON.parse(fs.readFileSync(0,'utf8'))))"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(archive),
        text=True,
        capture_output=True,
        check=True,
    )
    archive["bundleSha256"] = result.stdout.strip()
    row["packageDisposition"]["archiveBundleSha256"] = archive["bundleSha256"]
    write_state(root, manifest, path)
    rebind_test_candidate(root)
    forged_test_genesis(root)
    assert_refused(root, "ADV-G98", path=REGISTRY_PATH)


@pytest.mark.parametrize("member", ["bridge-evidence.json", "bridge-verification.md"])
def test_temporal_consumed_bridge_is_immutable_historical_evidence(
    temporal_genesis: Path,
    member: str,
) -> None:
    root = temporal_genesis
    path = root / "openspec/changes/governance-state-substrate" / member
    path.write_bytes(path.read_bytes() + b"\n")
    assert_refused(root, "ADV-G31", path=REGISTRY_PATH)


@pytest.mark.parametrize("lifecycle", ["Accepted", "Rejected"])
def test_temporal_ordinary_non_self_reference_and_no_genesis_replay(
    tmp_path: Path, lifecycle: str
) -> None:
    root = history_repository(tmp_path, "ordinary-temporal")
    before = registry(root)
    base = git(root, "rev-parse", "HEAD")
    state = accepted_registry(root)
    adr = state["adrs"][0]
    if lifecycle == "Rejected":
        adr["lifecycle"], adr["resolves"], adr["acceptance"]["outcome"] = "Rejected", [], "rejected"
        document = root / adr["path"]
        document.write_text(
            document.read_text()
            .replace("Accepted", "Rejected")
            .replace("- **Closes:** [U4](unresolved.md#u4)", "- **Closes:** no unresolved decision")
        )
        adr["acceptance"]["contentDigest"] = hashlib.sha256(document.read_bytes()).hexdigest()
    script = """
import fs from 'node:fs'
import {transitionDigest,primitiveDigest,relationshipDigest}
  from './scripts/governance/model/index.mjs'
const {before,state}=JSON.parse(fs.readFileSync(0,'utf8')), adr=state.adrs[0]
adr.acceptance.transitionDigest=transitionDigest({schemaVersion:1,priorStateDigest:primitiveDigest(before),targetPrimitiveDigest:primitiveDigest(state),subject:adr.id,from:'Proposed',to:adr.lifecycle,contentDigest:adr.acceptance.contentDigest,relationshipDigest:relationshipDigest(state)})
console.log(JSON.stringify(state))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps({"before": before, "state": state}),
        text=True,
        capture_output=True,
        check=True,
    )
    state = json.loads(result.stdout)
    target = commit_registry(root, state, "TEST atomic date-only decision")
    assert target not in (root / REGISTRY_PATH).read_text()
    payload = assert_history_clean(root, base=base)
    observation = payload["decisionObservations"][0]
    assert observation["evaluatedRevision"] == target
    assert observation["decisionDate"] == "2026-08-30"
    # A genesis-null preimage cannot admit an ordinary transition.
    state = bind_acceptance_digest(root, state, 0, REGISTRY_PATH)
    commit_registry(root, state, "HOSTILE null predecessor digest")
    assert_history_refused(root, "ADV-G19", base=base)


def test_adv_g90_real_candidate_is_unattested_and_not_canonical_authority() -> None:
    state = load_state(REPOSITORY_ROOT, "tests/fixtures/governance/candidate/state.json")
    assert state["attestations"] == {"genesis": {}}
    assert not (REPOSITORY_ROOT / REGISTRY_PATH).exists()
    result, payload = run_checker(REPOSITORY_ROOT, "tests/fixtures/governance/candidate/state.json")
    assert result.returncode == 1, result.stderr
    assert {problem["code"] for problem in payload["problems"]} == {"ADV-G90", "ADV-G51"}


def test_ex_g16_g17_g19_g23_g24_g30_real_seed_with_test_envelopes(tmp_path: Path) -> None:
    root = isolated_genesis(tmp_path)
    frozen_before = {path.name: path.read_bytes() for path in CANDIDATE_ROOT.glob("*.json")}
    state = install_test_genesis(root)
    result, payload = run_checker(root, REGISTRY_PATH)
    assert result.returncode == 0, (payload, result.stderr)
    assert payload["ok"] is True
    accepted = {adr["id"] for adr in state["adrs"] if adr["lifecycle"] == "Accepted"}
    assert accepted == {f"ADR-{number:04}" for number in [*range(1, 20), 21, 22, 23, 24]}
    assert payload["derived"]["questions"]["U4"]["resolved"] is False
    assert payload["derived"]["gates"]["runner/GATE-U4"]["satisfied"] is False
    assert payload["derived"]["readiness"]["runner/L9"]["state"] == "NotReady"
    assert len(state["landings"]) + len(state["gates"]) == 11
    members = state["attestations"]["genesisCompletion"]["members"]
    assert {member["landingId"] for member in members} == {
        f"runner/L{number}" for number in range(2, 8)
    }
    assert state["attestations"]["genesis"]["actor"] == "fixture:genesis-mechanism"
    assert frozen_before == {path.name: path.read_bytes() for path in CANDIDATE_ROOT.glob("*.json")}
    for landing in state["landings"]:
        completion = landing["delivery"]["completion"]
        if completion is not None:
            assert set(completion) == {"type", "digest", "evidence"}
            assert completion["type"] == "genesis-historical-completion-v1"


def test_ex_g31_genesis_terminal_records_survive_pairwise_continuation(tmp_path: Path) -> None:
    root = isolated_genesis(tmp_path)
    activation_base = git(root, "rev-parse", "HEAD")
    state = install_test_genesis(root)
    base = commit_registry(root, state, "TEST activation only")
    assert_history_clean(root, base=activation_base)
    state["questions"][0]["severity"] = "medium"
    commit_registry(root, state, "ordinary severity update after TEST genesis")
    assert_history_clean(root, base=base)


@pytest.fixture(scope="session")
def attested_genesis_template(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = isolated_genesis(tmp_path_factory.mktemp("genesis-template"))
    state = install_test_genesis(root)
    commit_registry(root, state, "isolated TEST genesis template")
    assert_valid(root, REGISTRY_PATH)
    return root


@pytest.fixture
def attested_genesis(tmp_path: Path, attested_genesis_template: Path) -> Path:
    root = tmp_path / "attested"
    subprocess.run(
        ["git", "clone", "--quiet", "--shared", str(attested_genesis_template), str(root)],
        check=True,
        capture_output=True,
        text=True,
    )
    return root


@pytest.mark.parametrize(
    ("case", "code"),
    [
        ("ordinary-digest", "ADV-G88"),
        ("prior-lifecycle", "ADV-G02"),
        ("per-landing-attestation", "ADV-G02"),
        ("type-alias", "ADV-G88"),
        ("extra-row", "ADV-G87"),
        ("missing-row", "ADV-G87"),
        ("source-mismatch", "ADV-G87"),
        ("evidence-mismatch", "ADV-G87"),
        ("extra-waiver", "ADV-G86"),
        ("missing-waiver", "ADV-G86"),
        ("wildcard-waiver", "ADV-G86"),
        ("duplicate-waiver", "ADV-G86"),
        ("misbound-landing", "ADV-G86"),
        ("wrong-profile", "ADV-G86"),
        ("wrong-witness", "ADV-G86"),
        ("spike-disposition", "ADV-G86"),
        ("missing-member", "ADV-G51"),
        ("extra-member", "ADV-G51"),
        ("duplicate-member", "ADV-G65"),
        ("reassociated-digest", "ADV-G65"),
        ("manifest-as-attestation", "ADV-G02"),
        ("unattested", "ADV-G90"),
        ("general-source", "ADV-G87"),
        ("seed-digest", "ADV-G62"),
        ("relationship-count", "ADV-G20"),
        ("freeze-label", "ADV-G76"),
        ("freeze-missing-member", "ADV-G76"),
        ("freshness-skipped", "ADV-G74"),
        ("closed-row-alias", "ADV-G02"),
    ],
)
def test_adv_g51_g52_g57_g62_g65_g76_g86_g87_g88_genesis_hostile_bindings(
    attested_genesis: Path,
    case: str,
    code: str,
) -> None:
    root = attested_genesis
    state = registry(root)
    manifest = load_state(root, "governance/genesis-source-manifest.json")
    landing = next(node for node in state["landings"] if node["id"] == "runner/L4")
    completion = landing["delivery"]["completion"]
    row = next(
        item for item in manifest["historicalCompletions"] if item["landingId"] == "runner/L4"
    )
    if case in {"missing-waiver", "duplicate-waiver"}:
        row = next(
            item for item in manifest["historicalCompletions"] if item["landingId"] == "runner/L5"
        )
    disposition = row["packageDisposition"]
    genesis = state["attestations"]["genesis"]
    members = state["attestations"]["genesisCompletion"]["members"]
    if case == "ordinary-digest":
        completion["digest"] = "a" * 64
    elif case == "prior-lifecycle":
        completion["from"] = "Planned"
    elif case == "per-landing-attestation":
        completion["attestation"] = {}
    elif case == "type-alias":
        completion["type"] = "historical-completion"
    elif case == "extra-row":
        extra = json.loads(json.dumps(row))
        extra["landingId"] = "runner/L8"
        manifest["historicalCompletions"].append(extra)
    elif case == "missing-row":
        manifest["historicalCompletions"].remove(row)
    elif case == "source-mismatch":
        row["sourceSnapshotIdentity"]["value"] = git(root, "rev-parse", DURABLE_PR2A + "^")
    elif case == "evidence-mismatch":
        row["evidence"]["archivedOpenSpec"]["bundleSha256"] = "a" * 64
    elif case == "extra-waiver":
        disposition["waivedMinimumArtifacts"].append("proposal.md")
    elif case == "missing-waiver":
        assert disposition["waivedMinimumArtifacts"]
        disposition["waivedMinimumArtifacts"] = []
    elif case == "wildcard-waiver":
        disposition["waivedMinimumArtifacts"] = ["*"]
    elif case == "duplicate-waiver":
        disposition["waivedMinimumArtifacts"] *= 2
    elif case == "misbound-landing":
        disposition["landingId"] = "runner/L5"
    elif case == "wrong-profile":
        disposition["packageProfile"] = "ordinary"
    elif case == "wrong-witness":
        disposition["reviewWitness"] = "required-content-backed-v2"
    elif case == "spike-disposition":
        spike = next(
            item for item in manifest["historicalCompletions"] if item["landingId"] == "runner/L6"
        )
        spike["packageDisposition"] = disposition
    elif case == "missing-member":
        members.pop()
    elif case == "extra-member":
        members.append({"landingId": "runner/L8", "digest": "8" * 64})
    elif case == "duplicate-member":
        members.append(members[0].copy())
    elif case == "reassociated-digest":
        members[1]["digest"] = members[0]["digest"]
    elif case == "manifest-as-attestation":
        state["attestations"]["genesisCompletion"] = manifest
    elif case == "unattested":
        state["attestations"] = {"genesis": {}}
    elif case == "general-source":
        genesis["sourceSnapshotIdentity"]["value"] = git(root, "rev-parse", DURABLE_PR2A + "^")
    elif case == "seed-digest":
        genesis["seedDigest"] = "a" * 64
    elif case == "relationship-count":
        genesis["relationshipEquivalenceDigest"] = hashlib.sha256(b"2 resolved").hexdigest()
    elif case == "freeze-label":
        genesis["candidateFreezeIdentity"] = {"label": "reviewed-candidate"}
    elif case == "freeze-missing-member":
        genesis["candidateFreezeIdentity"]["members"].pop()
    elif case == "freshness-skipped":
        genesis["activationFreshness"]["digest"] = "a" * 64
    elif case == "closed-row-alias":
        row["rationale"] = "a forbidden row-level alias"
    else:
        raise AssertionError(case)
    write_state(root, manifest, "governance/genesis-source-manifest.json")
    write_state(root, state, REGISTRY_PATH)
    assert_refused(root, code, path=REGISTRY_PATH)


@pytest.mark.parametrize("case", ["missing", "duplicate-key", "noncanonical", "symlink"])
def test_adv_g87_source_manifest_must_be_available_strict_and_canonical(
    attested_genesis: Path,
    tmp_path: Path,
    case: str,
) -> None:
    source = attested_genesis / "governance/genesis-source-manifest.json"
    if case == "missing":
        source.unlink()
    elif case == "duplicate-key":
        source.write_text(
            source.read_text().replace(
                '"schemaVersion": 1,', '"schemaVersion": 1, "schemaVersion": 1,', 1
            )
        )
    elif case == "noncanonical":
        source.write_text(json.dumps(json.loads(source.read_text())))
    else:
        outside = tmp_path / "outside-manifest.json"
        outside.write_bytes(source.read_bytes())
        source.unlink()
        source.symlink_to(outside)
    assert_refused(attested_genesis, "ADV-G87", path=REGISTRY_PATH)


@pytest.mark.parametrize("case", ["changed", "deleted", "extra", "executable", "symlink"])
def test_adv_g86_historical_waivers_do_not_waive_existing_archive_members(
    attested_genesis: Path,
    tmp_path: Path,
    case: str,
) -> None:
    archive = attested_genesis / "openspec/changes/archive/2026-09-13-runner-control-orchestration"
    member = archive / "proposal.md"
    if case == "changed":
        member.write_bytes(member.read_bytes() + b"\nchanged historical bytes\n")
    elif case == "deleted":
        member.unlink()
    elif case == "extra":
        (archive / ".extra-evidence").write_text("unreviewed member\n")
    elif case == "executable":
        member.chmod(0o755)
    else:
        outside = tmp_path / "outside-proposal.md"
        outside.write_bytes(member.read_bytes())
        member.unlink()
        member.symlink_to(outside)
    result, payload = run_checker(attested_genesis, REGISTRY_PATH)
    assert result.returncode == 1, (payload, result.stderr)
    assert any(
        problem["code"] in {"ADV-G80", "ADV-G84", "ADV-G85"} for problem in payload["problems"]
    ), payload


@pytest.fixture
def fresh_genesis(tmp_path: Path, attested_genesis_template: Path) -> Path:
    root = tmp_path / "freshness"
    base = registry(attested_genesis_template)["attestations"]["genesis"]["activationBaseCommit"]
    subprocess.run(
        [
            "git",
            "clone",
            "--quiet",
            "--shared",
            "--no-checkout",
            str(attested_genesis_template),
            str(root),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    git(root, "checkout", "--quiet", "--detach", base)
    return root


def run_freshness(root: Path, base: str) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    result = subprocess.run(
        ["node", str(FRESHNESS), "--root", str(root), "--base", base],
        check=False,
        capture_output=True,
        text=True,
    )
    return result, cast(dict[str, Any], json.loads(result.stdout))


def test_ex_g28_equivalent_different_commit_is_not_commit_only_freshness(
    fresh_genesis: Path,
) -> None:
    root = fresh_genesis
    before_run, before = run_freshness(root, git(root, "rev-parse", "HEAD"))
    assert before_run.returncode == 0, (before, before_run.stderr)
    (root / "unrelated-note.txt").write_text("No source or governance fact changes.\n")
    git(root, "add", "unrelated-note.txt")
    git(root, "commit", "-qm", "unrelated equivalent test base")
    after_run, after = run_freshness(root, git(root, "rev-parse", "HEAD"))
    assert after_run.returncode == 0, (after, after_run.stderr)
    assert before["result"]["candidateFreezeIdentity"] == after["result"]["candidateFreezeIdentity"]
    assert (
        before["result"]["comparisonTupleIdentities"]
        == after["result"]["comparisonTupleIdentities"]
    )
    assert (
        before["result"]["activationFreshnessDigest"]
        != after["result"]["activationFreshnessDigest"]
    )
    assert after["result"]["outcome"] == "equivalent"


@pytest.mark.parametrize(
    ("case", "code"),
    [
        ("lifecycle", "ADV-G69"),
        ("relationship", "ADV-G69"),
        ("new-adr", "ADV-G70"),
        ("yaml-consumer", "ADV-G71"),
        ("binary-consumer", "ADV-G71"),
        ("archive-evidence", "ADV-G72"),
        ("source-artifact", "ADV-G73"),
    ],
)
def test_adv_g69_to_g74_unchanged_candidate_cannot_hide_base_drift(
    fresh_genesis: Path,
    case: str,
    code: str,
) -> None:
    root = fresh_genesis
    candidate = root / "tests/fixtures/governance/candidate"
    before = {path.name: path.read_bytes() for path in candidate.glob("*.json")}
    adr = root / "docs/decisions/ADR-0020-place-runner-control-by-workload-class.md"
    if case == "lifecycle":
        adr.write_text(adr.read_text().replace("**Status:** Proposed", "**Status:** Accepted", 1))
    elif case == "relationship":
        text = adr.read_text()
        old = "**Decides:** [U4](../architecture/unresolved-decisions.md#u4)"
        assert old in text
        adr.write_text(text.replace("U4", "U3").replace("#u4", "#u3"))
    elif case == "new-adr":
        (root / "docs/decisions/ADR-0025-fixture-only.md").write_text(
            "# ADR-0025: Fixture only\n\n- **Status:** Proposed\n- **Date:** 2026-09-20\n"
            "- **Closes:** no unresolved decision\n\n---\n\nNo real decision.\n"
        )
    elif case in {"yaml-consumer", "binary-consumer"}:
        claim = b"current_decisions: ADR-0001 through ADR-0022 are Accepted\n"
        (root / "unregistered-consumer.yaml").write_bytes(
            claim + (b"\xff" if case == "binary-consumer" else b"")
        )
    elif case == "archive-evidence":
        member = root / "openspec/changes/archive/2026-09-13-runner-image-lineage/proposal.md"
        member.write_bytes(member.read_bytes() + b"\nchanged historical evidence\n")
    else:
        source = root / "openspec/changes/governance-state-substrate/proposal.md"
        source.write_bytes(source.read_bytes() + b"\nsource bytes changed, same derived counts\n")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "hostile activation base: " + case)
    result, payload = run_freshness(root, git(root, "rev-parse", "HEAD"))
    assert result.returncode == 1, (payload, result.stderr)
    assert code in {problem["code"] for problem in payload["problems"]}, payload
    assert "result" not in payload, payload
    assert before == {path.name: path.read_bytes() for path in candidate.glob("*.json")}


@pytest.mark.parametrize(
    "revision",
    [
        "dcd32f073c4ca6f8da6efd7e38e0f1b327f70e8e",
        "7309acb17e8e8d4a855d25c4d24317f621692b82",
        "HEAD",
    ],
)
def test_adv_g98_g110_extraction_never_substitutes_a_branch_or_preparation_head(
    revision: str,
) -> None:
    result = subprocess.run(
        [
            "node",
            str(REPOSITORY_ROOT / "scripts/governance/genesis/extract.mjs"),
            "--root",
            str(REPOSITORY_ROOT),
            "--source",
            revision,
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "ADV-G110" in result.stderr  # D12 now requires the post-bridge source, not just M.
    assert result.stdout == ""


@pytest.mark.parametrize(
    "case",
    ["row", "classification", "program", "waiver", "source", "digest", "inventory", "reason"],
)
def test_adv_g42_g43_g44_g46_g47_g76_g98_frozen_input_mutations_are_refused(
    fresh_genesis: Path,
    case: str,
) -> None:
    root = fresh_genesis
    prefix = "tests/fixtures/governance/candidate/"
    manifest = load_state(root, prefix + "source-manifest.json")
    seed = load_state(root, prefix + "state.json")
    inventory = load_state(root, prefix + "consumers.json")
    if case == "row":
        manifest["rows"].pop()
    elif case == "classification":
        row = next(
            row for row in manifest["rows"] if row["classification"] == "externally-attested"
        )
        row["classification"] = "locally-verified"
    elif case == "program":
        seed["landings"] = [node for node in seed["landings"] if node["id"] != "runner/L10"]
    elif case == "waiver":
        row = next(
            row for row in manifest["historicalCompletions"] if row["landingId"] == "runner/L5"
        )
        row["packageDisposition"]["waivedMinimumArtifacts"].append("tasks.md")
    elif case == "source":
        manifest["sourceSnapshotIdentity"]["value"] = "24b34a0c0fe42a47d3e1710b87e3ef22e07f387b"
    elif case == "digest":
        node = next(node for node in seed["landings"] if node["id"] == "runner/L5")
        node["delivery"]["completion"]["digest"] = "a" * 64
    elif case == "inventory":
        inventory["rows"] = [
            row for row in inventory["rows"] if row["path"] != "openspec/config.yaml"
        ]
    else:
        row = next(
            row for row in inventory["rows"] if row["disposition"] == "retained-semantic-prose"
        )
        row["retainedReason"] = ""
    for name, value in [
        ("state.json", seed),
        ("source-manifest.json", manifest),
        ("consumers.json", inventory),
    ]:
        write_state(root, value, prefix + name)
    result, payload = run_freshness(root, git(root, "rev-parse", "HEAD"))
    assert result.returncode == 1, (payload, result.stderr)
    expected = {
        "row": "ADV-G42",
        "classification": "ADV-G43",
        "program": "ADV-G44",
        "waiver": "ADV-G86",
        "source": "ADV-G87",
        "digest": "ADV-G88",
        "inventory": "ADV-G46",
        "reason": "ADV-G47",
    }[case]
    assert expected in {problem["code"] for problem in payload["problems"]}, payload


@pytest.mark.parametrize(
    ("policy", "expected_digest"),
    [
        ("delivery", "a4d58baa78f63d9c1657d5a781a49da9b2493b6009209802e46e4ad6cf55e8d6"),
        ("spike", "1ed508f48d1487ee69fa0aaf4b1ec3f8de7edb323181901dab157890d15a27a9"),
    ],
)
def test_adv_g53_g57_g63_g87_literal_historical_vectors_and_every_input_field(
    policy: str,
    expected_digest: str,
) -> None:
    """Hand-ordered literal preimages, independently SHA-256 checked.

    These files were not obtained from the subject's preimage/serializer/digest
    functions. A wrong subject cannot regenerate the expected vector for itself.
    """
    raw = (TEST_ENVELOPE.parent / (policy + "-preimage.json")).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected_digest
    script = """
import {canonicalSerialize, genesisHistoricalCompletionPreimage,
  genesisHistoricalCompletionDigest, genesisCompletionEnvelopeDigest}
  from './scripts/governance/model/index.mjs'
let text = ''; for await (const chunk of process.stdin) text += chunk
const expected = JSON.parse(text)
const input = {landing: {id: expected.landingId, authorityAnchor: expected.authorityAnchor,
  delivery: {completionPolicy: expected.completionPolicy,
    completion: {evidence: expected.policyEvidenceIdentities[0]}}},
  row: {sourceSnapshotIdentity: expected.sourceSnapshotIdentity,
    packageDisposition: expected.historicalPackageDisposition}}
const digest = genesisHistoricalCompletionDigest(input.landing, input.row)
const paths = []
function visit(value, path) {
  if (value !== null && typeof value === 'object') {
    for (const [key, member] of Object.entries(value)) visit(member, [...path, key])
  } else paths.push(path)
}
visit(input, [])
for (const path of paths) {
  const changed = structuredClone(input)
  let holder = changed; for (const key of path.slice(0, -1)) holder = holder[key]
  const key = path.at(-1), old = holder[key]
  holder[key] = old === null ? {} : typeof old === 'number' ? old + 1 : String(old) + '-changed'
  if (genesisHistoricalCompletionDigest(changed.landing, changed.row) === digest)
    throw new Error('unbound preimage input: ' + path.join('.'))
}
const original = canonicalSerialize(genesisHistoricalCompletionPreimage(input.landing, input.row))
input.landing.delivery.completion.from = 'Planned'
input.landing.delivery.completion.to = 'Complete'
if (genesisHistoricalCompletionDigest(input.landing, input.row) !== digest)
  throw new Error('an ordinary transition leaked into the historical preimage')
const member = {landingId: expected.landingId, digest}
const before = genesisCompletionEnvelopeDigest([member])
member.digest = '0'.repeat(64)
if (before === genesisCompletionEnvelopeDigest([member])) throw new Error('unbound envelope member')
console.log(JSON.stringify({preimage: original, digest, fields: paths.length}))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=raw.decode(),
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    assert payload["preimage"].encode() == raw
    assert payload["digest"] == expected_digest
    assert payload["fields"] >= 20


def test_prop_g09_genesis_source_waiver_and_member_permutations_are_canonical(
    attested_genesis: Path,
) -> None:
    root = attested_genesis
    state = registry(root)
    manifest = load_state(root, "governance/genesis-source-manifest.json")
    before_state = (root / REGISTRY_PATH).read_bytes()
    before_manifest = (root / "governance/genesis-source-manifest.json").read_bytes()
    state["attestations"]["genesisCompletion"]["members"].reverse()
    state["landings"].reverse()
    state["adrs"].reverse()
    manifest["rows"].reverse()
    manifest["planningSources"].reverse()
    manifest["historicalCompletions"].reverse()
    manifest["decisionEvidence"].reverse()
    for row in manifest["decisionEvidence"]:
        row["sources"].reverse()
    for row in manifest["historicalCompletions"]:
        if row["packageDisposition"] is not None:
            row["packageDisposition"]["waivedMinimumArtifacts"].reverse()
    write_state(root, state, REGISTRY_PATH)
    write_state(root, manifest, "governance/genesis-source-manifest.json")
    assert (root / REGISTRY_PATH).read_bytes() == before_state
    assert (root / "governance/genesis-source-manifest.json").read_bytes() == before_manifest
    assert_valid(root, REGISTRY_PATH)


def ordinary_l8_completion(root: Path, state: dict[str, Any]) -> dict[str, Any]:
    """A NEW ordinary delivery in an isolated repository, not a historical waiver."""
    built = build_archived_repository(root)
    landing = next(node for node in state["landings"] if node["id"] == "runner/L8")
    landing["delivery"]["lifecycle"] = "Complete"
    landing["delivery"]["completion"] = {
        "from": "Planned",
        "to": "Complete",
        "digest": "0" * 64,
        "evidence": {
            "policy": "reviewed-delivery-v1",
            "deliveredIdentity": {
                "class": "local-git-commit",
                "value": built["archivedCommit"],
                "scope": [ARCHIVE_ROOT],
            },
            "archivedOpenSpec": archived_openspec(built, reviewed_form="commit"),
        },
        "attestation": {
            "digest": "0" * 64,
            "actor": "fixture:ordinary-completion",
            "at": "2026-09-16T01:00:00Z",
            "outcome": "completed",
            "authority": landing["authorityAnchor"],
        },
    }
    digest = completion_digest_of(landing)
    landing["delivery"]["completion"]["digest"] = digest
    landing["delivery"]["completion"]["attestation"]["digest"] = digest
    return state


def test_ex_g31_later_ordinary_completion_keeps_exact_genesis_set(attested_genesis: Path) -> None:
    root = attested_genesis
    base = git(root, "rev-parse", "HEAD")
    state = registry(root)
    before_envelopes = json.dumps(state["attestations"], sort_keys=True)
    before_source = (root / "governance/genesis-source-manifest.json").read_bytes()
    ordinary_l8_completion(root, state)
    commit_registry(root, state, "isolated ordinary L8 completion after TEST genesis")
    assert_valid(root, REGISTRY_PATH)
    assert_history_clean(root, base=base)
    assert json.dumps(registry(root)["attestations"], sort_keys=True) == before_envelopes
    assert (root / "governance/genesis-source-manifest.json").read_bytes() == before_source
    assert len(state["attestations"]["genesisCompletion"]["members"]) == 6


def test_adv_g83_ordinary_completion_cannot_borrow_retained_historical_profile(
    attested_genesis: Path,
) -> None:
    root = attested_genesis
    state = registry(root)
    ordinary_l8_completion(root, state)
    l8 = next(node for node in state["landings"] if node["id"] == "runner/L8")
    l5 = next(node for node in state["landings"] if node["id"] == "runner/L5")
    completion = l8["delivery"]["completion"]
    completion["evidence"] = json.loads(json.dumps(l5["delivery"]["completion"]["evidence"]))
    digest = completion_digest_of(l8)
    completion["digest"] = digest
    completion["attestation"]["digest"] = digest
    write_state(root, state, REGISTRY_PATH)
    payload = assert_refused(root, path=REGISTRY_PATH)
    assert any(".openspec.yaml" in problem["message"] for problem in payload["problems"]), payload
    assert "derived" not in payload


@pytest.mark.parametrize(
    "case",
    [
        "member-set",
        "general-envelope",
        "completion-envelope",
        "historical-source",
        "terminal-variant",
    ],
)
def test_adv_g89_historical_genesis_records_are_pairwise_immutable(
    attested_genesis: Path, case: str
) -> None:
    root = attested_genesis
    base = git(root, "rev-parse", "HEAD")
    state = registry(root)
    if case == "member-set":
        state["attestations"]["genesisCompletion"]["members"].pop()
    elif case == "general-envelope":
        state["attestations"]["genesis"]["actor"] = "fixture:changed-general"
    elif case == "completion-envelope":
        state["attestations"]["genesisCompletion"]["actor"] = "fixture:changed-completion"
    elif case == "historical-source":
        manifest = load_state(root, "governance/genesis-source-manifest.json")
        manifest["historicalCompletions"][0]["packageDisposition"]["rationale"] += " edited"
        write_state(root, manifest, "governance/genesis-source-manifest.json")
    else:
        node = next(node for node in state["landings"] if node["id"] == "runner/L5")
        node["delivery"]["completion"]["from"] = "Planned"
        del node["delivery"]["completion"]["type"]
    commit_registry(root, state, "hostile TEST terminal edit: " + case)
    payload = assert_history_refused(root, base=base)
    assert any(problem["code"] in {"ADV-G89", "ADV-G29"} for problem in payload["problems"]), (
        payload
    )


def rebind_test_candidate(
    root: Path, source: str | None = None, *, subject: Path = REPOSITORY_ROOT
) -> None:
    """Recompute all dependent values, only inside a disposable fixture."""
    assert root.resolve() != REPOSITORY_ROOT.resolve()
    helper = subject / "tests/fixtures/governance/genesis/rebind.mjs"
    command = ["node", str(helper), str(root), "candidate"]
    if source is not None:
        command.append(source)
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    for path, text in json.loads(result.stdout).items():
        (root / path).write_text(text, encoding="utf-8")


def forged_test_genesis(root: Path, *, subject: Path = REPOSITORY_ROOT) -> dict[str, Any]:
    """A deliberately unvalidated, fully rehashed claim: the checker must refuse it."""
    assert root.resolve() != REPOSITORY_ROOT.resolve()
    git(root, "add", "-A")
    git(
        root, "commit", "-q", "--allow-empty", "-m", "HOSTILE test candidate, not owner attestation"
    )
    base = git(root, "rev-parse", "HEAD")
    result = subprocess.run(
        [
            "node",
            str(subject / "tests/fixtures/governance/genesis/rebind.mjs"),
            str(root),
            "forged-envelope",
            base,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    state = cast(dict[str, Any], json.loads(result.stdout))
    (root / "governance").mkdir(exist_ok=True)
    write_state(root, state, REGISTRY_PATH)
    write_state(
        root,
        load_state(root, "tests/fixtures/governance/candidate/source-manifest.json"),
        "governance/genesis-source-manifest.json",
    )
    return state


def content_backed_historical_candidate(root: Path, **kwargs: Any) -> str:
    """Synthetic history for EX-G30, never rewriting the actual M-bound archives.

    MAN-G03 association is a TEST assertion. Machines cannot establish the
    conceptual association from a valid package or its filename.
    """
    built = build_archived_repository(root, **kwargs)
    source = built["archivedCommit"]
    manifest = load_state(root, "tests/fixtures/governance/candidate/source-manifest.json")
    row = next(
        item for item in manifest["historicalCompletions"] if item["landingId"] == "runner/L4"
    )
    row["evidence"] = {
        "policy": "reviewed-delivery-v1",
        "deliveredIdentity": {
            "class": "local-git-commit",
            "value": source,
            "scope": [ARCHIVE_ROOT],
        },
        "archivedOpenSpec": archived_openspec(built, reviewed_form="content"),
    }
    row["packageDisposition"]["waivedMinimumArtifacts"] = []
    row["packageDisposition"]["reviewWitness"] = "required-content-backed-v2"
    row["packageDisposition"]["rationale"] = (
        "TEST-only association with a synthetic content-backed package; not MAN-G03 owner judgment."
    )
    write_state(root, manifest, "tests/fixtures/governance/candidate/source-manifest.json")
    rebind_test_candidate(root, source)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "synthetic reviewed historical fixture candidate")
    return git(root, "rev-parse", "HEAD")


def test_ex_g30_content_backed_historical_delivery_retains_complete_accepting_witness(
    fresh_genesis: Path,
) -> None:
    root = fresh_genesis
    base = content_backed_historical_candidate(root)
    state = install_test_genesis(root)
    commit_registry(root, state, "TEST-only content-backed historical genesis")
    assert_valid(root, REGISTRY_PATH)
    assert_history_clean(root, base=base)
    completion = next(node for node in state["landings"] if node["id"] == "runner/L4")["delivery"][
        "completion"
    ]
    assert (
        completion["evidence"]["archivedOpenSpec"]["reviewedIdentity"]["class"] == "content-sha256"
    )


@pytest.mark.parametrize("case", ["partial", "nonaccepting", "wrong-reviewed-bytes"])
def test_adv_g86_content_historical_witness_is_not_waived(fresh_genesis: Path, case: str) -> None:
    root = fresh_genesis
    kwargs: dict[str, Any] = {}
    if case == "partial":
        kwargs["manifest_paths"] = [".openspec.yaml"]
    elif case == "nonaccepting":
        kwargs["review_overrides"] = {"verdict": "CHANGES_REQUIRED"}
    else:
        kwargs["corrupt_review_digest"] = True
    content_backed_historical_candidate(root, **kwargs)
    forged_test_genesis(root)
    payload = assert_refused(root, path=REGISTRY_PATH)
    assert any(problem["code"] == "ADV-G81" for problem in payload["problems"]), payload
    assert "derived" not in payload


def mutant_subject(tmp_path: Path, changes: list[tuple[str, str, str]]) -> Path:
    """Copy the real entry points and dependencies; never mutate shipped code."""
    subject = tmp_path / "mutated-subject"
    shutil.copytree(REPOSITORY_ROOT / "scripts", subject / "scripts")
    shutil.copytree(TEST_ENVELOPE.parent, subject / "tests/fixtures/governance/genesis")
    for name, old, new in changes:
        target = subject / "scripts" / name
        original = target.read_text(encoding="utf-8")
        assert original.count(old) == 1, (name, old)
        assert old != new
        target.write_text(original.replace(old, new, 1), encoding="utf-8")
    return subject


def run_subject(
    subject: Path,
    root: Path,
    *,
    base: str | None = None,
    freshness: bool = False,
    state: str = REGISTRY_PATH,
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    if freshness:
        command = [
            "node",
            str(subject / "scripts/governance/genesis/freshness.mjs"),
            "--root",
            str(root),
            "--base",
            str(base),
        ]
    else:
        script = (
            "check-governance-history.mjs" if base is not None else "check-governance-state.mjs"
        )
        command = [
            "node",
            str(subject / "scripts" / script),
            "--root",
            str(root),
            "--state",
            state,
            "--json",
        ]
        if base is not None:
            command += ["--base", base]
    result = subprocess.run(command, capture_output=True, text=True)
    return result, json.loads(result.stdout)


def test_mut_g14_each_independent_freshness_source_class_is_load_bearing(
    fresh_genesis: Path,
    tmp_path: Path,
) -> None:
    root = fresh_genesis
    source = root / "openspec/changes/governance-state-substrate/proposal.md"
    source.write_text(
        source.read_text(encoding="utf-8") + "\nUnrelated wording drift.\n", encoding="utf-8"
    )
    git(root, "add", "-A")
    git(root, "commit", "-qm", "hostile source-only drift")
    base = git(root, "rev-parse", "HEAD")
    result, payload = run_freshness(root, base)
    assert result.returncode != 0 and {p["code"] for p in payload["problems"]} == {"ADV-G73"}, (
        payload
    )
    subject = mutant_subject(
        tmp_path,
        [("governance/model/validate.mjs", "      ['localEvidenceIdentities', 'ADV-G72'],\n", "")],
    )
    mutated, after = run_subject(subject, root, base=base, freshness=True)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_mut_g14_non_markdown_consumer_extraction_is_load_bearing(
    fresh_genesis: Path, tmp_path: Path
) -> None:
    root = fresh_genesis
    (root / "unregistered-governance-copy.yml").write_text(
        "decision: ADR-0020 Proposed\n", encoding="utf-8"
    )
    git(root, "add", "-A")
    git(root, "commit", "-qm", "hostile unclassified YAML claim")
    base = git(root, "rev-parse", "HEAD")
    result, payload = run_freshness(root, base)
    assert result.returncode != 0 and "ADV-G71" in {p["code"] for p in payload["problems"]}, payload
    subject = mutant_subject(
        tmp_path,
        [("governance/model/validate.mjs", "      ['consumerInventory', 'ADV-G71'],\n", "")],
    )
    mutated, after = run_subject(subject, root, base=base, freshness=True)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def rehash_outer(state: dict[str, Any]) -> None:
    script = """
import {genesisCompletionEnvelopeDigest,genesisAttestationDigest}
  from './scripts/governance/model/index.mjs'
let raw=''; for await (const chunk of process.stdin) raw+=chunk
const state=JSON.parse(raw)
if (state.attestations.genesisCompletion)
  state.attestations.genesisCompletion.envelopeDigest=genesisCompletionEnvelopeDigest(state.attestations.genesisCompletion.members)
if (Object.keys(state.attestations.genesis).length)
  state.attestations.genesis.digest=genesisAttestationDigest(state.attestations.genesis)
console.log(JSON.stringify(state.attestations))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    state["attestations"] = json.loads(result.stdout)


@pytest.mark.parametrize("missing", [False, True])
def test_mut_g16_rehashed_outer_member_binding_is_load_bearing(
    attested_genesis: Path, tmp_path: Path, missing: bool
) -> None:
    root = attested_genesis
    state = registry(root)
    members = state["attestations"]["genesisCompletion"]["members"]
    if missing:
        members.pop()
    else:
        members[0]["digest"] = "0" * 64
    rehash_outer(state)
    write_state(root, state, REGISTRY_PATH)
    payload = assert_refused(root, "ADV-G51", path=REGISTRY_PATH)
    assert {problem["code"] for problem in payload["problems"]} == {"ADV-G51"}, payload
    changes = [
        (
            "governance/model/validate.mjs",
            "    members.filter(\n      (member) => member?.landingId === landing.id && "
            "member.digest === completion.digest,\n    ).length !== 1",
            "    false",
        )
    ]
    if missing:
        # One logical membership guard has per-record AND exact-set enforcement.
        changes.append(
            (
                "governance/model/validate.mjs",
                "    canonicalSerialize(members.map((member) => member?.landingId)"
                ".sort(compareText)) !==\n      canonicalSerialize(historicalIds)",
                "    false",
            )
        )
    subject = mutant_subject(tmp_path, changes)
    mutated, after = run_subject(subject, root)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


@pytest.mark.parametrize("case", ["profile", "waiver", "disposition-source", "disposition-bundle"])
def test_mut_g16_rehashed_historical_disposition_guards_are_load_bearing(
    fresh_genesis: Path,
    tmp_path: Path,
    case: str,
) -> None:
    root = fresh_genesis
    path = "tests/fixtures/governance/candidate/source-manifest.json"
    manifest = load_state(root, path)
    row = next(
        item for item in manifest["historicalCompletions"] if item["landingId"] == "runner/L5"
    )
    disposition = row["packageDisposition"]
    if case == "profile":
        disposition["packageProfile"] = "waive-everything"
        old, new = "    disposition.packageProfile !== 'observed-historical-v1' ||\n", ""
    elif case == "waiver":
        disposition["waivedMinimumArtifacts"].append("proposal.md")
        old, new = (
            "  if (JSON.stringify(disposition.waivedMinimumArtifacts) !== JSON.stringify(absent))",
            "  if (false)",
        )
    elif case == "disposition-source":
        disposition["sourceSnapshotIdentity"]["value"] = git(root, "rev-parse", "HEAD")
        old, new = (
            "    canonicalSerialize(disposition.sourceSnapshotIdentity) !== "
            "canonicalSerialize(source)",
            "    false",
        )
    else:
        disposition["archiveBundleSha256"] = "0" * 64
        old, new = "    disposition.archiveBundleSha256 !== value.bundleSha256 ||\n", ""
    write_state(root, manifest, path)
    rebind_test_candidate(root)
    forged_test_genesis(root)
    payload = assert_refused(root, "ADV-G86", path=REGISTRY_PATH)
    assert {p["code"] for p in payload["problems"]} == {"ADV-G86"}, payload
    subject = mutant_subject(tmp_path, [("governance/model/archived-openspec.mjs", old, new)])
    mutated, after = run_subject(subject, root)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_mut_g10_relationship_equivalence_is_not_a_row_count(
    attested_genesis: Path, tmp_path: Path
) -> None:
    root = attested_genesis
    state = registry(root)
    manifest = load_state(root, "governance/genesis-source-manifest.json")
    count = sum(
        row["collection"] == "adrs" and row["field"] in {"resolves", "supersedes"}
        for row in manifest["rows"]
    )
    # A fully rehashed envelope over a mere count is not equivalence proof.
    state["attestations"]["genesis"]["relationshipEquivalenceDigest"] = hashlib.sha256(
        (str(count) + "\n").encode()
    ).hexdigest()
    rehash_outer(state)
    write_state(root, state, REGISTRY_PATH)
    payload = assert_refused(root, "ADV-G20", path=REGISTRY_PATH)
    assert {p["code"] for p in payload["problems"]} == {"ADV-G20"}, payload
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/digests.mjs",
                "  return digestPreimage([...rows].sort((a, b) => compareText(a.id, b.id)))",
                "  return digestPreimage(rows.length)",
            )
        ],
    )
    mutated, after = run_subject(subject, root)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_mut_g16_raw_typed_records_do_not_satisfy_prerequisites_without_envelopes(
    fresh_genesis: Path,
    tmp_path: Path,
) -> None:
    root = fresh_genesis
    path = "tests/fixtures/governance/candidate/state.json"
    payload = assert_refused(root, "ADV-G51", "ADV-G90", path=path)
    assert {p["code"] for p in payload["problems"]} == {"ADV-G51", "ADV-G90"}, payload
    model = "governance/model/validate.mjs"
    subject = mutant_subject(
        tmp_path,
        [
            (
                model,
                "    addProblem(problems, 'ADV-G90', path, "
                "'the unattested candidate is not completed genesis proof')",
                "    void 0 // MUTANT: unattended typed records are trusted",
            ),
            (
                model,
                "  const members = context.state.attestations?.genesisCompletion?.members\n  if (",
                "  const members = context.state.attestations?.genesisCompletion?.members\n"
                "  if (false && (",
            ),
            (
                model,
                "    ).length !== 1\n  )\n    addProblem(",
                "    ).length !== 1\n  ))\n    addProblem(",
            ),
            (
                model,
                "  const members = state.attestations?.genesisCompletion?.members\n  if (",
                "  const members = state.attestations?.genesisCompletion?.members\n"
                "  if (false && (",
            ),
            (
                model,
                "      canonicalSerialize(historicalIds)\n  )\n    addProblem(",
                "      canonicalSerialize(historicalIds)\n  ))\n    addProblem(",
            ),
        ],
    )
    mutated, after = run_subject(subject, root, state=path)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


@pytest.mark.parametrize("empty", [False, True])
def test_mut_g16_historical_profile_keeps_existing_members_and_nonvacuity(
    attested_genesis: Path,
    tmp_path: Path,
    empty: bool,
) -> None:
    root = attested_genesis
    state = registry(root)
    landing = next(node for node in state["landings"] if node["id"] == "runner/L5")
    archive = (
        root / landing["delivery"]["completion"]["evidence"]["archivedOpenSpec"]["archiveRoot"]
    )
    assert archive.is_relative_to(root) and root.resolve() != REPOSITORY_ROOT.resolve()
    if empty:
        # Delete fixture members only; keep the empty directory observable.
        for path in archive.rglob("*"):
            if path.is_file():
                path.unlink()
    else:
        target = archive / "proposal.md"
        target.write_text("Hostile edit of an existing member.\n", encoding="utf-8")
    assert_refused(root, "ADV-G85", path=REGISTRY_PATH)
    anchor = (
        "  const before = problems.length\n"
        "  if (!validateArchive(value, path, problems, context, disposition)"
    )
    predicate = "context.checkout.tree(value.archiveRoot)?.size === 0" if empty else "true"
    replacement = f"  if ({predicate}) return true // MUTANT: historical profile bypass\n" + anchor
    subject = mutant_subject(
        tmp_path, [("governance/model/archived-openspec.mjs", anchor, replacement)]
    )
    mutated, after = run_subject(subject, root)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_mut_g16_historical_row_evidence_must_mirror_the_record(
    attested_genesis: Path, tmp_path: Path
) -> None:
    root = attested_genesis
    state = registry(root)
    node = next(item for item in state["landings"] if item["id"] == "runner/L4")
    node["delivery"]["completion"]["evidence"]["deliveredIdentity"]["scope"] = [
        "services/runner-control/README.md"
    ]
    script = """
import {genesisHistoricalCompletionDigest} from './scripts/governance/model/index.mjs'
let raw='';for await(const chunk of process.stdin) raw+=chunk
const {node,row}=JSON.parse(raw);console.log(genesisHistoricalCompletionDigest(node,row))
"""
    manifest = load_state(root, "governance/genesis-source-manifest.json")
    row = next(
        item for item in manifest["historicalCompletions"] if item["landingId"] == node["id"]
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps({"node": node, "row": row}),
        capture_output=True,
        text=True,
        check=True,
    )
    node["delivery"]["completion"]["digest"] = result.stdout.strip()
    member = next(
        item
        for item in state["attestations"]["genesisCompletion"]["members"]
        if item["landingId"] == node["id"]
    )
    member["digest"] = result.stdout.strip()
    rehash_outer(state)
    write_state(root, state, REGISTRY_PATH)
    payload = assert_refused(root, "ADV-G87", path=REGISTRY_PATH)
    assert {p["code"] for p in payload["problems"]} == {"ADV-G87"}, payload
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/validate.mjs",
                "    !equal(row.evidence, completion.evidence) ||\n",
                "",
            )
        ],
    )
    mutated, after = run_subject(subject, root)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_genesis_task_7_2_projection_and_query_use_the_full_validated_seed(
    attested_genesis: Path,
) -> None:
    root = attested_genesis
    for path, regions in [
        ("docs/decisions/INDEX.md", ["decision-lifecycle"]),
        ("docs/architecture/unresolved-decisions.md", ["question-summary", "resolution-banners"]),
    ]:
        target = root / path
        text = target.read_text(encoding="utf-8")
        for region in regions:
            text += "\n" + BEGIN.format(region) + "\n" + END.format(region) + "\n"
        target.write_text(text, encoding="utf-8")
    result = run_renderer(root, "write")
    assert result.returncode == 0, result.stderr
    first = target_bytes(root)
    assert run_renderer(root, "check").returncode == 0
    assert first == target_bytes(root)
    rendered = (root / "governance/STATE.md").read_text(encoding="utf-8")
    assert "L1 is the post-ratification human program-materialization event" in rendered
    assert "L2←L1" in rendered and "issue #19 saying L5 is next" in rendered
    assert "| ADR-0020 | Proposed | — | U4 |" in rendered
    assert "| runner/GATE-U4 | gate | — | Unsatisfied |" in rendered
    assert "| runner/L9 | implementation-landing | Planned | NotReady |" in rendered
    inventory = load_state(root, "tests/fixtures/governance/candidate/consumers.json")
    for disposition in {row["disposition"] for row in inventory["rows"]}:
        count = sum(row["disposition"] == disposition for row in inventory["rows"])
        assert f"| {disposition} | {count} |" in rendered
    for json_form in [False, True]:
        query = run_query(root, json_form=json_form)
        assert query.returncode == 0, query.stderr
        assert "AUTHORIZED" not in query.stdout
    payload = json.loads(run_query(root, json_form=True).stdout)
    l8 = next(node for node in payload["nodes"] if node["id"] == "runner/L8")
    l9 = next(node for node in payload["nodes"] if node["id"] == "runner/L9")
    assert l8["prerequisiteReadiness"]["state"] == "Ready"
    assert l8["authorizationAssessment"] == "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION"
    assert l9["prerequisiteReadiness"]["state"] == "NotReady"
    (root / "governance/STATE.md").write_text(
        rendered.replace("| historical-record |", "| tampered-count |"), encoding="utf-8"
    )
    drift = run_renderer(root, "check")
    assert drift.returncode != 0 and "ADV-G36" in drift.stderr


def test_ex_g31_terminal_genesis_survives_multilevel_ordinary_replacement(
    attested_genesis: Path,
) -> None:
    root = attested_genesis
    base = git(root, "rev-parse", "HEAD")
    state = registry(root)
    original = json.dumps(state["attestations"], sort_keys=True)
    terminal = {
        node["id"]: json.dumps(node, sort_keys=True)
        for node in state["landings"]
        if node["delivery"]["lifecycle"] == "Complete"
    }
    for old, new in [
        ("runner/L8", "runner/L8-v2"),
        ("runner/L9", "runner/L9-v2"),
        ("runner/L10", "runner/L10-v2"),
    ]:
        replacement_pair(root, state, old, new)
    for node in state["landings"]:
        if node["id"].endswith("-v2"):
            node["requires"] = [
                item + "-v2" if item in {"runner/L8", "runner/L9"} else item
                for item in node["requires"]
            ]
            node["replacement"]["attestation"]["actor"] = "fixture:ordinary-replacement"
    state = bind_replacements(root, state)
    commit_registry(root, state, "TEST ordinary replacement closure after genesis")
    assert_valid(root, REGISTRY_PATH)
    assert_history_clean(root, base=base)
    assert json.dumps(state["attestations"], sort_keys=True) == original
    assert all(
        json.dumps(node, sort_keys=True) == terminal[node["id"]]
        for node in state["landings"]
        if node["id"] in terminal
    )


@pytest.mark.parametrize(
    "case",
    [
        "undeclared-relationship",
        "stored-resolution",
        "accepted-lifecycle",
        "bare-node",
        "impossible-prerequisite",
    ],
)
def test_task_7_2_invalid_seed_never_yields_readiness(fresh_genesis: Path, case: str) -> None:
    root = fresh_genesis
    path = "tests/fixtures/governance/candidate/state.json"
    state = load_state(root, path)
    if case == "undeclared-relationship":
        next(adr for adr in state["adrs"] if adr["id"] == "ADR-0020")["resolves"].append("U5")
        code = "ADV-G20"
    elif case == "stored-resolution":
        state["questions"][0]["resolved"] = True
        code = "ADV-G02"
    elif case == "accepted-lifecycle":
        next(adr for adr in state["adrs"] if adr["id"] == "ADR-0020")["lifecycle"] = "Accepted"
        code = "ADV-G20"
    elif case == "bare-node":
        state["landings"][0]["requires"] = ["L1"]
        code = "ADV-G12"
    else:
        next(node for node in state["landings"] if node["id"] == "runner/L2")["requires"] = [
            "runner/GATE-U4"
        ]
        code = "ADV-G56"
    write_state(root, state, path)
    rebind_test_candidate(root)
    # Even recomputing all content identities is not a source-equivalence proof.
    forged_test_genesis(root)
    payload = assert_refused(root, code, path=REGISTRY_PATH)
    assert "derived" not in payload
    query = run_query(root, json_form=True)
    assert query.returncode != 0 and '"prerequisiteReadiness"' not in query.stdout


@pytest.mark.parametrize(
    "field",
    [
        "schemaVersion",
        "landingId",
        "observedLifecycle",
        "sourceSnapshotIdentity",
        "authorityAnchor",
        "completionPolicy",
        "scopedDeliveredIdentity",
        "policyEvidenceIdentities",
        "historicalPackageDisposition",
    ],
)
def test_mut_g16_every_historical_preimage_field_is_load_bearing(
    fresh_genesis: Path, tmp_path: Path, field: str
) -> None:
    root = fresh_genesis
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/digests.mjs",
                "  return digestPreimage(genesisHistoricalCompletionPreimage(landing, row))",
                "  const preimage = genesisHistoricalCompletionPreimage(landing, row)\n"
                f"  delete preimage.{field}\n  return digestPreimage(preimage)",
            )
        ],
    )
    # Rehash every dependent candidate/envelope value using the deficient digest.
    # Stale outer hashes must not be what makes the production checker refuse it.
    rebind_test_candidate(root, subject=subject)
    forged_test_genesis(root, subject=subject)
    assert_refused(root, "ADV-G88", path=REGISTRY_PATH)
    mutated, after = run_subject(subject, root)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_adv_g83_mut_g16_fully_rehashed_genesis_cannot_replace_ordinary_transitions(
    fresh_genesis: Path,
    tmp_path: Path,
) -> None:
    root = fresh_genesis
    # A current-valid registry-bearing base, deliberately with no genesis
    # exception available. Its normal completion transitions need normal proof.
    state = load_state(root, "tests/fixtures/governance/candidate/state.json")
    for node in state["landings"]:
        node["delivery"]["lifecycle"] = "Planned"
        node["delivery"]["completion"] = None
    (root / "governance").mkdir()
    write_state(root, state, REGISTRY_PATH)
    inventory = load_state(root, "tests/fixtures/governance/candidate/consumers.json")
    # Isolated-test inventory includes this deliberately pre-existing authority.
    copied = next(
        row
        for row in inventory["rows"]
        if row["path"] == "tests/fixtures/governance/candidate/state.json"
    ).copy()
    copied.update(
        path=REGISTRY_PATH,
        disposition="stable-pointer",
        retainedReason=None,
        historicalIdentity=None,
        generatedRegions=[],
    )
    inventory["rows"].append(copied)
    write_state(root, inventory, "tests/fixtures/governance/candidate/consumers.json")
    base = commit_registry(root, state, "current-valid ordinary registry without genesis exception")
    assert_valid(root, REGISTRY_PATH)
    state = install_test_genesis(root, base)
    commit_registry(root, state, "HOSTILE fully rehashed post-genesis historical fallback")
    assert_valid(root, REGISTRY_PATH)  # No stale digest is responsible for refusal.
    payload = assert_history_refused(root, "ADV-G83", "ADV-G89", base=base)
    assert {p["code"] for p in payload["problems"]} <= {"ADV-G83", "ADV-G89", "ADV-G29"}, payload
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/history.mjs",
                "  compareGenesisPreservation(base, target, problems)\n",
                "",
            ),
            (
                "governance/model/history.mjs",
                "      } else if (completion.from !== from) {",
                "      } else if (completion.type !== 'genesis-historical-completion-v1' "
                "&& completion.from !== from) {",
            ),
        ],
    )
    mutated, after = run_subject(subject, root, base=base)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_d76_handoff_positive_is_evidence_not_a_primitive(attested_genesis: Path) -> None:
    root = attested_genesis
    state = registry(root)
    genesis = state["attestations"]["genesis"]
    assert genesis["actor"] == "fixture:genesis-mechanism"
    assert genesis["authority"]["id"] == "mechanical-test-only"
    assert genesis["externalIndexHandoff"]["commentId"] == 1  # Not the real owner comment.
    payload = assert_valid(root, REGISTRY_PATH)
    assert len(state["adrs"]) == 24
    assert sum(a["lifecycle"] in {"Accepted", "Rejected"} for a in state["adrs"]) == 23
    assert next(a for a in state["adrs"] if a["id"] == "ADR-0020")["lifecycle"] == "Proposed"
    assert payload["derived"]["questions"]["U4"]["resolved"] is False
    assert payload["derived"]["gates"]["runner/GATE-U4"]["satisfied"] is False
    assert payload["derived"]["readiness"]["runner/L9"]["state"] == "NotReady"
    assert_history_clean(root, base=genesis["activationBaseCommit"])
    script = """
import {primitiveDigest,relationshipDigest,genesisAttestationDigest}
  from './scripts/governance/model/index.mjs'
let raw=''; for await (const chunk of process.stdin) raw+=chunk
const state=JSON.parse(raw)
const before=[primitiveDigest(state),relationshipDigest(state)]
const genesis=state.attestations.genesis
const digest=genesisAttestationDigest(genesis)
genesis.externalIndexHandoff.commentId++
const changed=genesisAttestationDigest(genesis)
genesis.activationIdentity.number++
console.log(JSON.stringify({before,after:[primitiveDigest(state),relationshipDigest(state)],
  bound: digest !== changed && changed !== genesisAttestationDigest(genesis)}))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state),
        capture_output=True,
        text=True,
        check=True,
    )
    proof = json.loads(result.stdout)
    assert proof["before"] == proof["after"]
    assert proof["bound"] is True


@pytest.mark.parametrize(
    ("member", "value", "code"),
    [
        ("missing-handoff", None, "ADV-G49"),
        ("null-handoff", None, "ADV-G49"),
        ("extra", True, "ADV-G02"),
        ("activationIdentity", {}, "ADV-G02"),
        ("contract", "github-issue-conditional-handoff-v2", "ADV-G49"),
        ("index", None, "ADV-G49"),
        ("index.type", "github-pull-request", "ADV-G49"),
        ("index.number", 20, "ADV-G49"),
        ("index.number", "19", "ADV-G49"),
        ("index.repository", "fixture/another-repository", "ADV-G49"),
        ("index.extra", True, "ADV-G02"),
        ("commentId", 0, "ADV-G49"),
        ("commentId", -1, "ADV-G49"),
        ("commentId", 1.5, "ADV-G49"),
        ("commentId", True, "ADV-G49"),
        ("commentId", "1", "ADV-G49"),
        ("commentId", 9007199254740992, "ADV-G49"),
        ("commentBodySha256", "A" * 64, "ADV-G49"),
        ("commentBodySha256", "0" * 63, "ADV-G49"),
        ("commentBodySha256", None, "ADV-G49"),
        ("canonicalRegistryPath", "tests/fixtures/governance/candidate/state.json", "ADV-G49"),
        ("sibling.type", "github-issue", "ADV-G49"),
        ("sibling.repository", "fixture/another-repository", "ADV-G49"),
        ("missing-commentId", None, "ADV-G49"),
    ],
)
def test_d76_closed_handoff_refuses_malformed_evidence(
    attested_genesis: Path, member: str, value: Any, code: str
) -> None:
    root = attested_genesis
    state = registry(root)
    genesis = state["attestations"]["genesis"]
    handoff = genesis["externalIndexHandoff"]
    if member == "missing-handoff":
        del genesis["externalIndexHandoff"]
    elif member == "null-handoff":
        genesis["externalIndexHandoff"] = None
    elif member == "missing-commentId":
        del handoff["commentId"]
    elif member.startswith("sibling."):
        genesis["activationIdentity"][member.split(".")[1]] = value
    elif member.startswith("index."):
        handoff["index"][member.split(".")[1]] = value
    else:
        handoff[member] = value
    rehash_outer(state)  # Shape refusal must not merely be an outdated digest.
    write_state(root, state, REGISTRY_PATH)
    payload = assert_refused(root, code, path=REGISTRY_PATH)
    assert "derived" not in payload


@pytest.mark.parametrize("substitute", ["externalReferences", "pr-metadata"])
def test_d76_handoff_cannot_be_supplied_outside_genesis(
    attested_genesis: Path, substitute: str
) -> None:
    root = attested_genesis
    state = registry(root)
    handoff = state["attestations"]["genesis"].pop("externalIndexHandoff")
    if substitute == "externalReferences":
        # Even a shape-valid external reference is not the attested D7.6 carrier.
        state["externalReferences"].append(
            {"id": "fixture/handoff", "reference": handoff["index"], "role": json.dumps(handoff)}
        )
    else:
        # Local representation of external PR metadata: never checker authority.
        (root / "pr-metadata.json").write_text(json.dumps(handoff), encoding="utf-8")
    rehash_outer(state)
    write_state(root, state, REGISTRY_PATH)
    payload = assert_refused(root, "ADV-G49", path=REGISTRY_PATH)
    assert any(
        p["path"] == "$.attestations.genesis.externalIndexHandoff" for p in payload["problems"]
    )


@pytest.mark.parametrize(
    ("member", "value"),
    [
        ("contract", "github-issue-conditional-handoff-v2"),
        ("index.type", "github-pull-request"),
        ("index.repository", "fixture/another-repository"),
        ("index.number", 20),
        ("commentId", 2),
        ("commentBodySha256", "1" * 64),
        ("canonicalRegistryPath", "governance/other.json"),
    ],
)
def test_d76_each_handoff_member_is_immutable_even_when_rehashed(
    attested_genesis: Path, tmp_path: Path, member: str, value: Any
) -> None:
    root = attested_genesis
    base = git(root, "rev-parse", "HEAD")
    state = registry(root)
    handoff = state["attestations"]["genesis"]["externalIndexHandoff"]
    if member.startswith("index."):
        handoff["index"][member.split(".")[1]] = value
    else:
        handoff[member] = value
    rehash_outer(state)
    commit_registry(root, state, "HOSTILE test-only D7.6 evidence mutation")
    if member in {"commentId", "commentBodySha256"}:
        # Both snapshots are valid alone; only history can detect this mutation.
        assert_valid(root, REGISTRY_PATH)
        assert_history_refused(root, "ADV-G89", base=base)
        subject = mutant_subject(
            tmp_path,
            [
                (
                    "governance/model/history.mjs",
                    "  compareGenesisPreservation(base, target, problems)\n",
                    "",
                )
            ],
        )
        result, payload = run_subject(subject, root, base=base)
        assert result.returncode == 0 and payload["ok"] is True, payload
    else:
        assert_refused(root, "ADV-G49", path=REGISTRY_PATH)
        assert_history_refused(root, base=base)


def test_d76_digest_omission_mutant_is_detected(attested_genesis: Path, tmp_path: Path) -> None:
    root = attested_genesis
    state = registry(root)
    script = """
import {genesisAttestationPreimage,digestPreimage} from './scripts/governance/model/digests.mjs'
let raw=''; for await (const chunk of process.stdin) raw+=chunk
const preimage=genesisAttestationPreimage(JSON.parse(raw))
if (!Object.hasOwn(preimage,'externalIndexHandoff')) throw new Error('handoff omitted')
delete preimage.externalIndexHandoff
console.log(digestPreimage(preimage))
"""
    omitted = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(state["attestations"]["genesis"]),
        capture_output=True,
        text=True,
        check=True,
    )
    state["attestations"]["genesis"]["digest"] = omitted.stdout.strip()
    write_state(root, state, REGISTRY_PATH)
    assert_refused(root, "ADV-G62", path=REGISTRY_PATH)
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/digests.mjs",
                "    externalIndexHandoff: value.externalIndexHandoff,\n",
                "",
            )
        ],
    )
    result, payload = run_subject(subject, root)
    assert result.returncode == 0 and payload["ok"] is True, payload


def test_adv_g89_mut_g16_rehashed_genesis_envelope_remains_immutable(
    attested_genesis: Path, tmp_path: Path
) -> None:
    root = attested_genesis
    base = git(root, "rev-parse", "HEAD")
    state = registry(root)
    state["attestations"]["genesis"]["actor"] = "fixture:changed-general-envelope"
    rehash_outer(state)
    commit_registry(root, state, "HOSTILE fully rehashed envelope edit")
    assert_valid(root, REGISTRY_PATH)
    payload = assert_history_refused(root, "ADV-G89", base=base)
    assert {p["code"] for p in payload["problems"]} == {"ADV-G89"}, payload
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/history.mjs",
                "  compareGenesisPreservation(base, target, problems)\n",
                "",
            )
        ],
    )
    mutated, after = run_subject(subject, root, base=base)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


def test_mut_g14_matching_source_commit_is_not_complete_freshness(
    fresh_genesis: Path, tmp_path: Path
) -> None:
    root = fresh_genesis
    result, payload = run_freshness(root, POST_BRIDGE_SOURCE)
    assert result.returncode != 0 and "ADV-G71" in {p["code"] for p in payload["problems"]}, payload
    old = """    const classes = [
      ['primitiveSourceTuples', 'ADV-G69'],
      ['relationshipTuples', 'ADV-G69'],
      ['localEvidenceIdentities', 'ADV-G72'],
      ['consumerInventory', 'ADV-G71'],
    ]"""
    subject = mutant_subject(
        tmp_path,
        [
            (
                "governance/model/validate.mjs",
                old,
                old.replace(
                    "const classes = [",
                    "const classes = activationBaseCommit === source.commit ? [] : [",
                ),
            )
        ],
    )
    mutated, after = run_subject(subject, root, base=POST_BRIDGE_SOURCE, freshness=True)
    assert mutated.returncode == 0 and after["ok"] is True, (after, mutated.stderr)


@pytest.mark.parametrize(
    "case",
    ["missing-source", "unparseable-relationship", "conflicting-status", "duplicate-relationship"],
)
def test_adv_g31_source_failures_are_observed_at_the_explicit_revision(
    fresh_genesis: Path, case: str
) -> None:
    root = fresh_genesis
    state = load_state(root, "tests/fixtures/governance/candidate/state.json")
    adr = next(item for item in state["adrs"] if item["id"] == "ADR-0020")
    source = root / adr["path"]
    if case == "missing-source":
        source.unlink()
    else:
        text = source.read_text(encoding="utf-8")
        if case == "unparseable-relationship":
            text = text.replace(
                "- **Status:** Proposed",
                "- **Status:** Proposed\n- **Closes:** U5 without a structural source link",
            )
        elif case == "conflicting-status":
            text = text.replace(
                "- **Status:** Proposed", "- **Status:** Proposed\n- **Status:** Accepted"
            )
        else:
            text = text.replace(
                "- **Status:** Proposed",
                "- **Status:** Proposed\n- **Closes:** None\n"
                "- **Closes:** [U5](../architecture/unresolved-decisions.md#u5)",
            )
        source.write_text(text, encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "HOSTILE unreadable or conflicting genesis source")
    result, payload = run_freshness(root, git(root, "rev-parse", "HEAD"))
    assert result.returncode != 0 and payload["ok"] is False, payload
    assert any(p["code"] in {"ADV-G31", "ADV-G74"} for p in payload["problems"]), payload


@pytest.mark.parametrize(
    "name,args",
    [
        ("extract.mjs", ["--source", DURABLE_PR2A, "--historical-mode"]),
        ("freshness.mjs", ["--base", DURABLE_PR2A, "--skip-source"]),
    ],
)
def test_genesis_clis_have_no_hidden_bypass_switch(name: str, args: list[str]) -> None:
    result = subprocess.run(
        ["node", str(FRESHNESS.with_name(name)), "--root", str(REPOSITORY_ROOT), *args],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0 and "Unknown option" in result.stderr


PR3_PROTECTED_CONTEXT = {
    "openspec/changes/runner-adapter-conformance-seed/assurance.md": ["program-state"],
    "openspec/changes/runner-adapter-conformance-seed/design.md": [
        "decision-lifecycle",
        "program-state",
    ],
    "openspec/changes/runner-adapter-conformance-seed/proposal.md": [
        "program-state",
        "question-resolution",
    ],
    "openspec/changes/runner-adapter-conformance-seed/tasks.md": ["program-state"],
}
PR3_NON_POINTER_SCOPE = {
    "8.2": {
        "governance/state.json",
        "governance/genesis-source-manifest.json",
        "governance/consumers.json",
        "governance/README.md",
        "tests/fixtures/governance/candidate/state.json",
        "tests/fixtures/governance/candidate/source-manifest.json",
        "tests/fixtures/governance/candidate/consumers.json",
    },
    "8.2a": {"openspec/changes/governance-state-substrate/ACTIVATION-INTENT.md"},
    "8.3": {
        "governance/STATE.md",
        "docs/decisions/INDEX.md",
        "docs/architecture/unresolved-decisions.md",
    },
    "8.5": {
        ".github/workflows/checks.yml",
        "scripts/validate-scaffold.sh",
        "scripts/check-governance-state.mjs",
        "scripts/check-governance-history.mjs",
    },
}
PR3_INVENTORY_COUNTS = {
    "stable-pointer": 75,
    "retained-semantic-prose": 7,
    "generated-region": 2,
    "historical-record": 66,
    "not-a-governance-consumer": 32,
}
PR3_RETAINED_MEANING = (
    "Frozen pre-activation / source-era PR-101 planning context",
    "PR-3 deliberately leaves these bytes unchanged",
    "After activation this is NOT a current governance authority",
    "live decision lifecycle, question-resolution and program-state answers",
    "come only from governance/state.json / the canonical query",
    "PR #101 remains separately governed",
    "cannot be modified until the post-PR-3 handoff",
)


def pr3_scope_inputs() -> tuple[dict[str, list[str]], dict[str, Any]]:
    """Read actual task metadata and the same frozen inventory across promotion."""
    tasks = (REPOSITORY_ROOT / "openspec/changes/governance-state-substrate/tasks.md").read_text()
    scopes: dict[str, list[str]] = {}
    for task, paths in re.findall(r"<!-- agent-task: (8\.[\da-z]+) paths=(\S+) checks=", tasks):
        assert task not in scopes, f"duplicate task {task}"
        scopes[task] = paths.split(",")
    canonical = REPOSITORY_ROOT / "governance/consumers.json"
    candidate = REPOSITORY_ROOT / "tests/fixtures/governance/candidate/consumers.json"
    assert not (canonical.exists() and candidate.exists()), "two usable inventories"
    inventory = load_state(REPOSITORY_ROOT, str(canonical if canonical.exists() else candidate))
    return scopes, inventory


def assert_pr3_consumer_scope(scopes: dict[str, list[str]], inventory: dict[str, Any]) -> set[str]:
    """Planning consistency oracle only; does not replace a production state rule."""
    rows = inventory["rows"]
    by_path = {row["path"]: row for row in rows}
    assert len(by_path) == len(rows) == 182
    assert Counter(row["disposition"] for row in rows) == PR3_INVENTORY_COUNTS
    pointers = {row["path"] for row in rows if row["disposition"] == "stable-pointer"}
    assert len(scopes["8.4"]) == len(set(scopes["8.4"])) == len(pointers) == 75
    assert set(scopes["8.4"]) == pointers, "task 8.4 and stable-pointer rows differ"
    assert "packages/runner-core/README.md" not in scopes["8.4"]
    assert "packages/runner-core/README.md" not in by_path
    assert pointers.isdisjoint(PR3_PROTECTED_CONTEXT)
    for path, fact_classes in PR3_PROTECTED_CONTEXT.items():
        row = by_path[path]
        assert row["disposition"] == "retained-semantic-prose"
        assert row["factClasses"] == fact_classes
        assert row["generatedRegions"] == []
        assert row["historicalIdentity"] is None
        assert row["migrationLanding"] == "PR-3"
        assert isinstance(row["retainedReason"], str)
        for meaning in PR3_RETAINED_MEANING:
            assert meaning in row["retainedReason"], f"{path}: missing {meaning}"
    for task, expected in PR3_NON_POINTER_SCOPE.items():
        assert len(scopes[task]) == len(set(scopes[task]))
        assert set(scopes[task]) == expected, f"unexpected non-pointer scope {task}"
    union = set().union(*(scopes[task] for task in ["8.2", "8.2a", "8.3", "8.4", "8.5"]))
    expected_union = pointers.union(*PR3_NON_POINTER_SCOPE.values())
    assert union == expected_union
    assert len(union) == 90
    assert all(not any(char in path for char in "*?[]") for path in union), "glob scope"
    return union


def test_pr3_consumer_scope_matches_real_inventory_and_task_metadata() -> None:
    scopes, inventory = pr3_scope_inputs()
    assert len(assert_pr3_consumer_scope(scopes, inventory)) == 90
    design = (REPOSITORY_ROOT / "openspec/changes/governance-state-substrate/design.md").read_text()
    table = design.split("<!-- consumer-scope-counts:begin -->", 1)[1].split(
        "<!-- consumer-scope-counts:end -->", 1
    )[0]
    displayed = {name: int(count) for name, count in re.findall(r"\| ([a-z-]+) \| (\d+) \|", table)}
    assert displayed == {**PR3_INVENTORY_COUNTS, "total": len(inventory["rows"])}
    spec = (
        REPOSITORY_ROOT
        / "openspec/changes/governance-state-substrate/specs/governance-state/spec.md"
    ).read_text()
    assert "75 pointer rows, 7 retained" in spec
    assert "2 generated-region rows, 66 historical rows and 32 non-consumers" in spec
    assert "182 total" in spec and "exactly 90 paths" in spec


@pytest.mark.parametrize(
    "case",
    [
        "omitted-pointer",
        "duplicate-pointer",
        "smuggled-non-pointer",
        "stale-runner-core",
        "protected-in-task",
        "swapped-same-count",
        "changed-disposition",
        "historical-protected",
        "missing-reason",
        "changed-fact-classes",
        "generated-protected",
        "historical-identity",
        "wrong-landing",
        "unknown-row",
        "missing-row",
        "seam-extra",
        "seam-omitted",
        "seam-substitution",
        "seam-duplicate",
        "glob",
    ],
)
def test_pr3_consumer_scope_hostile_mutations_refuse(case: str) -> None:
    scopes, inventory = pr3_scope_inputs()
    row = next(row for row in inventory["rows"] if row["path"] in PR3_PROTECTED_CONTEXT)
    if case == "omitted-pointer":
        scopes["8.4"].pop()
    elif case == "duplicate-pointer":
        scopes["8.4"].append(scopes["8.4"][0])
    elif case == "smuggled-non-pointer":
        scopes["8.4"].append("docs/decisions/INDEX.md")
    elif case == "stale-runner-core":
        scopes["8.4"].append("packages/runner-core/README.md")
    elif case == "protected-in-task":
        scopes["8.4"].append(row["path"])
    elif case == "swapped-same-count":
        scopes["8.4"][0] = row["path"]
    elif case == "changed-disposition":
        next(r for r in inventory["rows"] if r["disposition"] == "stable-pointer")[
            "disposition"
        ] = "retained-semantic-prose"
    elif case == "historical-protected":
        row["disposition"] = "historical-record"
    elif case == "missing-reason":
        row["retainedReason"] = ""
    elif case == "changed-fact-classes":
        row["factClasses"] = []
    elif case == "generated-protected":
        row["generatedRegions"] = ["decision-lifecycle"]
    elif case == "historical-identity":
        row["historicalIdentity"] = {"class": "local-git-commit", "value": POST_BRIDGE_SOURCE}
    elif case == "wrong-landing":
        row["migrationLanding"] = "PR-4"
    elif case == "unknown-row":
        inventory["rows"].append({**row, "path": "unreviewed.md"})
    elif case == "missing-row":
        inventory["rows"].remove(row)
    elif case == "seam-extra":
        scopes["8.5"].append("scripts/query-governance-state.mjs")
    elif case == "seam-omitted":
        scopes["8.2"].pop()
    elif case == "seam-substitution":
        scopes["8.5"][0] = "scripts/query-governance-state.mjs"
    elif case == "seam-duplicate":
        scopes["8.2"].append(scopes["8.2"][0])
    else:
        scopes["8.4"][0] = "docs/**"
    with pytest.raises(AssertionError):
        assert_pr3_consumer_scope(scopes, inventory)


@pytest.mark.parametrize("meaning", PR3_RETAINED_MEANING)
def test_pr3_consumer_scope_each_retention_obligation_is_required(meaning: str) -> None:
    scopes, inventory = pr3_scope_inputs()
    row = next(row for row in inventory["rows"] if row["path"] in PR3_PROTECTED_CONTEXT)
    row["retainedReason"] = row["retainedReason"].replace(meaning, "")
    with pytest.raises(AssertionError):
        assert_pr3_consumer_scope(scopes, inventory)


def test_pr3_consumer_scope_complete_discovery_uses_production_inventory_validator() -> None:
    script = """
import {readFileSync} from 'node:fs'
import {readCheckoutSnapshot,createGenesisReader}
  from './scripts/governance/genesis/observations.mjs'
import {validateConsumerInventory,discoverConsumers} from './scripts/governance/model/consumers.mjs'
const inventory=JSON.parse(readFileSync('tests/fixtures/governance/candidate/consumers.json'))
const snapshot=readCheckoutSnapshot('.')
const source=createGenesisReader('.')('c82fda72927464d813ec769aee53f4079ebe3b20')
const problems=[]
validateConsumerInventory(inventory,snapshot,problems,source)
console.log(JSON.stringify({problems,discovered:discoverConsumers(snapshot).length,rows:inventory.rows.length}))
process.exitCode=problems.length?1:0
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (result.stdout, result.stderr)
    payload = json.loads(result.stdout)
    assert payload == {"problems": [], "discovered": 182, "rows": 182}


# D7.3a: explicit preparation composes proof, never substitutes for attestation.
PREPARATION_BASELINE = "1b0f3d98f36608cddf894526379cca3aadb27616"
PROMOTION_MEMBERS = {
    "state.json": "governance/state.json",
    "source-manifest.json": "governance/genesis-source-manifest.json",
    "consumers.json": "governance/consumers.json",
}


def preparation_binding(root: Path) -> dict[str, str]:
    base = git(root, "rev-parse", "HEAD")
    result, payload = run_freshness(root, base)
    assert result.returncode == 0, (payload, result.stderr)
    proof = payload["result"]
    return {
        "activationBaseCommit": base,
        "candidateBundleSha256": proof["candidateFreezeIdentity"]["bundleSha256"],
        "activationFreshnessDigest": proof["activationFreshnessDigest"],
    }


def promote_preparation_fixture(root: Path) -> None:
    assert root.resolve() != REPOSITORY_ROOT.resolve()
    (root / "governance").mkdir(exist_ok=True)
    for name, target in PROMOTION_MEMBERS.items():
        (root / "tests/fixtures/governance/candidate" / name).replace(root / target)


def add_preparation_markers(root: Path) -> None:
    for name, regions in {
        "docs/decisions/INDEX.md": ["decision-lifecycle"],
        "docs/architecture/unresolved-decisions.md": ["question-summary", "resolution-banners"],
    }.items():
        path = root / name
        path.write_text(
            path.read_text()
            + "\n"
            + "\n".join(BEGIN.format(region) + "\n" + END.format(region) for region in regions)
            + "\n"
        )


def run_preparation(
    root: Path,
    binding: dict[str, str],
    *,
    write: bool = True,
    subject: Path = REPOSITORY_ROOT,
    model_only: bool = False,
) -> dict[str, Any]:
    module = "governance/genesis/freshness.mjs" if model_only else "render-governance-state.mjs"
    function = "evaluateProjectionPreparation" if model_only else "prepareGovernanceProjections"
    script = (
        f"import {{{function}}} from {json.dumps((subject / 'scripts' / module).as_uri())};"
        "let raw='';for await(const chunk of process.stdin)raw+=chunk;"
        f"console.log(JSON.stringify({function}(JSON.parse(raw))))"
    )
    options: dict[str, Any] = {"root": str(root), **binding}
    if not model_only:
        options["write"] = write
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps(options),
        capture_output=True,
        text=True,
        check=True,
    )
    return cast(dict[str, Any], json.loads(result.stdout))


def test_preparation_parity_with_equivalent_normal_test_attested_state(fresh_genesis: Path) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    add_preparation_markers(root)
    initial_targets = target_bytes(root)
    test_state = install_test_genesis(root, binding["activationBaseCommit"])
    normal = run_renderer(root, "write")
    assert normal.returncode == 0, normal.stderr
    expected = target_bytes(root)
    # Restore identical target input bytes, then promote the exact RAW seed.
    for path, value in initial_targets.items():
        (root / path).write_bytes(value)
    (root / "governance/STATE.md").unlink()
    promote_preparation_fixture(root)
    raw = registry(root)
    assert {**raw, "attestations": test_state["attestations"]} == test_state
    assert raw["attestations"] == {"genesis": {}}
    # Full current and ordinary rendering remain refused before owner attestation.
    assert run_checker(root, REGISTRY_PATH)[0].returncode == 1
    assert run_renderer(root, "write").returncode == 1
    prepared = run_preparation(root, binding)
    assert prepared["ok"], prepared
    assert prepared["phase"] == "pre-attestation-projection-preparation"
    assert prepared["freshness"]["activationBaseCommit"] == binding["activationBaseCommit"]
    assert (
        prepared["freshness"]["activationFreshnessDigest"] == binding["activationFreshnessDigest"]
    )
    assert target_bytes(root) == expected
    assert run_preparation(root, binding, write=False)["ok"]
    assert target_bytes(root) == expected
    assert registry(root) == raw
    model = run_preparation(root, binding, model_only=True)
    assert model["derived"]["questions"]["U4"]["resolved"] is False
    assert model["derived"]["gates"]["runner/GATE-U4"]["satisfied"] is False
    assert model["derived"]["readiness"]["runner/L9"]["state"] == "NotReady"
    # Test-only envelopes remain inadmissible to preparation, including after rendering.
    write_state(root, test_state, REGISTRY_PATH)
    refused = run_preparation(root, binding)
    assert not refused["ok"] and refused["wrote"] == []


@pytest.mark.parametrize(
    "case",
    [
        "missing-base",
        "unknown-base",
        "wrong-bundle",
        "wrong-freshness",
        "unknown-field",
        "state-bytes",
        "manifest-bytes",
        "inventory-bytes",
        "missing-member",
        "surviving-source",
        "test-envelope",
        "adr-bytes",
        "adr-enumeration",
        "archive-bytes",
        "unregistered-marker",
        "same-bundle-other-base",
        "prior-registry",
    ],
)
def test_preparation_hostile_inputs_refuse_without_writes(fresh_genesis: Path, case: str) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    if case in {"same-bundle-other-base", "prior-registry"}:
        if case == "prior-registry":
            (root / "governance").mkdir()
            path = root / REGISTRY_PATH
            path.write_text("{}\n")
            git(root, "add", "-A")
            git(root, "commit", "-qm", "HOSTILE prior registry")
            path.unlink()
        git(root, "add", "-A")
        git(root, "commit", "--allow-empty", "-qm", "different explicit base")
        binding["activationBaseCommit"] = git(root, "rev-parse", "HEAD")
    promote_preparation_fixture(root)
    add_preparation_markers(root)
    if case == "missing-base":
        binding.pop("activationBaseCommit")
    elif case == "unknown-base":
        binding["activationBaseCommit"] = "0" * 40
    elif case == "wrong-bundle":
        binding["candidateBundleSha256"] = "0" * 64
    elif case == "wrong-freshness":
        binding["activationFreshnessDigest"] = "0" * 64
    elif case == "unknown-field":
        binding["ignore"] = "ADV-G90"
    elif case in {"state-bytes", "manifest-bytes", "inventory-bytes"}:
        name = {
            "state-bytes": "state.json",
            "manifest-bytes": "source-manifest.json",
            "inventory-bytes": "consumers.json",
        }[case]
        path = root / PROMOTION_MEMBERS[name]
        path.write_bytes(path.read_bytes() + b"\n")
    elif case == "missing-member":
        (root / "governance/consumers.json").unlink()
    elif case == "surviving-source":
        shutil.copyfile(
            root / REGISTRY_PATH, root / "tests/fixtures/governance/candidate/state.json"
        )
    elif case == "test-envelope":
        state = registry(root)
        state["attestations"]["genesis"] = {"actor": "fixture:never-owner"}
        write_state(root, state, REGISTRY_PATH)
    elif case == "adr-bytes":
        path = root / registry(root)["adrs"][0]["path"]
        path.write_text(path.read_text() + "\nHOSTILE changed ADR bytes\n")
    elif case == "adr-enumeration":
        (root / "docs/decisions/ADR-9999-unreviewed.md").write_text("# Unreviewed\n")
    elif case == "archive-bytes":
        row = next(row for row in registry(root)["landings"] if row["id"] == "runner/L4")
        path = (
            root
            / row["delivery"]["completion"]["evidence"]["archivedOpenSpec"]["archiveRoot"]
            / "proposal.md"
        )
        path.write_text(path.read_text() + "\nHOSTILE archive drift\n")
    elif case == "unregistered-marker":
        path = root / "docs/decisions/INDEX.md"
        path.write_text(path.read_text() + "\n" + BEGIN.format("unregistered") + "\n")
    before = target_bytes(root)
    payload = run_preparation(root, binding)
    assert payload["ok"] is False and payload["wrote"] == [], payload
    assert target_bytes(root) == before
    if case != "unregistered-marker":
        model = run_preparation(root, binding, model_only=True)
        assert not model["ok"] and "derived" not in model, model


def test_preparation_normal_raw_diagnostics_identical_to_pre_correction(
    fresh_genesis: Path,
    tmp_path: Path,
) -> None:
    root = fresh_genesis
    baseline = tmp_path / "baseline"
    subprocess.run(
        [
            "git",
            "clone",
            "--quiet",
            "--shared",
            "--no-checkout",
            str(REPOSITORY_ROOT),
            str(baseline),
        ],
        check=True,
    )
    git(baseline, "checkout", "--quiet", "--detach", PREPARATION_BASELINE)
    state_path = "tests/fixtures/governance/candidate/state.json"
    before = target_bytes(root)
    for script, args in [
        ("check-governance-state.mjs", ["--json"]),
        ("render-governance-state.mjs", ["--check"]),
        ("render-governance-state.mjs", ["--write"]),
    ]:
        results = [
            subprocess.run(
                [
                    "node",
                    str(subject / "scripts" / script),
                    "--root",
                    str(root),
                    "--state",
                    state_path,
                    *args,
                ],
                capture_output=True,
                text=True,
            )
            for subject in [baseline, REPOSITORY_ROOT]
        ]
        assert results[0].returncode == results[1].returncode == 1
        assert results[0].stdout == results[1].stdout
        assert results[0].stderr == results[1].stderr
        assert "ADV-G90" in results[1].stdout + results[1].stderr
        assert "ADV-G51" in results[1].stdout + results[1].stderr
    assert target_bytes(root) == before


@pytest.mark.parametrize(
    "case,code",
    [
        ("primitive", "ADV-G69"),
        ("relationship", "ADV-G69"),
        ("evidence", "ADV-G73"),
        ("consumer", "ADV-G71"),
    ],
)
def test_preparation_recomputes_each_freshness_class(
    fresh_genesis: Path,
    case: str,
    code: str,
) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    adr = root / "docs/decisions/ADR-0020-place-runner-control-by-workload-class.md"
    if case == "primitive":
        adr.write_text(adr.read_text().replace("**Status:** Proposed", "**Status:** Accepted", 1))
    elif case == "relationship":
        adr.write_text(adr.read_text().replace("U4", "U3").replace("#u4", "#u3"))
    elif case == "evidence":
        path = root / "openspec/changes/governance-state-substrate/proposal.md"
        path.write_text(path.read_text() + "\nSource drift.\n")
    else:
        (root / "unregistered-consumer.yaml").write_text(
            "current_decisions: ADR-0001 through ADR-0022 are Accepted\n"
        )
    git(root, "add", "-A")
    git(root, "commit", "-qm", "HOSTILE changed base proof class")
    binding["activationBaseCommit"] = git(root, "rev-parse", "HEAD")
    promote_preparation_fixture(root)
    model = run_preparation(root, binding, model_only=True)
    assert not model["ok"] and "derived" not in model, model
    assert code in {problem["code"] for problem in model["problems"]}, model


@pytest.mark.parametrize("binding_kind", ["freshness", "promoted-bytes"])
def test_preparation_independent_binding_mutants_are_killed(
    fresh_genesis: Path,
    tmp_path: Path,
    binding_kind: str,
) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    promote_preparation_fixture(root)
    add_preparation_markers(root)
    if binding_kind == "freshness":
        binding["activationFreshnessDigest"] = "0" * 64
        old = "if (freshness.activationFreshnessDigest !== activationFreshnessDigest)"
        new = "if (false) // MUTANT: omit exact-pair freshness digest comparison"
    else:
        path = root / REGISTRY_PATH
        path.write_bytes(path.read_bytes() + b"\n")
        old = "contentDigest(entry.bytes) !== contentDigest(frozen.bytes.get(path))"
        new = "false /* MUTANT: omit promoted-byte binding */"
    before = target_bytes(root)
    refused = run_preparation(root, binding)
    assert not refused["ok"] and refused["wrote"] == [], refused
    assert target_bytes(root) == before
    subject = mutant_subject(tmp_path, [("governance/model/validate.mjs", old, new)])
    bypass = run_preparation(root, binding, subject=subject)
    assert bypass["ok"] and bypass["wrote"], bypass


def test_preparation_cli_requires_explicit_complete_binding(fresh_genesis: Path) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    promote_preparation_fixture(root)
    add_preparation_markers(root)
    arguments = [
        "--base",
        binding["activationBaseCommit"],
        "--bundle",
        binding["candidateBundleSha256"],
        "--freshness-digest",
        binding["activationFreshnessDigest"],
    ]
    command = ["node", str(RENDERER), "--root", str(root)]
    for args in [
        ["--write", *arguments],
        ["--prepare", "--write"],
        ["--prepare", "--write", *arguments, "--ignore-ADV-G90"],
        ["--prepare", "--write", *arguments, "--bundle", binding["candidateBundleSha256"]],
        ["--prepare", "--prepare", "--write", *arguments],
    ]:
        result = subprocess.run(command + args, capture_output=True, text=True)
        assert result.returncode != 0
        assert not (root / "governance/STATE.md").exists()
    for mode in ["--write", "--check"]:
        result = subprocess.run(
            [*command, "--prepare", mode, *arguments], capture_output=True, text=True
        )
        assert result.returncode == 0, result.stderr
        assert "Preparation only" in result.stdout


@pytest.mark.parametrize("member", ["state.json", "source-manifest.json"])
def test_preparation_structural_proof_refuses_rehashed_malformed_base(
    fresh_genesis: Path,
    member: str,
) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    path = "tests/fixtures/governance/candidate/" + member
    value = load_state(root, path)
    value["unreviewed"] = "not a schema member"
    write_state(root, value, path)
    git(root, "add", "-A")
    git(root, "commit", "-qm", "HOSTILE malformed frozen candidate")
    binding["activationBaseCommit"] = git(root, "rev-parse", "HEAD")
    # Bind the actual hostile bytes, so rejection must come from validation,
    # not merely an old expected bundle digest.
    script = """
import fs from 'node:fs'
import {candidateFreezeIdentity,CANDIDATE_PATHS} from './scripts/governance/model/index.mjs'
const bytes=new Map(CANDIDATE_PATHS.map(p=>[p,fs.readFileSync(p)]))
console.log(candidateFreezeIdentity(bytes).bundleSha256)
"""
    binding["candidateBundleSha256"] = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=root,
        text=True,
        capture_output=True,
        check=True,
    ).stdout.strip()
    promote_preparation_fixture(root)
    payload = run_preparation(root, binding, model_only=True)
    assert not payload["ok"] and "derived" not in payload, payload
    assert any("unreviewed" in p["path"] for p in payload["problems"]), payload


def test_preparation_missing_historical_observation_fails_closed(fresh_genesis: Path) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    promote_preparation_fixture(root)
    # Inject an observation failure, without deleting shared Git objects or
    # replacing the production model with a test validator.
    script = """
import {prepareProjectionState} from './scripts/governance/model/index.mjs'
import {createGenesisReader,createCommitReader} from './scripts/governance/genesis/observations.mjs'
let raw='';for await(const chunk of process.stdin)raw+=chunk
const {root,binding}=JSON.parse(raw), read=createGenesisReader(root)
const result=prepareProjectionState(binding,{
  ...createCommitReader(root),
  hasCompleteHistory:()=>true,
  readSnapshot(revision){
    if(revision!==binding.activationBaseCommit)
      throw new Error('required historical object unavailable')
    return read(revision)
  }
})
console.log(JSON.stringify(result))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps({"root": str(root), "binding": binding}),
        text=True,
        capture_output=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    assert not payload["ok"] and "derived" not in payload
    assert any(
        "required historical object unavailable" in p["message"] for p in payload["problems"]
    )


def test_preparation_shallow_history_cannot_prove_no_prior_registry(fresh_genesis: Path) -> None:
    root = fresh_genesis
    binding = preparation_binding(root)
    promote_preparation_fixture(root)
    # Only this isolated clone's shallow metadata changes, never shared objects.
    (root / ".git/shallow").write_text(binding["activationBaseCommit"] + "\n")
    payload = run_preparation(root, binding, model_only=True)
    assert not payload["ok"] and "derived" not in payload
    assert any("non-shallow history" in p["message"] for p in payload["problems"])
