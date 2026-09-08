"""EX-TS-002 / P2-001: the per-surface conformance mechanism, driven hostilely.

A comparator is only worth what it refuses. These tests break each property the
accepted contract names and require the mechanism to notice — including the six
map controls the epoch-4 review assigned, one of which must PASS, because a
comparator that fails everything is as useless as one that fails nothing.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
PROJECTION = REPO / "tests" / "evidence" / "ts6-migration-projection.json"
BASELINE = REPO / "tests" / "evidence" / "ts6-emit-baseline.json"


def _node(script: str) -> str:
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()


def _shape(text: str) -> str:
    return _node(
        "import {declarationShapeSha256} from "
        f"{str(REPO / 'scripts' / 'declaration-shape.mjs')!r};"
        f"process.stdout.write(await declarationShapeSha256({json.dumps(text)}))"
    )


def _v1_sorted_shape(text: str) -> str:
    """The FIRST implementation's canonicalization, kept only to be refuted.

    It tokenized, canonicalized quoting, then sorted the top-level members of
    every `{ ... }` group. A faithful minimal reconstruction of that sort, so
    the regression below can DEMONSTRATE what it accepted rather than merely
    assert that something was once wrong.
    """
    import re as _re

    def canon(s: str) -> str:
        s = _re.sub(r"\s+", " ", s).strip()

        def sort_group(match: _re.Match[str]) -> str:
            members = [m.strip() for m in match.group(1).split(";") if m.strip()]
            return "{ " + " ; ".join(sorted(members)) + " }"

        return _re.sub(r"\{([^{}]*)\}", sort_group, s)

    return canon(text)


def _compare_map(
    before: dict[str, Any], after: dict[str, Any], strict: bool, scope: str | None = None
) -> list[str]:
    out = _node(
        "import {compareMap} from "
        f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
        f"process.stdout.write(JSON.stringify(compareMap('m', {json.dumps(before)},"
        f" {json.dumps(after)}, {{strictLines: {'true' if strict else 'false'},"
        f" scope: {json.dumps(scope)}}})))"
    )
    problems: list[str] = json.loads(out)
    return problems


def _projection(text: str, map_path: str = "packages/x/dist/index.js.map") -> dict[str, Any]:
    out = _node(
        "import {mapProjection} from "
        f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
        f"process.stdout.write(JSON.stringify(mapProjection({json.dumps(text)}, 'probe',"
        f" {json.dumps(map_path)}, {str(REPO)!r})))"
    )
    parsed: dict[str, Any] = json.loads(out)
    return parsed


# --- declarations: what may differ, and what may not ------------------------

ADMISSIBLE = [
    ("string-literal quote delimiter", 'declare const a: "x";', "declare const a: 'x';"),
    (
        "indentation, blank lines and trailing whitespace",
        "type T = {\n\n    a: 1;   \n\n};",
        "type T = {\n  a: 1;\n};",
    ),
]

MUST_FAIL = [
    (
        "exported symbol removed",
        "export declare const a: 1;\nexport declare const b: 2;",
        "export declare const a: 1;",
    ),
    ("member added", "type T = { a: 1 };", "type T = { a: 1; b: 2 };"),
    ("literal value changed", 'declare const a: "x";', 'declare const a: "y";'),
    ("type changed", "declare const a: string;", "declare const a: number;"),
    ("optionality changed", "type T = { a: 1 };", "type T = { a?: 1 };"),
    ("readonly changed", "type T = { a: 1 };", "type T = { readonly a: 1 };"),
    (
        "generic constraint changed",
        "declare function f<T extends A>(x: T): void;",
        "declare function f<T extends B>(x: T): void;",
    ),
    ("module specifier changed", "export { a } from './x.js';", "export { a } from './y.js';"),
    (
        "signature parameter added",
        "declare function f(a: 1): void;",
        "declare function f(a: 1, b: 2): void;",
    ),
    (
        "overload removed",
        "declare function f(a: 1): void;\ndeclare function f(a: 2): void;",
        "declare function f(a: 1): void;",
    ),
    ("union membership changed", "type T = A | B;", "type T = A | C;"),
    ("intersection membership changed", "type T = A & B;", "type T = A & C;"),
    (
        "parameter ORDER changed",
        "declare function f(a: 1, b: 2): void;",
        "declare function f(b: 2, a: 1): void;",
    ),
    ("tuple ORDER changed", "type T = [A, B];", "type T = [B, A];"),
    # P2-A. TypeScript resolves overloads by DECLARATION ORDER — first match
    # wins — so each of these pairs denotes a different type. The first
    # comparator sorted members inside every brace group and reported them
    # equal.
    (
        "interface method overload ORDER changed",
        "interface F {\n  f(x: string): 1;\n  f(x: unknown): 2;\n}",
        "interface F {\n  f(x: unknown): 2;\n  f(x: string): 1;\n}",
    ),
    (
        "interface CALL signature overload ORDER changed",
        "interface F {\n  (x: string): 1;\n  (x: unknown): 2;\n}",
        "interface F {\n  (x: unknown): 2;\n  (x: string): 1;\n}",
    ),
    (
        "class method overload ORDER changed",
        "declare class C {\n  m(x: string): 1;\n  m(x: unknown): 2;\n}",
        "declare class C {\n  m(x: unknown): 2;\n  m(x: string): 1;\n}",
    ),
    (
        "namespace function overload ORDER changed",
        "declare namespace N {\n  function f(x: string): 1;\n  function f(x: unknown): 2;\n}",
        "declare namespace N {\n  function f(x: unknown): 2;\n  function f(x: string): 1;\n}",
    ),
    (
        "enum member ORDER changed, which moves auto-assigned values",
        "declare enum E {\n  A,\n  B,\n}",
        "declare enum E {\n  B,\n  A,\n}",
    ),
    (
        "object type property ORDER changed",
        "type T = { a: 1; b: 2 };",
        "type T = { b: 2; a: 1 };",
    ),
]


@pytest.mark.parametrize(("label", "before", "after"), ADMISSIBLE, ids=[c[0] for c in ADMISSIBLE])
def test_a_serializer_difference_is_admissible(label: str, before: str, after: str) -> None:
    """The compiler owns presentation; a consumer cannot depend on it."""
    assert before != after, f"{label}: the two inputs are identical, so nothing is proved"
    assert _shape(before) == _shape(after), label


@pytest.mark.parametrize(("label", "before", "after"), MUST_FAIL, ids=[c[0] for c in MUST_FAIL])
def test_a_semantic_declaration_change_is_refused(label: str, before: str, after: str) -> None:
    """MUT-TS-EMIT-002. Each of these changes what a consumer sees."""
    assert before != after, f"{label}: the two inputs are identical, so nothing is proved"
    assert _shape(before) != _shape(after), label


def test_the_old_comparator_accepted_the_overload_reordering() -> None:
    """The regression, demonstrated rather than asserted.

    P2-A was not a hypothetical: the first comparator canonicalized by sorting
    the members of every brace group, so an interface whose overloads had been
    reordered — a genuinely different type — came out identical. This runs that
    canonicalization and the current one over the same pair, and requires them
    to disagree.
    """
    before = "interface F {\n  f(x: string): 1;\n  f(x: unknown): 2;\n}"
    after = "interface F {\n  f(x: unknown): 2;\n  f(x: string): 1;\n}"
    assert before != after

    # What the first implementation did: equal, so the mutation passed.
    assert _v1_sorted_shape(before) == _v1_sorted_shape(after), (
        "the reconstruction of the old sorter does not reproduce the defect, so this "
        "regression proves nothing"
    )

    # What the current one does.
    assert _shape(before) != _shape(after)


def test_ordering_is_reconciled_at_capture_not_by_the_comparator() -> None:
    """P2-A control 2. The member-order differences the cutover really produces
    are handled by asking TypeScript 6 for TypeScript 7's ordering, not by a
    comparator that reorders anything.

    So the comparator must contain no sort at all, and the projection must
    record the mechanism that replaced it.
    """
    source = (REPO / "scripts" / "declaration-shape.mjs").read_text()
    assert ".sort(" not in source and "sort()" not in source, (
        "the comparator sorts something; ordering must be reconciled at capture"
    )

    projection = json.loads(
        (REPO / "tests" / "evidence" / "ts6-migration-projection-v2.json").read_text()
    )
    assert projection["declarationOrdering"]["mechanism"] == "--stableTypeOrdering"
    assert projection["schemaVersion"] == 2


def test_stable_type_ordering_never_becomes_repository_configuration() -> None:
    """A migration-analysis projection only. In a tsconfig or a build script it
    would be a compiler setting nobody reviewed."""
    tracked = subprocess.run(
        ["git", "ls-files", "*tsconfig*.json", "*package.json"],
        capture_output=True,
        text=True,
        cwd=REPO,
        check=True,
    ).stdout.split()
    for rel in tracked:
        assert "stableTypeOrdering" not in (REPO / rel).read_text(), rel


def test_the_comparator_is_not_a_pattern_normalizer() -> None:
    """The shape is derived from the file's own lexical and nesting structure.

    A normalizer accumulates a rule per observed difference and eventually
    accepts everything. This asserts the implementation contains no list of
    TypeScript-6-to-7 rewrite patterns to grow.
    """
    source = (REPO / "scripts" / "declaration-shape.mjs").read_text()
    assert "6.0.3" not in source and "7.0.2" not in source, (
        "the comparator must not know which compiler versions it is comparing"
    )
    # Presentation comes from the repository's existing parser-backed formatter,
    # not from a hand-written tokenizer that could reorder something.
    assert "from 'prettier'" in source


# --- P2-001: the six assigned map controls ----------------------------------

BASE_MAP = json.dumps(
    {
        "version": 3,
        "file": "index.js",
        "sources": ["../src/index.ts"],
        "names": [],
        # three generated lines, mapping to original lines 0, 1, 2
        "mappings": "AAAA;AACA;AACA",
    }
)


def _mutate_projection(**changes: Any) -> dict[str, Any]:
    projected = _projection(BASE_MAP)
    projected.update(changes)
    return projected


def test_control_1_a_missing_map_fails() -> None:
    """Absence is detected by the differential, which requires a baseline entry
    for every mapped surface and refuses when one vanishes."""
    before = _projection(BASE_MAP)
    gone = {**before, "sources": [], "effectiveSources": [], "coverage": {}}
    problems = _compare_map(before, gone, strict=True)
    assert problems, "a map that stopped mapping its source was accepted"
    assert any("no longer mapped" in p for p in problems), problems


def test_control_2_a_malformed_map_fails() -> None:
    """Validity comes from Node's own reader, not from an opinion here."""
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {mapProjection} from "
            f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
            'mapProjection(\'{"version":3,"sources":["a.ts"],"mappings":"@@@@"}\', \'bad\')',
        ],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode != 0, "a malformed mappings string was accepted"
    assert "invalid VLQ" in result.stdout + result.stderr


def test_control_3_same_sources_but_wrong_source_line_fails() -> None:
    """The control that structure alone cannot catch.

    Same file, same `sources[]`, same segment count, valid Source Map v3 — and
    generated line 1 now claims to come from original line 9.
    """
    before = _projection(BASE_MAP)
    after = _projection(BASE_MAP)
    after["attribution"] = [
        entry if not entry.startswith("1|") else "1|0|9" for entry in after["attribution"]
    ]
    after["coverage"] = {"../src/index.ts": [0, 2, 9]}
    assert after["attribution"] != before["attribution"], "the mutation changed nothing"

    problems = _compare_map(before, after, strict=True)
    assert any("no longer attributes to" in p for p in problems), problems


def test_control_4_wrong_source_file_fails() -> None:
    before = _projection(BASE_MAP)
    after = _projection(BASE_MAP.replace("../src/index.ts", "../src/other.ts"))
    assert after["effectiveSources"] != before["effectiveSources"], "the mutation changed nothing"
    problems = _compare_map(before, after, strict=True)
    assert any("no longer mapped" in p or "new effective source" in p for p in problems), problems


def test_control_5_lost_source_line_coverage_fails() -> None:
    """Checked for declaration maps too, where generated positions may move and
    coverage is the only thing left to hold on to."""
    before = _projection(BASE_MAP)
    after = _projection(BASE_MAP)
    after["coverage"] = {"../src/index.ts": [0, 2]}
    after["attribution"] = [e for e in after["attribution"] if not e.startswith("1|")]
    problems = _compare_map(before, after, strict=False)
    assert any("lost source-line coverage" in p for p in problems), problems


def test_control_6_column_refinement_preserving_file_and_line_passes() -> None:
    """The control that must PASS.

    TypeScript 7 may split a segment or refine a column. Every generated line
    still resolves to the same original file and line, so nothing a consumer
    depends on has moved — and a comparator that refused this would block the
    cutover on the compiler doing its job.
    """
    before = _projection(BASE_MAP)
    refined = json.dumps(
        {
            "version": 3,
            "file": "index.js",
            "sources": ["../src/index.ts"],
            "names": [],
            # same three lines and original lines; extra segments and columns
            "mappings": "AAAA,CAAC;AACA,EAAE;AACA,CAAC",
        }
    )
    after = _projection(refined)
    assert after["mappedSegments"] > before["mappedSegments"], "the refinement added no segments"

    assert _compare_map(before, after, strict=True) == []


def test_the_vlq_decoder_agrees_with_node() -> None:
    """The decoder is cross-checked against `node:module` on every map it reads.

    Enumeration and validity are different questions, so there are two readers;
    this is what stops the second from quietly disagreeing with the first.
    """
    source = (REPO / "scripts" / "source-map-shape.mjs").read_text()
    assert "findEntry" in source and "crossCheck" in source
    # and it really runs: a projection of a real map exercises it
    assert _projection(BASE_MAP)["mappedSegments"] == 3


# --- MUT-TS-EMIT-004: the frozen evidence -----------------------------------


def test_the_migration_projection_matches_its_own_seal() -> None:
    document = json.loads(PROJECTION.read_text())
    body = {k: v for k, v in document.items() if k != "manifestSha256"}
    import hashlib

    recomputed = hashlib.sha256((json.dumps(body, indent=2) + "\n").encode()).hexdigest()
    assert recomputed == document["manifestSha256"]


def test_the_projection_and_the_raw_baseline_describe_the_same_capture() -> None:
    """Two artifacts, one moment. If they drifted apart, the structural half
    could be recaptured under a different compiler than the byte half."""
    projection = json.loads(PROJECTION.read_text())
    baseline = json.loads(BASELINE.read_text())
    assert projection["compiler"] == baseline["compiler"]
    assert projection["capturedAtHead"] == baseline["capturedAtHead"]
    assert projection["compiler"]["version"] == "6.0.3"


def test_the_projection_covers_every_declaration_and_map_the_baseline_recorded() -> None:
    projection = json.loads(PROJECTION.read_text())
    baseline = json.loads(BASELINE.read_text())
    for member, record in baseline["members"].items():
        declarations = {f for f in record["outputs"] if f.endswith(".d.ts")}
        maps = {f for f in record["outputs"] if f.endswith(".map")}
        assert set(projection["members"][member]["declarations"]) == declarations, member
        assert set(projection["members"][member]["maps"]) == maps, member


# --- P2-B: effective source identity, and a strict per-line relation --------
#
# ECMA-426 resolves a source through `sourceRoot` and the map's own location.
# Comparing raw `sources[]` compares a SPELLING, not an identity: a map can keep
# `sources: ["index.ts"]` and identical mappings, change `sourceRoot`, and point
# somewhere else entirely while every raw comparison passes.

ROOTED_MAP = json.dumps(
    {
        "version": 3,
        "file": "index.js",
        "sourceRoot": "../src",
        "sources": ["index.ts"],
        "names": [],
        "mappings": "AAAA;AACA;AACA",
    }
)


def test_control_7_a_sourceroot_that_redirects_attribution_fails() -> None:
    """Same `sources[]`, same `mappings`, different `sourceRoot`.

    Nothing a raw comparison looks at has changed, and the map now attributes
    generated code to a different original file.
    """
    before = _projection(ROOTED_MAP, "packages/x/dist/index.js.map")
    redirected = ROOTED_MAP.replace('"sourceRoot": "../src"', '"sourceRoot": "../../other/src"')
    assert redirected != ROOTED_MAP, "the mutation changed nothing"
    after = _projection(redirected, "packages/x/dist/index.js.map")

    assert after["sources"] == before["sources"], "sources[] must be unchanged for this control"
    assert after["effectiveSources"] != before["effectiveSources"]

    problems = _compare_map(before, after, strict=True, scope="packages/x/")
    assert any("no longer mapped" in p or "new effective source" in p for p in problems), problems
    assert any("outside the expected scope" in p for p in problems), problems


def test_control_8_a_different_sourceroot_spelling_resolving_the_same_passes() -> None:
    """The control that must PASS.

    `sourceRoot: "../src"` with `sources: ["index.ts"]` and
    `sourceRoot: ""` with `sources: ["../src/index.ts"]` denote the same file.
    Failing on the spelling would block a cutover on nothing.
    """
    before = _projection(ROOTED_MAP, "packages/x/dist/index.js.map")
    respelled = json.dumps(
        {
            "version": 3,
            "file": "index.js",
            "sourceRoot": "",
            "sources": ["../src/index.ts"],
            "names": [],
            "mappings": "AAAA;AACA;AACA",
        }
    )
    after = _projection(respelled, "packages/x/dist/index.js.map")

    assert after["sources"] != before["sources"], (
        "the spellings are identical, so nothing is proved"
    )
    assert after["effectiveSources"] == before["effectiveSources"]
    assert _compare_map(before, after, strict=True, scope="packages/x/") == []


def test_control_9_an_added_divergent_attribution_on_the_same_line_fails() -> None:
    """The control a one-way subset comparison would miss.

    The old attribution is still there — so "every TS6 pair survives" holds —
    and the generated line has ALSO acquired a segment resolving to a different
    original line. Containment passes it; set equality does not.
    """
    before = _projection(BASE_MAP)
    after = _projection(BASE_MAP)
    # generated line 1 keeps its original attribution and gains another
    after["attribution"] = sorted({*after["attribution"], "1|0|7"})
    after["coverage"] = {"../src/index.ts": [0, 1, 2, 7]}
    assert set(before["attribution"]) < set(after["attribution"]), (
        "the mutation must be a strict superset, or it is not testing containment"
    )

    problems = _compare_map(before, after, strict=True)
    assert any("different origin rather than a refinement" in p for p in problems), problems


def test_control_10_a_refined_segment_on_the_same_line_passes() -> None:
    """The other control that must PASS.

    An extra segment on the same generated line resolving to the SAME effective
    file and original line is column refinement, which the new compiler is
    allowed to do.
    """
    before = _projection(BASE_MAP)
    refined = json.dumps(
        {
            "version": 3,
            "file": "index.js",
            "sources": ["../src/index.ts"],
            "names": [],
            # line 1 gains a second segment at a later column, same original line
            "mappings": "AAAA;AACA,EAAA;AACA",
        }
    )
    after = _projection(refined)
    assert after["mappedSegments"] > before["mappedSegments"], "the refinement added no segments"
    assert set(after["attribution"]) == set(before["attribution"]), (
        "the refinement must not change the (line -> file, line) relation"
    )

    assert _compare_map(before, after, strict=True) == []


# --- projection provenance --------------------------------------------------

V2 = REPO / "tests" / "evidence" / "ts6-migration-projection-v2.json"
V1 = REPO / "tests" / "evidence" / "ts6-migration-projection.json"


def _differential_with(projection: dict[str, Any]) -> list[str]:
    """Run the differential against a doctored projection, without rebuilding.

    Written to a file rather than passed as an argument: the projection is well
    over a megabyte and argv is not.
    """
    import tempfile

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        json.dump(projection, handle, indent=2)
        handle.write("\n")
        target = handle.name
    out = _node(
        "import {differential} from "
        f"{str(REPO / 'scripts' / 'emit-conformance.mjs')!r};"
        "import {readFileSync} from 'node:fs';"
        f"const baseline = JSON.parse(readFileSync({str(BASELINE)!r}, 'utf8'));"
        f"const projection = JSON.parse(readFileSync({target!r}, 'utf8'));"
        "process.stdout.write(JSON.stringify("
        "differential(baseline, projection, {members:{},generators:{}}, {members:{}})))"
    )
    Path(target).unlink()
    problems: list[str] = json.loads(out)
    return problems


def test_the_v1_projection_is_historical_and_not_comparison_authority() -> None:
    """It stays byte-identical, and it is refused as authority: its declaration
    shapes were canonicalized by sorting members, which erases overload order."""
    assert V1.exists(), "the first projection must remain as historical evidence"
    v1 = json.loads(V1.read_text())
    assert v1["schemaVersion"] == 1
    problems = _differential_with(v1)
    assert any("requires v2" in p for p in problems), problems


def test_the_v2_projection_records_its_provenance() -> None:
    v2 = json.loads(V2.read_text())
    baseline = json.loads(BASELINE.read_text())
    assert v2["schemaVersion"] == 2
    assert v2["compiler"]["version"] == "6.0.3"
    assert v2["boundTo"]["rawBaselineManifestSha256"] == baseline["manifestSha256"]
    assert v2["boundTo"]["rawBaselineCapturedAtHead"] == baseline["capturedAtHead"]
    assert v2["declarationOrdering"]["mechanism"] == "--stableTypeOrdering"
    assert "HISTORICAL" in v2["supersedes"]["status"]
    assert v2["supersedes"]["path"].endswith("ts6-migration-projection.json")


@pytest.mark.parametrize(
    ("label", "change", "expected"),
    [
        (
            "edited without updating the seal",
            {"note": "tampered"},
            "does not match its own seal",
        ),
        (
            "rebound to another compiler",
            {"compiler": {"package": "typescript", "version": "7.0.2", "tscReported": "x"}},
            "must describe the same compiler",
        ),
        (
            "rebound to another source state",
            {"capturedAtHead": "0" * 40},
            "bound to different commits",
        ),
        (
            "rebound to another raw baseline",
            {"boundTo": {"rawBaselineManifestSha256": "0" * 64, "rawBaselineCapturedAtHead": "x"}},
            "bound to a different raw baseline",
        ),
        (
            "a TypeScript 7 projection substituted",
            {"declarationOrdering": {"mechanism": "none"}},
            "does not record the stable-ordering mechanism",
        ),
    ],
)
def test_a_doctored_projection_is_refused(
    label: str, change: dict[str, Any], expected: str
) -> None:
    """MUT-TS-EMIT-004, on the superseding projection."""
    doctored = json.loads(V2.read_text())
    for key, value in change.items():
        doctored[key] = value
    assert doctored != json.loads(V2.read_text()), f"{label}: the mutation changed nothing"

    problems = _differential_with(doctored)
    assert any(expected in p for p in problems), (label, problems[:4])
