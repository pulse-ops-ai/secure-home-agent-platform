# SPIKE-01 — Schema-constrained structured output

Property: can Copilot CLI 1.0.79 (hosted gpt-5.4) be forced by a machine mechanism to return output conforming to a caller-provided schema, rejecting malformed output rather than merely discouraging it?

```text
supported: NO
enforcement_boundary: none native for assistant content. `--output-format json` frames the CLI *event transcript* as JSONL; it does not constrain the assistant message body. No response-schema / json-schema / response-format option exists.
failure_behavior: malformed/prose output is delivered verbatim as a JSON string value inside otherwise-valid JSONL, and the run exits 0. No validation or rejection occurs.
implications_for_L7: assistant-output schema compliance cannot be a Copilot CLI guarantee. Any structured-output contract L7 needs must be enforced by the platform (schema validate + reject/repair) outside the CLI.
```

Evidence:
- `--response-schema='{"type":"object"}'` rejected at argument parsing: `error: unknown option '--response-schema=...'`, exit 1 (no model call).
- schema-valid: prompt-only request returned exactly `{"status":"ok"}`, exit 0 — compliance by prompt, not enforcement.
- schema-invalid-adversarial: prompt demanded a malformed, prose-prefixed fragment; assistant content was exactly `PROSE {"status":"ok","extra":true`, terminal `result.exitCode=0`. Outer JSONL still parsed because the malformed text was a string value.

Limitations: one CLI version, one pinned hosted model. Undocumented internals are not treated as guarantees.
