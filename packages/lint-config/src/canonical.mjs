/**
 * ONE canonical byte representation for every generated authority.
 *
 * `AUTH-LINT-CONFIG` must be byte-identical to generator output, and the drift
 * check must fail on BYTES. Comparing parsed objects is not that check: it
 * accepts whitespace and key-order changes, so a generated file could be edited
 * into something the generator would never emit and still be reported clean.
 *
 * The serializer is Prettier, because Prettier is already the repository's
 * single formatting authority. Choosing anything else would mean the generated
 * bytes and `format:check` could disagree, and one of the two would have to be
 * suppressed. Here they are the same act, so the canonical form and the
 * formatting gate cannot drift apart.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import prettier from 'prettier'

/** Any JSON path inside this package resolves the same repository config. */
const FILEPATH_HINT = path.join(fileURLToPath(new URL('..', import.meta.url)), 'policy.json')

/**
 * The exact bytes a generated JSON authority is committed as.
 *
 * The two-space form is fed in deliberately. Prettier preserves an object's
 * input wrapping for JSON, so serializing to a single line first and letting
 * Prettier decide produces output that `prettier --check` then REJECTS: the
 * check sees an expanded file and preserves it, while the generator emits a
 * collapsed one. The two would disagree forever, and one of them would end up
 * suppressed. Starting from the indented form makes generation and the
 * formatting gate the same act, which is the only reason a byte comparison can
 * be trusted at all.
 */
export async function canonicalJson(value, filepath = FILEPATH_HINT) {
  // The REPOSITORY's Prettier options, resolved from its own config, not the
  // library defaults. Without this the generator formats at the default print
  // width while `format:check` uses the configured one, and the two disagree on
  // every long array -- which is exactly how the byte check silently became an
  // object check the first time.
  const options = await prettier.resolveConfig(filepath, { editorconfig: true })
  return prettier.format(JSON.stringify(value, null, 2), {
    ...options,
    filepath,
    parser: 'json',
  })
}
