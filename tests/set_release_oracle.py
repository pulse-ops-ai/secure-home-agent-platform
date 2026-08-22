"""IMPLEMENTATION B — the independent set-release digest oracle.

ADR-0019 section 4 requires the release digest to have an independent second
implementation. This is it, and its independence is the whole point:

  * it is written in a different language from implementation A;
  * it imports nothing from `packages/knowledge-toolchain`;
  * it shares no canonicalization helper with A;
  * it reconstructs the ADR-0019 bytes from LOGICAL release content.

A wrapper around A would prove only that A agrees with itself. This reads the
grammar from the accepted ADR and builds the bytes from scratch, so a defect
planted in A's serializer changes A's answer and not B's.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any

SET_RELEASE_FORMAT = b"okf-set-release-v1"
SCALAR_ORDER = (
    "family",
    "version",
    "runnerClass",
    "allowTaskAdditions",
    "allowTaskNarrowing",
    "maxBytes",
    "maxFreshnessDays",
    "requiredFailure",
    "optionalFailure",
    "overrideAuthority",
)


class ManifestRefusalError(Exception):
    """A logical release that cannot be canonically serialized."""


def _check_string(value: str, where: str) -> str:
    if not isinstance(value, str) or value == "":
        raise ManifestRefusalError(f"{where} is empty")
    if unicodedata.normalize("NFC", value) != value:
        raise ManifestRefusalError(f"{where} is not NFC-normalized")
    for bad, name in (("\x00", "NUL"), ("\n", "LF"), ("\r", "CR")):
        if bad in value:
            raise ManifestRefusalError(f"{where} contains {name}")
    return value


# EXACTLY the ASCII whitespace ADR-0019 names. Deliberately not str.isspace(),
# which is Unicode-wide: using it would make B refuse values A accepts, so the
# two implementations would disagree about the accepted DOMAIN while agreeing on
# today's fixtures.
_ASCII_WHITESPACE = frozenset("\t\n\x0b\x0c\r ")

# The repository module-id and set-family grammars, restated here rather than
# imported. B enforcing a weaker grammar would let it accept a manifest A refuses.
_MODULE_ID = re.compile(r"^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$")
_SET_FAMILY_ID = re.compile(r"^[a-z][a-z0-9-]*$")

# A's integers are JavaScript numbers, so the accepted authoring domain stops at
# the safe-integer boundary: beyond it a decimal spelling would not round-trip.
_MAX_SAFE_INTEGER = 2**53 - 1


def _check_token(value: str, where: str) -> str:
    _check_string(value, where)
    if any(ch in _ASCII_WHITESPACE for ch in value):
        raise ManifestRefusalError(f"{where} contains ASCII whitespace")
    return value


def _check_version(value: str, where: str) -> str:
    _check_token(value, where)
    parts = value.split(".")
    if len(parts) != 3 or not all(p.isdigit() and p.isascii() for p in parts):
        raise ManifestRefusalError(f"{where} is not DIGIT+.DIGIT+.DIGIT+")
    return value


def _check_int(value: int, where: str) -> str:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ManifestRefusalError(f"{where} is not a non-negative integer")
    if value > _MAX_SAFE_INTEGER:
        raise ManifestRefusalError(f"{where} is not a safe integer")
    return str(value)


def _check_digest(value: str, where: str) -> str:
    """A manifest member digest is BARE lowercase 64-hex.

    Deliberately no prefix stripping. Accepting "sha256:..." here and silently
    normalizing it would let B accept a logical release A refuses, so the two
    implementations would disagree about the domain while agreeing on the bytes
    they both happen to produce.
    """
    if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise ManifestRefusalError(f"{where} is not bare lowercase 64-hex")
    return value


def _check_family(value: str) -> str:
    """The grammar is "family" SP <family-id>, not "family" SP <any token>.

    The token rule alone admits `Demo`, `1demo`, and `demo/default`. The last is
    the dangerous one: a slash in a family id makes the release manifest PATH
    ambiguous, so it must be refused where the identity is built, not where the
    file is written.
    """
    _check_token(value, "family")
    if not _SET_FAMILY_ID.match(value):
        raise ManifestRefusalError("family is not a repository set-family id")
    return value


def canonical_manifest(release: dict[str, Any]) -> bytes:
    """Build the ADR-0019 canonical manifest bytes from logical content."""
    out = bytearray()
    out += SET_RELEASE_FORMAT + b"\n"

    scalars = {
        "family": _check_family(release["family"]),
        "version": _check_version(release["version"], "version"),
        "runnerClass": _check_token(release["runnerClass"], "runnerClass"),
        "allowTaskAdditions": "true" if release["allowTaskAdditions"] else "false",
        "allowTaskNarrowing": "true" if release["allowTaskNarrowing"] else "false",
        "maxBytes": _check_int(release["maxBytes"], "maxBytes"),
        "maxFreshnessDays": _check_int(release["maxFreshnessDays"], "maxFreshnessDays"),
        "requiredFailure": _check_token(release["requiredFailure"], "requiredFailure"),
        "optionalFailure": _check_token(release["optionalFailure"], "optionalFailure"),
        "overrideAuthority": _check_token(release["overrideAuthority"], "overrideAuthority"),
    }
    for name in SCALAR_ORDER:
        out += name.encode("utf-8") + b" " + scalars[name].encode("utf-8") + b"\n"

    deny = [_check_token(p, "deny") for p in release.get("deny", [])]
    if len(set(deny)) != len(deny):
        raise ManifestRefusalError("deny repeats")
    for pattern in sorted(deny, key=lambda v: v.encode("utf-8")):
        out += b"deny " + pattern.encode("utf-8") + b"\n"

    required_ids = {m["id"] for m in release.get("required", [])}
    for kind in ("required", "optional"):
        members = release.get(kind, [])
        ids = [_check_string(m["id"], f"{kind} id") for m in members]
        if len(set(ids)) != len(ids):
            raise ManifestRefusalError(f"{kind} repeats")
        if kind == "optional":
            for mid in ids:
                if mid in required_ids:
                    raise ManifestRefusalError(f"{mid} is both required and optional")
        for mid in ids:
            if not _MODULE_ID.match(mid):
                raise ManifestRefusalError(f"{kind} {mid} is not a module id")
        for m in sorted(members, key=lambda x: x["id"].encode("utf-8")):
            out += kind.encode("utf-8") + b" " + m["id"].encode("utf-8")
            out += b"\x00" + _check_token(m["version"], "member version").encode("utf-8")
            out += b"\x00" + _check_digest(m["digest"], "member digest").encode("utf-8")
            out += b"\n"
    return bytes(out)


def release_digest(release: dict[str, Any]) -> str:
    """sha256 over the exact canonical manifest bytes."""
    return "sha256:" + hashlib.sha256(canonical_manifest(release)).hexdigest()


def digest_of_bytes(manifest: bytes) -> str:
    """sha256 over manifest bytes read from storage."""
    return "sha256:" + hashlib.sha256(manifest).hexdigest()
