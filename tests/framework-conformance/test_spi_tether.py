"""The mechanical tether between the frozen SPI and each adapter mirror.

Nothing may import the deployable that owns the SPI, so agreement is
derived from SOURCE at test time — the same derive-or-refuse pattern the
image checker uses on the contracts helpers. An unlocatable or
unparseable frozen source is a REFUSAL, never a pass (PA-ADV-05,
PA-MUT-06); a mirror that adds, drops, or renames a frozen field fails
naming the field (PA-ADV-04).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fc_support import ADAPTERS, FROZEN_SPI, Adapter


class TetherError(Exception):
    """The frozen source could not be derived — refuse, do not skip."""


def _interface_block(source: str, name: str, where: Path) -> str:
    match = re.search(rf"(?:export )?interface {re.escape(name)}\b[^{{]*\{{", source)
    if match is None:
        raise TetherError(f"{where}: interface {name} not found — refusing, not skipping")
    depth = 0
    for index in range(match.end() - 1, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[match.end() : index]
    raise TetherError(f"{where}: interface {name} has no closing brace")


def interface_fields(path: Path, name: str) -> set[str]:
    if not path.is_file():
        raise TetherError(f"frozen SPI source unreadable: {path} — refusing, not skipping")
    block = _interface_block(path.read_text(), name, path)
    fields = set(re.findall(r"readonly (\w+)\??:", block))
    if not fields:
        raise TetherError(f"{path}: interface {name} yielded no fields — refusing")
    return fields


def report_outcomes(path: Path) -> set[str]:
    if not path.is_file():
        raise TetherError(f"frozen SPI source unreadable: {path} — refusing, not skipping")
    source = path.read_text()
    match = re.search(r"type AdapterReport =(.*?)(?=\nexport |\Z)", source, re.DOTALL)
    if match is None:
        raise TetherError(f"{path}: AdapterReport union not found — refusing")
    return set(re.findall(r"outcome: '(\w+)'", match.group(1)))


def mirror_path(adapter: Adapter) -> Path:
    return adapter.package_dir / "src" / "spi.ts"


# The report-side shapes must field-agree exactly, by name.
MIRRORED_EXACT = (
    "RunInput",
    "AdapterCall",
    "UntrustedClaim",
    "NormalizedProviderEvent",
    "TerminalObservations",
    "UsageMeasure",
    "AdapterObservation",
)


@pytest.mark.parametrize("adapter", ADAPTERS, ids=lambda a: a.name)
@pytest.mark.parametrize("interface", MIRRORED_EXACT)
def test_report_shapes_field_agree(adapter: Adapter, interface: str) -> None:
    frozen = interface_fields(FROZEN_SPI, interface)
    mirrored = interface_fields(mirror_path(adapter), interface)
    assert mirrored == frozen, (
        f"{adapter.package} spi.ts: {interface} disagrees with the frozen SPI — "
        f"missing {sorted(frozen - mirrored)}, extra {sorted(mirrored - frozen)}"
    )


@pytest.mark.parametrize("adapter", ADAPTERS, ids=lambda a: a.name)
def test_wire_invocation_is_frozen_request_minus_signal(adapter: Adapter) -> None:
    frozen = (
        interface_fields(FROZEN_SPI, "AdapterInvocationRequest")
        | interface_fields(FROZEN_SPI, "RunFence")
        | interface_fields(FROZEN_SPI, "RunScoped")
    )
    expected = frozen - {"signal"}
    mirrored = interface_fields(mirror_path(adapter), "WireInvocation")
    assert mirrored == expected, (
        f"{adapter.package} spi.ts: WireInvocation must be the frozen request minus "
        f"signal — missing {sorted(expected - mirrored)}, extra {sorted(mirrored - expected)}"
    )


@pytest.mark.parametrize("adapter", ADAPTERS, ids=lambda a: a.name)
def test_report_vocabulary_is_closed_and_identical(adapter: Adapter) -> None:
    frozen = report_outcomes(FROZEN_SPI)
    mirrored = report_outcomes(mirror_path(adapter))
    assert frozen == {"observed", "environmental_fault", "stale_fence"}
    assert mirrored == frozen, f"{adapter.package}: report vocabulary drifted"


def test_underivable_frozen_source_refuses(tmp_path: Path) -> None:
    """PA-ADV-05 / PA-MUT-06: derivation failure must refuse, not pass —
    a tether comparing against a hardcoded list would sail through this."""
    with pytest.raises(TetherError):
        interface_fields(tmp_path / "values.ts", "AdapterObservation")
    hollow = tmp_path / "hollow.ts"
    hollow.write_text("export const nothing = 1\n")
    with pytest.raises(TetherError):
        interface_fields(hollow, "AdapterObservation")
    with pytest.raises(TetherError):
        report_outcomes(hollow)


def test_mirror_drift_is_named(tmp_path: Path) -> None:
    """A dropped frozen field fails naming the field and the direction."""
    dropped = tmp_path / "drifted.ts"
    dropped.write_text(
        "export interface TerminalObservations {\n"
        "  readonly exit_code?: number\n"
        "  readonly reported_outcome?: string\n"
        "  readonly transcript_terminal?: string\n"
        "}\n"
    )
    frozen = interface_fields(FROZEN_SPI, "TerminalObservations")
    drifted = interface_fields(dropped, "TerminalObservations")
    assert frozen - drifted == {"signalled"}
