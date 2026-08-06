"""The single admitted Python boundary: isolated specialist inference workers.

Python is permitted here **only** where a mature ML, vision, or audio dependency
requires it and no adequate TypeScript equivalent exists (ADR-0012 §6).

A worker in this package may never own authorization, deterministic safety
policy, Home Assistant credentials, device actuation, authoritative persistence,
or envelope minting or verification. It consumes inputs and returns inferences.

No implementation yet. This package exists so the boundary is explicit and the
uv workspace has a real target. See README.md.
"""

__all__: list[str] = []
