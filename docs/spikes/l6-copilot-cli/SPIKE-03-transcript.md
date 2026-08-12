# SPIKE-03 — Machine-readable session transcript

Property: can a runner reconstruct prompts, tool requests/identities/arguments, dispositions/results, model/provider metadata, and terminal outcome without scraping terminal prose?

```text
supported: PARTIAL
format: (a) documented stdout JSONL via --output-format json; (b) automatic per-session $COPILOT_HOME/session-state/<id>/events.jsonl + SQLite session.db/session-store.db; (c) optional OTel JSONL (COPILOT_OTEL_FILE_EXPORTER_PATH), GenAI semantic conventions; (d) --share Markdown (human-readable only).
completeness_gaps: permission.requested/completed appeared in the PERSISTED events.jsonl but NOT in the observed stdout JSONL stream; provider/model/token metadata is richest in OTel, not stdout; external termination produced a contradictory terminal record (see below).
sensitive_content_behavior: stdout events, persisted events, SQLite, and share.md contain full prompts, tool args, and results. OTel DEFAULT omits message content, system instructions, tool-call arguments and results (only tool *definitions* + metadata remain); opt-in OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true adds full prompts, responses, system instructions, tool definitions, arguments, and results.
implications_for_L7: correlated machine events exist (stable-in-run toolCallId joins assistant request -> execution_start -> execution_complete with exact args/result + truncation flags), but the runner must (1) collect from multiple surfaces, (2) own terminal/lifecycle truth itself, (3) decide capture/redaction deliberately.
```

Evidence:
- Cases: no-tool, tool success, tool denial, preflight failure (unknown arg / unsupported reasoning effort), external SIGTERM timeout.
- Correlation: tool-positive/-denied show one toolCallId linking assistant.message.toolRequests -> tool.execution_start -> tool.execution_complete; complete carries success, error{code,message}, result content, and toolTelemetry.
- Denial is machine-readable: error.code="denied"; persisted permission.completed.result.kind is a closed enum (e.g. denied-no-approval-rule-and-could-not-request-from-user).
- Installed package ships schemas/session-events.schema.json (~150 event types) but no public stability/compat guarantee was established from it.
- TERMINATION FINDING: `timeout` SIGTERM gave process exit 124, but the CLI stdout still emitted result.exitCode=0 with totalApiDurationMs=0/sessionDurationMs=3, while the persisted shutdown was "routine" with a real model call recorded and no tool.execution_complete (only abort events). CLI terminal fields are therefore NOT authoritative for an externally terminated process.
