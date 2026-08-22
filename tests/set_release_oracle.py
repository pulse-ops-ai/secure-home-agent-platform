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


def _check_token(value: str, where: str) -> str:
    _check_string(value, where)
    if any(ch.isspace() for ch in value):
        raise ManifestRefusalError(f"{where} contains whitespace")
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
    return str(value)


def _check_digest(value: str, where: str) -> str:
    bare = value[7:] if value.startswith("sha256:") else value
    if len(bare) != 64 or any(c not in "0123456789abcdef" for c in bare):
        raise ManifestRefusalError(f"{where} is not bare lowercase 64-hex")
    return bare


def canonical_manifest(release: dict[str, Any]) -> bytes:
    """Build the ADR-0019 canonical manifest bytes from logical content."""
    out = bytearray()
    out += SET_RELEASE_FORMAT + b"\n"

    scalars = {
        "family": _check_token(release["family"], "family"),
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
