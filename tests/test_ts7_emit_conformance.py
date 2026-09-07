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
        f"process.stdout.write(declarationShapeSha256({json.dumps(text)}))"
    )


def _compare_map(before: dict[str, Any], after: dict[str, Any], strict: bool) -> list[str]:
    out = _node(
        "import {compareMap} from "
        f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
        f"process.stdout.write(JSON.stringify(compareMap('m', {json.dumps(before)},"
        f" {json.dumps(after)}, {{strictLines: {'true' if strict else 'false'}}})))"
    )
    problems: list[str] = json.loads(out)
    return problems


def _projection(text: str) -> dict[str, Any]:
    out = _node(
        "import {mapProjection} from "
        f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
        f"process.stdout.write(JSON.stringify(mapProjection({json.dumps(text)}, 'probe')))"
    )
    parsed: dict[str, Any] = json.loads(out)
    return parsed


# --- declarations: what may differ, and what may not ------------------------

ADMISSIBLE = [
    ("string-literal quote delimiter", 'declare const a: "x";', "declare const a: 'x';"),
    ("object member ordering", "type T = { a: 1; b: 2 };", "type T = { b: 2; a: 1 };"),
    ("indentation and line breaks", "type T = {\n  a: 1;\n};", "type T = { a: 1; };"),
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


def test_the_comparator_is_not_a_pattern_normalizer() -> None:
    """The shape is derived from the file's own lexical and nesting structure.

    A normalizer accumulates a rule per observed difference and eventually
    accepts everything. This asserts the implementation contains no list of
    TypeScript-6-to-7 rewrite patterns to grow.
    """
    source = (REPO / "scripts" / "declaration-shape.mjs").read_text()
    assert "replace(/" not in source.split("function decodeStringLiteral")[0]
    assert "6.0.3" not in source and "7.0.2" not in source, (
        "the comparator must not know which compiler versions it is comparing"
    )


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
    problems = _compare_map(before, {**before, "sources": [], "coverage": {}}, strict=True)
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
    after = _projection(BASE_MAP)
    after["sources"] = ["../src/other.ts"]
    after["coverage"] = {"../src/other.ts": [0, 1, 2]}
    problems = _compare_map(before, after, strict=True)
    assert any("no longer mapped" in p or "new source" in p for p in problems), problems


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
