#!/usr/bin/env node
/**
 * THE STRUCTURAL SHAPE OF A DECLARATION FILE.
 *
 * `EX-TS-002` requires TypeScript 7 to preserve what a `.d.ts` MEANS, not how
 * the previous compiler happened to serialize it. Two serializer choices are
 * admissible because no consumer can depend on them: the string-literal quote
 * delimiter, and member ordering inside an object type, whose members are
 * unordered by the language's own rules.
 *
 * WHY NOT A NORMALIZER. The obvious approach is a list of patterns that rewrite
 * TypeScript 6 output into TypeScript 7 output. It is the wrong shape: a rule
 * gets added per observed difference, each one erasing a little more, and the
 * comparison ends up accepting everything. The rules needed here would have had
 * to rewrite quoting and reorder members inside braces — which is exactly where
 * meaning lives, so the normalizer would be unable to distinguish "the compiler
 * reordered an enum" from "someone deleted a member".
 *
 * WHY NOT A TYPESCRIPT PARSER. `@typescript/typescript6` is the bounded
 * compatibility seam with exactly one admitted consumer, and adding a second
 * would widen an authority this task does not own. TypeScript 7's own root
 * export has no traditional AST API, and `typescript/unstable/*` is forbidden to
 * ordinary commands. So the shape is derived from the declaration's own lexical
 * and nesting structure instead, which is enough for the question being asked.
 *
 * WHAT IT DOES. Tokenize; canonicalize each string literal by DECODING it and
 * re-encoding with one delimiter, so quoting cannot differ while content does;
 * build the real brace/bracket/paren nesting; and inside `{ ... }` only, sort
 * the top-level members. Everything else — tuples, parameter lists, unions,
 * intersections, order of declarations in the file — keeps its order, so a
 * change there still fails.
 */
import { createHash } from 'node:crypto'

const PUNCT3 = ['...', '===', '!==', '**=', '<<=', '>>=']
const PUNCT2 = [
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
]

/** Decode a string literal to the value it denotes. */
function decodeStringLiteral(raw) {
  const quote = raw[0]
  const body = raw.slice(1, -1)
  let out = ''
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') {
      out += body[i]
      continue
    }
    i += 1
    const c = body[i]
    if (c === 'n') out += '\n'
    else if (c === 't') out += '\t'
    else if (c === 'r') out += '\r'
    else if (c === 'b') out += '\b'
    else if (c === 'f') out += '\f'
    else if (c === 'v') out += '\v'
    else if (c === '0' && !/[0-9]/.test(body[i + 1] ?? '')) out += '\0'
    else if (c === 'x') {
      out += String.fromCharCode(Number.parseInt(body.slice(i + 1, i + 3), 16))
      i += 2
    } else if (c === 'u') {
      if (body[i + 1] === '{') {
        const end = body.indexOf('}', i)
        out += String.fromCodePoint(Number.parseInt(body.slice(i + 2, end), 16))
        i = end
      } else {
        out += String.fromCharCode(Number.parseInt(body.slice(i + 1, i + 5), 16))
        i += 4
      }
    } else if (c === '\n') {
      // line continuation: contributes nothing
    } else out += c
    void quote
  }
  return out
}

/** Re-encode a string value with ONE delimiter, so quoting cannot vary. */
function encodeStringLiteral(value) {
  let out = '"'
  for (const ch of value) {
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else out += ch
  }
  return `${out}"`
}

export function tokenize(text) {
  const tokens = []
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i += 1
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? n : end
      tokens.push({ kind: 'comment', value: text.slice(i, stop).trimEnd() })
      i = stop
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      // Comments are compared, not discarded: a `.d.ts` ships its JSDoc, and a
      // compiler that started rewriting documentation is something to see.
      // Interior whitespace is collapsed because indentation is not content.
      tokens.push({ kind: 'comment', value: text.slice(i, stop).replace(/\s+/g, ' ') })
      i = stop
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n) {
        if (text[j] === '\\') j += 2
        else if (text[j] === c) break
        else j += 1
      }
      const raw = text.slice(i, j + 1)
      tokens.push({ kind: 'string', value: encodeStringLiteral(decodeStringLiteral(raw)) })
      i = j + 1
      continue
    }
    if (c === '`') {
      // Template literal: kept verbatim. It can nest expressions, and nothing
      // in this repository's declarations depends on re-quoting one.
      let j = i + 1
      while (j < n) {
        if (text[j] === '\\') j += 2
        else if (text[j] === '`') break
        else j += 1
      }
      tokens.push({ kind: 'template', value: text.slice(i, j + 1) })
      i = j + 1
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j += 1
      tokens.push({ kind: 'word', value: text.slice(i, j) })
      i = j
      continue
    }
    if (/[0-9]/.test(c)) {
      let j = i
      while (j < n && /[0-9a-fA-FxXoObBeE._n+-]/.test(text[j])) {
        // stop a trailing sign that belongs to the next token
        if ((text[j] === '+' || text[j] === '-') && !/[eE]/.test(text[j - 1])) break
        j += 1
      }
      tokens.push({ kind: 'number', value: text.slice(i, j) })
      i = j
      continue
    }
    const three = text.slice(i, i + 3)
    const two = text.slice(i, i + 2)
    if (PUNCT3.includes(three)) {
      tokens.push({ kind: 'punct', value: three })
      i += 3
      continue
    }
    if (PUNCT2.includes(two)) {
      tokens.push({ kind: 'punct', value: two })
      i += 2
      continue
    }
    tokens.push({ kind: 'punct', value: c })
    i += 1
  }
  return tokens
}

const OPEN = { '{': '}', '[': ']', '(': ')' }

/** Real nesting, from the token stream. */
function buildTree(tokens) {
  let i = 0
  const parse = (closer) => {
    const nodes = []
    while (i < tokens.length) {
      const token = tokens[i]
      if (closer !== undefined && token.kind === 'punct' && token.value === closer) {
        i += 1
        return nodes
      }
      if (token.kind === 'punct' && OPEN[token.value] !== undefined) {
        const open = token.value
        i += 1
        nodes.push({ group: open, children: parse(OPEN[open]) })
        continue
      }
      nodes.push(token)
      i += 1
    }
    return nodes
  }
  return parse(undefined)
}

/**
 * Render a node list canonically.
 *
 * Inside `{ ... }` the top-level members are SORTED, because TypeScript object
 * type members, interface members, enum members and named import/export
 * bindings are unordered: `{ a: X; b: Y }` and `{ b: Y; a: X }` denote the same
 * type. `[ ... ]` and `( ... )` keep their order — a tuple element or a
 * parameter moving IS a semantic change.
 */
function render(nodes, sortMembers) {
  const parts = []
  for (const node of nodes) {
    if (node.group === undefined) {
      parts.push(node.value)
      continue
    }
    const inner = renderGroup(node)
    parts.push(inner)
  }
  const joined = parts.join(' ')
  if (!sortMembers) return joined
  return joined
}

function renderGroup(node) {
  const closer = OPEN[node.group]
  if (node.group !== '{') {
    return `${node.group} ${render(node.children, false)} ${closer}`
  }
  // split top-level members on `;` and `,`
  const members = []
  let current = []
  for (const child of node.children) {
    if (
      child.group === undefined &&
      child.kind === 'punct' &&
      (child.value === ';' || child.value === ',')
    ) {
      members.push(current)
      current = []
      continue
    }
    current.push(child)
  }
  members.push(current)
  const rendered = members
    .map((member) => render(member, false).trim())
    .filter((member) => member !== '')
    .sort()
  return `{ ${rendered.join(' ; ')} }`
}

/** The canonical shape of a declaration file. */
export function canonicalDeclaration(text) {
  return render(buildTree(tokenize(text)), false)
}

export function declarationShapeSha256(text) {
  return createHash('sha256').update(canonicalDeclaration(text), 'utf8').digest('hex')
}
