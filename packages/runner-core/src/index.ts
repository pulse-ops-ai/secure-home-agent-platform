/**
 * The public trusted-operation surface of the runner decision core.
 *
 * Exports trusted domain operations and their value types — never modules,
 * classes, or internals. No exported operation accepts a path, file handle,
 * reader, port, or callback that could read one: bytes and observations are
 * values, and their acquisition is L4's (design D3/D4).
 *
 * Importing this module has no side effect: the package is inert until L4
 * consumes it (RC-INV-07).
 */
export {}
