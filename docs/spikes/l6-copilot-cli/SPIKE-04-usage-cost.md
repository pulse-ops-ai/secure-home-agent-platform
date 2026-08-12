# SPIKE-04 — Per-run cost/usage reporting

Property: can the runner obtain machine-readable usage attributable to one run, sufficient to govern/report spend?

```text
supported: PARTIAL
native_fields: per-model request count; input/output/reasoning/cache-read/cache-write tokens; totalNanoAiu (AI-credit units, nano); github.copilot.cost (credit/premium unit, per model call in OTel); totalPremiumRequests; model+provider identity; server/API/session durations; inference-call and tool-call counts; code-change counts. Present in transcript terminal `result.usage`, persisted `session.shutdown.modelMetrics`, and OTel spans/metrics.
missing_fields: any monetary amount/currency; a documented credit->money conversion; a hard pre-spend cap (session limits are a documented SOFT cap known only after a response); a single surface that stays accurate under external termination.
attribution_strength: strong for routine runs (session/trace/interaction IDs join usage to one run). Cost fields are INCONSISTENT across surfaces: session.shutdown modelMetrics.requests.cost was 0 for ~all runs while OTel github.copilot.cost was ~1 per model call; only the unknown-tool run reported premium=1 / shutdown cost 1.
implications_for_L7: the runner can record native tokens + credit units (nano_aiu, premium requests) per run, but MUST NOT present them as currency, must pick one authoritative surface, and must handle termination-time gaps.
```

Evidence: machine-generated per-run table `usage-summary.tsv` (16 runs). Examples:
- no-tool: 1 request, in=14324 out=42 reasoning=34, nano_aiu=3.644e9, api_ms=2777.
- tool-positive: 2 requests, in=10417 out=92 cache_read=4608, nano_aiu=1.705e9.
- unknown-tool: premium=1, shutdown requests.cost=1 (the lone nonzero shutdown cost).
- external-abort: proc_exit=124 but result.exitCode=0 and result api_ms=0, while persisted shutdown recorded api_ms=4919 and 1 request — usage disagreement under termination.
- Installed billing help describes AI credits (or legacy premium requests), never a dollar amount.
