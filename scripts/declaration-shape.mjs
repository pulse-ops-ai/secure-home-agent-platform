#!/usr/bin/env node
/**
 * THE COMPARABLE SHAPE OF A DECLARATION FILE.
 *
 * `EX-TS-002` requires TypeScript 7 to preserve what a `.d.ts` MEANS. Two
 * differences are pure presentation and no consumer can depend on them: the
 * string-literal quote delimiter, and whitespace. Everything else — including
 * ORDER — is meaning.
 *
 * ORDER IS MEANING, which the first implementation got wrong. It canonicalized
 * by sorting the members of every `{ ... }` group, on the reasoning that object
 * type members are unordered. That is true of a property bag and false of an
 * overload set: TypeScript resolves overloads by DECLARATION ORDER, first match
 * wins, so
 *
 *     interface F { f(x: string): 1; f(x: unknown): 2 }
 *     interface F { f(x: unknown): 2; f(x: string): 1 }
 *
 * are different types, and a sorter reports them equal. The same holds for
 * class and namespace overloads. A sorter with exceptions carved out for those
 * cases is the accumulating normalizer this proof exists to avoid, so there is
 * no sorting at all.
 *
 * The member-order differences the cutover actually produces are handled where
 * they belong — at CAPTURE, by asking TypeScript 6 for TypeScript 7's ordering
 * with `--stableTypeOrdering` (D18). That is a migration-analysis projection,
 * never repository configuration, so the comparison never has to guess which
 * reorderings were safe.
 *
 * PRESENTATION comes from Prettier, which the repository already uses as its
 * sole formatting authority. It is parser-backed, so it cannot reorder members
 * the way a hand-written tokenizer might, and it needs no new dependency.
 */
import { createHash } from 'node:crypto'

import { format } from 'prettier'

/** Presentation-only canonicalization: quote delimiter and whitespace. */
export async function canonicalDeclaration(text) {
  return format(text, {
    parser: 'typescript',
    // Pinned here rather than inherited from the repository's Prettier config.
    // This is a COMPARISON, and it must not change meaning because someone
    // edited a formatting preference.
    semi: true,
    singleQuote: false,
    trailingComma: 'all',
    printWidth: 100,
    tabWidth: 2,
  })
}

export async function declarationShapeSha256(text) {
  return createHash('sha256')
    .update(await canonicalDeclaration(text), 'utf8')
    .digest('hex')
}
