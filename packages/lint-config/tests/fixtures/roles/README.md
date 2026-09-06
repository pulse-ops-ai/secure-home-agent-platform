# Role fixtures — the same source, judged per role

The rule shards prove that both engines enforce each policy. They cannot prove
that a policy reaches the RIGHT files, because every shard fixture is linted
under one role. These fixtures are linted under EVERY role, on both engines,
and the expectation is a matrix: which role must reject the file, and which
must accept it, for each policy the file provokes.

| Fixture               | Provokes                                                                     | Rejected under                                          | Accepted under                                      |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `process-access.ts`   | `no-console`, `no-restricted-globals`, `no-restricted-properties`            | library (all three); service, application (console only) | adapter-bin, config-file, exported-test              |
| `process-access.js`   | the same three, as untyped JavaScript                                        | —                                                       | js-config                                            |
| `module-boundary.ts`  | `explicit-module-boundary-types`                                             | library, adapter-bin                                    | service, application, config-file, exported-test     |
| `module-boundary.js`  | the same, as untyped JavaScript                                              | —                                                       | js-config                                            |
| `explicit-any.ts`     | `no-explicit-any`                                                            | library, service, application, adapter-bin, config-file | exported-test                                        |

The matrix is the proof of `EX-ROLE-001`. Its mutation (`MUT-ROLE-001`) is a
role whose config stops rejecting what the matrix says it must: the test drives
the evaluator with that observation and requires it to fail.

Like every other fixture here, these are evidence, not source: the four
readers that exclude `tests/fixtures/` exclude this directory too, and only the
parity harness reads it.
