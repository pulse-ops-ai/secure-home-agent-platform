"""EX-TS-002 / P2-001: the per-surface conformance mechanism, driven hostilely.

A comparator is only worth what it refuses. These tests break each property the
accepted contract names and require the mechanism to notice — including the six
map controls the epoch-4 review assigned, one of which must PASS, because a
comparator that fails everything is as useless as one that fails nothing.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from collections.abc import Callable
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
    before: dict[str, Any],
    after: dict[str, Any],
    strict: bool,
    scope: str | None = None,
    expected_file: str | None = None,
) -> list[str]:
    out = _node(
        "import {compareMap} from "
        f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
        f"process.stdout.write(JSON.stringify(compareMap('m', {json.dumps(before)},"
        f" {json.dumps(after)}, {{strictLines: {'true' if strict else 'false'},"
        f" scope: {json.dumps(scope)},"
        f" expectedFile: {json.dumps(expected_file) if expected_file is not None else 'undefined'}"
        f"}})))"
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


# --- authoring real map BYTES ------------------------------------------------
#
# The controls below must drive the mechanism from the bytes a compiler would
# emit, not from the decoded projection. Editing `attribution` after
# `mapProjection()` returned tests the comparator against a hand-written record
# and leaves the DECODER — the thing that turns bytes into that record —
# unexercised, which is exactly where a source-index defect would live.

_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def _vlq(value: int) -> str:
    """One Base64 VLQ field, as Source Map v3 defines it."""
    bits = (-value << 1) | 1 if value < 0 else value << 1
    out = ""
    while True:
        digit = bits & 31
        bits >>= 5
        if bits:
            digit |= 32
        out += _B64[digit]
        if not bits:
            return out


def _mappings(lines: list[list[tuple[int, int, int, int]]]) -> str:
    """Encode ABSOLUTE ``(genCol, srcIdx, srcLine, srcCol)`` segments per line.

    Absolute in, delta out: the caller says what each segment means and this
    does the differencing, so a control reads as the attribution it is asserting
    rather than as a VLQ puzzle.
    """
    out = []
    src_idx = src_line = src_col = 0
    for segments in lines:
        gen_col = 0
        parts = []
        for seg_gen_col, seg_src_idx, seg_src_line, seg_src_col in segments:
            parts.append(
                _vlq(seg_gen_col - gen_col)
                + _vlq(seg_src_idx - src_idx)
                + _vlq(seg_src_line - src_line)
                + _vlq(seg_src_col - src_col)
            )
            gen_col, src_idx, src_line, src_col = (
                seg_gen_col,
                seg_src_idx,
                seg_src_line,
                seg_src_col,
            )
        out.append(",".join(parts))
    return ";".join(out)


def _map_bytes(
    *,
    file: str = "index.js",
    sources: list[str] | None = None,
    lines: list[list[tuple[int, int, int, int]]],
    source_root: str | None = None,
) -> str:
    payload: dict[str, Any] = {
        "version": 3,
        "file": file,
        "sources": sources if sources is not None else ["../src/index.ts"],
        "names": [],
        "mappings": _mappings(lines),
    }
    if source_root is not None:
        payload["sourceRoot"] = source_root
    return json.dumps(payload)


#: The three-line subject the byte-driven controls start from: generated lines
#: 0, 1, 2 resolving to original lines 0, 1, 2 of one source.
BASE_LINES: list[list[tuple[int, int, int, int]]] = [
    [(0, 0, 0, 0)],
    [(0, 0, 1, 0)],
    [(0, 0, 2, 0)],
]


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


# --- P2-001 / MUT-TS-EMIT-003: the map controls, driven from BYTES ----------
#
# The epoch-4 review assigned six controls, one of which must PASS. They are
# driven from map bytes and from the emitted FILE SET, because those are the
# only inputs a compiler actually produces. A control that edits the decoded
# projection proves something about the comparator and nothing about the
# decoder that built the record it compares.

#: A member-shaped subject, so `scope` and the effective-source resolution are
#: exercised rather than defaulted.
PROBE_MEMBER = "packages/probe"
PROBE_MAP = f"{PROBE_MEMBER}/dist/index.js.map"
PROBE_SCOPE = f"{PROBE_MEMBER}/"
BASE_BYTES = _map_bytes(lines=BASE_LINES)

#: Kept as the original hand-written document, so the encoder above is checked
#: against a mappings string nobody generated with it.
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


def test_the_byte_authoring_helper_reproduces_the_hand_written_document() -> None:
    """Otherwise every control below is written in a private dialect."""
    assert json.loads(BASE_BYTES)["mappings"] == json.loads(BASE_MAP)["mappings"]


def _seal(document: dict[str, Any]) -> dict[str, Any]:
    out = _node(
        "import {seal} from "
        f"{str(REPO / 'scripts' / 'emit-conformance.mjs')!r};"
        f"process.stdout.write(JSON.stringify(seal({json.dumps(document)})))"
    )
    sealed: dict[str, Any] = json.loads(out)
    return sealed


def _differential(
    baseline: dict[str, Any],
    projection: dict[str, Any],
    current: dict[str, Any],
    current_projection: dict[str, Any],
) -> list[str]:
    out = _node(
        "import {differential} from "
        f"{str(REPO / 'scripts' / 'emit-conformance.mjs')!r};"
        "process.stdout.write(JSON.stringify(differential("
        f"{json.dumps(baseline)}, {json.dumps(projection)},"
        f" {json.dumps(current)}, {json.dumps(current_projection)})))"
    )
    problems: list[str] = json.loads(out)
    return problems


def _probe_documents(
    before: dict[str, str], after: dict[str, str]
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Four documents the REAL differential consumes, for one map-only member.

    `before` and `after` are the emitted map FILE SETS, given as bytes. Every
    projection in them is produced by the real `mapProjection`, so a control
    that removes a file or rewrites mappings is changing the compiler's output,
    which is the input the differential is designed to read.
    """
    head = "0" * 40
    compiler = {"package": "typescript", "version": "6.0.3", "tscReported": "Version 6.0.3"}

    def outputs(maps: dict[str, str]) -> dict[str, Any]:
        return {
            rel: {
                "kind": "sourceMap",
                "claimed": True,
                "sha256": hashlib.sha256(text.encode()).hexdigest(),
            }
            for rel, text in maps.items()
        }

    def member(maps: dict[str, str]) -> dict[str, Any]:
        return {
            "config": "tsconfig.build.json",
            "build": "tsc -b",
            "surfaces": ["sourceMap"],
            "outputs": outputs(maps),
        }

    def projected(maps: dict[str, str]) -> dict[str, Any]:
        return {
            "declarations": {},
            "maps": {rel: _projection(text, rel) for rel, text in maps.items()},
            "scope": PROBE_SCOPE,
        }

    baseline = _seal(
        {
            "schemaVersion": 1,
            "proof": "probe",
            "capturedAtHead": head,
            "compiler": compiler,
            "normalization": {},
            "members": {PROBE_MEMBER: member(before)},
            "generators": {},
        }
    )
    projection = _seal(
        {
            "schemaVersion": 2,
            "proof": "probe",
            "capturedAtHead": head,
            "compiler": compiler,
            "declarationOrdering": {"mechanism": "--stableTypeOrdering"},
            "boundTo": {
                "rawBaselineManifestSha256": baseline["manifestSha256"],
                "rawBaselineCapturedAtHead": head,
            },
            "members": {PROBE_MEMBER: projected(before)},
        }
    )
    current = {
        "schemaVersion": 1,
        "capturedAtHead": head,
        "compiler": compiler,
        "members": {PROBE_MEMBER: member(after)},
        "generators": {},
    }
    current_projection = {
        "schemaVersion": 2,
        "members": {PROBE_MEMBER: projected(after)},
    }
    return baseline, projection, current, current_projection


def test_the_probe_documents_pass_when_nothing_moved() -> None:
    """The control every hostile case below is measured against. Without it, a
    scaffold that fails for its own reasons would look like a detection."""
    assert _differential(*_probe_documents({PROBE_MAP: BASE_BYTES}, {PROBE_MAP: BASE_BYTES})) == []


def test_control_1_a_map_absent_from_the_current_file_set_fails() -> None:
    """Absence is a FILE-SET fact, so the file leaves the current emit."""
    problems = _differential(*_probe_documents({PROBE_MAP: BASE_BYTES}, {}))
    assert any("was mapped under the baseline compiler and is absent now" in p for p in problems), (
        problems
    )


def test_control_2_malformed_mapping_bytes_fail() -> None:
    """Validity comes from Node's own reader, not from an opinion here."""
    broken = json.dumps(
        {"version": 3, "file": "index.js", "sources": ["../src/index.ts"], "mappings": "@@@@"}
    )
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {mapProjection} from "
            f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
            f"mapProjection({json.dumps(broken)}, 'bad')",
        ],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert result.returncode != 0, "a malformed mappings string was accepted"
    assert "invalid VLQ" in result.stdout + result.stderr


def test_control_3_mapping_bytes_that_move_an_original_line_fail() -> None:
    """The control that structure alone cannot catch.

    Same file, same `sources[]`, same segment count, valid Source Map v3 — and
    the mapping BYTES now say generated line 1 came from original line 9.
    """
    moved = _map_bytes(lines=[[(0, 0, 0, 0)], [(0, 0, 9, 0)], [(0, 0, 2, 0)]])
    assert moved != BASE_BYTES, "the mutation changed no map bytes"
    before = _projection(BASE_BYTES, PROBE_MAP)
    after = _projection(moved, PROBE_MAP)
    assert after["mappedSegments"] == before["mappedSegments"], "only the ORIGIN may differ here"

    problems = _compare_map(before, after, strict=True, scope=PROBE_SCOPE)
    assert any("no longer attributes to" in p for p in problems), problems


#: Two sources, so a generated line can change which FILE it came from without
#: `sources[]` moving at all.
TWO_SOURCES = ["../src/first.ts", "../src/second.ts"]
TWO_SOURCE_BYTES = _map_bytes(
    sources=TWO_SOURCES,
    lines=[[(0, 0, 0, 0)], [(0, 1, 0, 0)], [(0, 0, 5, 0)], [(0, 1, 7, 0)]],
)


def test_control_4_mapping_bytes_that_switch_the_original_file_fail() -> None:
    """`sources[]` is untouched; only the source INDEX in the mappings moves.

    This is the half a raw `sources[]` comparison cannot see at all, and the
    half the decoder's `srcIdx` is solely responsible for.
    """
    switched = _map_bytes(
        sources=TWO_SOURCES,
        lines=[[(0, 0, 0, 0)], [(0, 0, 0, 0)], [(0, 0, 5, 0)], [(0, 1, 7, 0)]],
    )
    assert switched != TWO_SOURCE_BYTES, "the mutation changed no map bytes"
    before = _projection(TWO_SOURCE_BYTES, PROBE_MAP)
    after = _projection(switched, PROBE_MAP)
    assert after["sources"] == before["sources"], "sources[] must be unchanged for this control"
    assert after["effectiveSources"] == before["effectiveSources"]

    problems = _compare_map(before, after, strict=True, scope=PROBE_SCOPE)
    assert any("no longer attributes to" in p and "second.ts" in p for p in problems), problems


def test_control_4b_a_changed_sources_spelling_that_names_another_file_fails() -> None:
    """The other half: the mappings are identical and `sources[]` moved."""
    other = _map_bytes(sources=["../src/other.ts"], lines=BASE_LINES)
    before = _projection(BASE_BYTES, PROBE_MAP)
    after = _projection(other, PROBE_MAP)
    assert after["effectiveSources"] != before["effectiveSources"], "the mutation changed nothing"
    problems = _compare_map(before, after, strict=True, scope=PROBE_SCOPE)
    assert any("no longer mapped" in p or "new effective source" in p for p in problems), problems


def test_control_5_mapping_bytes_that_lose_source_line_coverage_fail() -> None:
    """Checked for declaration maps too, where generated positions may move and
    coverage is the only thing left to hold on to."""
    thinned = _map_bytes(lines=[[(0, 0, 0, 0)], [], [(0, 0, 2, 0)]])
    assert thinned != BASE_BYTES, "the mutation changed no map bytes"
    before = _projection(BASE_BYTES, PROBE_MAP)
    after = _projection(thinned, PROBE_MAP)
    assert after["mappedSegments"] < before["mappedSegments"], "the segment was not dropped"

    problems = _compare_map(before, after, strict=False, scope=PROBE_SCOPE)
    assert any("lost source-line coverage" in p for p in problems), problems


def test_control_6_column_refinement_preserving_file_and_line_passes() -> None:
    """The control that must PASS.

    TypeScript 7 may split a segment or refine a column. Every generated line
    still resolves to the same original file and line, so nothing a consumer
    depends on has moved — and a comparator that refused this would block the
    cutover on the compiler doing its job.
    """
    refined = _map_bytes(
        lines=[
            [(0, 0, 0, 0), (2, 0, 0, 2)],
            [(0, 0, 1, 0), (4, 0, 1, 4)],
            [(0, 0, 2, 0), (2, 0, 2, 2)],
        ]
    )
    before = _projection(BASE_BYTES, PROBE_MAP)
    after = _projection(refined, PROBE_MAP)
    assert after["mappedSegments"] > before["mappedSegments"], "the refinement added no segments"

    assert _compare_map(before, after, strict=True, scope=PROBE_SCOPE) == []


# --- the decoder itself, cross-checked against node:module -------------------
#
# Enumeration and validity are different questions, so there are two readers of
# the same bytes. `findEntry` answers about a position you already know; the
# projection needs to know which positions exist at all. The cross-check is what
# stops the second reader from quietly disagreeing with the first — and it is
# only worth what it refuses, so it is driven by CORRUPTING the decoder.

SHAPE_PROBE = REPO / "node_modules" / ".source-map-shape-probe"


def _shape_probe(edit: Callable[[str], str] | None = None) -> Path:
    """A copy of the projection module, mutable without touching the repository.

    Under `node_modules/`, which is gitignored and skipped by every scanner
    here, so an interrupted run cannot leave a corrupted decoder in the tree.
    """
    if SHAPE_PROBE.exists():
        shutil.rmtree(SHAPE_PROBE)
    SHAPE_PROBE.mkdir(parents=True)
    text = (REPO / "scripts" / "source-map-shape.mjs").read_text()
    if edit is not None:
        mutated = edit(text)
        assert mutated != text, "the mutation did not change the subject bytes"
        text = mutated
    (SHAPE_PROBE / "source-map-shape.mjs").write_text(text)
    return SHAPE_PROBE


def _probe_project(probe: Path, text: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {mapProjection} from "
            f"{str(probe / 'source-map-shape.mjs')!r};"
            f"process.stdout.write(JSON.stringify(mapProjection({json.dumps(text)}, 'probe',"
            f" {json.dumps(PROBE_MAP)}, {str(REPO)!r})))",
        ],
        capture_output=True,
        text=True,
        cwd=REPO,
    )


#: Losing the source-index delta. Every segment then claims source 0 — always a
#: VALID index, so this cannot be caught by the absent-index guard, and line and
#: column are untouched, so it cannot be caught by the line/column comparison.
LOSE_SOURCE_INDEX = ("        srcIdx += values[1]", "        srcIdx += 0")
MOVE_ORIGINAL_LINE = ("        srcLine += values[2]", "        srcLine += values[2] + 1")
OLD_CROSS_CHECK = (
    "      theirs.originalSource === undefined ||\n      theirs.originalSource !== mineSource",
    "      theirs.originalSource === undefined",
)


def _replace(pair: tuple[str, str]) -> Callable[[str], str]:
    old, new = pair

    def edit(text: str) -> str:
        assert text.count(old) == 1, f"the mutation anchor {old!r} is not unique"
        return text.replace(old, new, 1)

    return edit


def _both(*pairs: tuple[str, str]) -> Callable[[str], str]:
    def edit(text: str) -> str:
        for pair in pairs:
            text = _replace(pair)(text)
        return text

    return edit


def test_the_unmutated_decoder_agrees_with_node_on_a_multi_source_map() -> None:
    """The PASS control, and the only one that proves the transitions decode.

    Generated lines alternate between two sources, so `srcIdx` is doing real
    work rather than staying at zero for the whole document.
    """
    result = _probe_project(_shape_probe(), TWO_SOURCE_BYTES)
    assert result.returncode == 0, result.stdout + result.stderr
    projected = json.loads(result.stdout)
    assert projected["effectiveSources"] == [
        "packages/probe/src/first.ts",
        "packages/probe/src/second.ts",
    ]
    # generated line -> source index -> original line, both indices exercised
    assert projected["attribution"] == ["0|0|0", "1|1|0", "2|0|5", "3|1|7"]
    assert projected["coverage"] == {
        "packages/probe/src/first.ts": [0, 5],
        "packages/probe/src/second.ts": [0, 7],
    }
    shutil.rmtree(SHAPE_PROBE)


def test_a_decoder_that_loses_the_source_index_fails_at_the_node_cross_check() -> None:
    result = _probe_project(_shape_probe(_replace(LOSE_SOURCE_INDEX)), TWO_SOURCE_BYTES)
    assert result.returncode != 0, "a decoder attributing every segment to source 0 was accepted"
    output = result.stdout + result.stderr
    assert "disagrees with node:module" in output, output
    # and it disagrees about the SOURCE, naming both readings
    assert "first.ts" in output and "second.ts" in output, output
    shutil.rmtree(SHAPE_PROBE)


def test_the_old_cross_check_accepted_that_corruption() -> None:
    """What the source-identity clause is FOR.

    The same corruption, against a cross-check that compared only original line
    and column and merely required `originalSource` to exist. It passes — every
    segment attributed to the wrong file, and the projection built from it would
    have been treated as the migration authority.
    """
    result = _probe_project(
        _shape_probe(_both(LOSE_SOURCE_INDEX, OLD_CROSS_CHECK)), TWO_SOURCE_BYTES
    )
    assert result.returncode == 0, (
        "the demonstration is void unless the old cross-check really accepted this"
    )
    accepted = json.loads(result.stdout)
    assert accepted["attribution"] == ["0|0|0", "1|0|0", "2|0|5", "3|0|7"], accepted["attribution"]
    assert accepted["coverage"] == {"packages/probe/src/first.ts": [0, 5, 7]}, accepted["coverage"]
    shutil.rmtree(SHAPE_PROBE)


def test_a_decoder_that_moves_the_original_line_fails_at_the_node_cross_check() -> None:
    """The half that already existed, kept driven rather than assumed."""
    result = _probe_project(_shape_probe(_replace(MOVE_ORIGINAL_LINE)), TWO_SOURCE_BYTES)
    assert result.returncode != 0, "a decoder reporting the wrong original line was accepted"
    assert "disagrees with node:module" in result.stdout + result.stderr
    shutil.rmtree(SHAPE_PROBE)


def test_the_shape_probe_never_touches_the_repository_module() -> None:
    committed = (REPO / "scripts" / "source-map-shape.mjs").read_text()
    _shape_probe(_replace(LOSE_SOURCE_INDEX))
    assert (REPO / "scripts" / "source-map-shape.mjs").read_text() == committed
    shutil.rmtree(SHAPE_PROBE)
    assert not SHAPE_PROBE.exists()


# --- P2-001, the emitted-target half ----------------------------------------
#
# `file` is the map's CLAIM about what it describes. Comparing it against the
# previous compiler's `file` proves the claim did not change, never that it is
# true — a map that named the wrong target under BOTH compilers is stable and
# still wrong, and a consumer following it looks for the wrong emitted file.


def test_the_expected_emitted_target_comes_from_the_maps_own_path() -> None:
    out = _node(
        "import {expectedEmittedTarget} from "
        f"{str(REPO / 'scripts' / 'source-map-shape.mjs')!r};"
        "process.stdout.write(JSON.stringify(["
        "'packages/x/dist/index.js.map','packages/x/dist/index.d.ts.map'"
        "].map(expectedEmittedTarget)))"
    )
    assert json.loads(out) == ["index.js", "index.d.ts"]


def test_a_map_naming_the_wrong_emitted_target_fails() -> None:
    wrong = _map_bytes(file="other.js", lines=BASE_LINES)
    before = _projection(wrong, PROBE_MAP)
    after = _projection(wrong, PROBE_MAP)
    assert before["file"] == after["file"] == "other.js"
    assert _compare_map(before, after, strict=True, scope=PROBE_SCOPE) == [], (
        "before/after equality must NOT be what catches this, or the control proves nothing"
    )

    problems = _compare_map(before, after, strict=True, scope=PROBE_SCOPE, expected_file="index.js")
    assert any('names "other.js" as its emitted target' in p for p in problems), problems


def test_a_map_naming_its_real_emitted_target_passes() -> None:
    projected = _projection(BASE_BYTES, PROBE_MAP)
    assert (
        _compare_map(projected, projected, strict=True, scope=PROBE_SCOPE, expected_file="index.js")
        == []
    )


def test_the_differential_refuses_a_map_naming_the_wrong_emitted_target() -> None:
    """End to end: the real differential, over a real map file set."""
    wrong = _map_bytes(file="other.js", lines=BASE_LINES)
    problems = _differential(*_probe_documents({PROBE_MAP: wrong}, {PROBE_MAP: wrong}))
    assert any("as its emitted target" in p for p in problems), problems


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

    The old attribution is still in the bytes — so "every TS6 pair survives"
    holds — and generated line 1 has ALSO acquired a segment resolving to a
    different original line. Containment passes it; set equality does not.
    """
    doubled = _map_bytes(lines=[[(0, 0, 0, 0)], [(0, 0, 1, 0), (5, 0, 7, 0)], [(0, 0, 2, 0)]])
    assert doubled != BASE_BYTES, "the mutation changed no map bytes"
    before = _projection(BASE_BYTES, PROBE_MAP)
    after = _projection(doubled, PROBE_MAP)
    assert set(before["attribution"]) < set(after["attribution"]), (
        "the mutation must be a strict superset, or it is not testing containment"
    )

    problems = _compare_map(before, after, strict=True, scope=PROBE_SCOPE)
    assert any("different origin rather than a refinement" in p for p in problems), problems


def test_control_10_a_refined_segment_on_the_same_line_passes() -> None:
    """The other control that must PASS.

    An extra segment on the same generated line resolving to the SAME effective
    file and original line is column refinement, which the new compiler is
    allowed to do.
    """
    refined = _map_bytes(lines=[[(0, 0, 0, 0)], [(0, 0, 1, 0), (5, 0, 1, 4)], [(0, 0, 2, 0)]])
    before = _projection(BASE_BYTES, PROBE_MAP)
    after = _projection(refined, PROBE_MAP)
    assert after["mappedSegments"] > before["mappedSegments"], "the refinement added no segments"
    assert set(after["attribution"]) == set(before["attribution"]), (
        "the refinement must not change the (line -> file, line) relation"
    )

    assert _compare_map(before, after, strict=True, scope=PROBE_SCOPE) == []


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
