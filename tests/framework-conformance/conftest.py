"""Pytest wiring for the framework-conformance suite: the adapter
fixture, parameterized over every adapter — one suite, never a
per-adapter copy. The machinery lives in fc_support (the repository's
helper-module convention, e.g. workflow_model)."""

from __future__ import annotations

import pytest
from fc_support import ADAPTERS, Adapter, require_built


@pytest.fixture(params=ADAPTERS, ids=lambda adapter: adapter.name)
def adapter(request: pytest.FixtureRequest) -> Adapter:
    entry: Adapter = request.param
    require_built(entry)
    return entry
