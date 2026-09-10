/**
 * A STRICT, dependency-free validator for the JSON Schema subset these
 * authorities use.
 *
 * Why not a library: every other governed checker in this repository is
 * dependency-free Node, and the three schemas here are consumed by scripts that
 * must run before `pnpm install` has necessarily resolved anything. Adding a
 * validator dependency would also be unrelated lockfile movement in a landing
 * whose supply-chain rule is that only the three named tools arrive.
 *
 * Strictness is the point. Unknown keywords are REFUSED rather than ignored:
 * silently skipping a keyword it does not implement is how a hand-rolled
 * validator ends up reporting that a document satisfies a constraint nobody
 * ever checked.
 */

const SUPPORTED = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  '$defs',
  '$ref',
  'type',
  'enum',
  'const',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'pattern',
  'allOf',
  'if',
  'then',
  'propertyNames',
])

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`)
  let node = root
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part]
    if (node === undefined) throw new Error(`unresolvable $ref: ${ref}`)
  }
  return node
}

function check(value, schema, root, path, errors) {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED.has(keyword)) {
      throw new Error(`unsupported schema keyword "${keyword}" at ${path || '<root>'}`)
    }
  }

  if (schema.$ref !== undefined) {
    check(value, resolveRef(schema.$ref, root), root, path, errors)
    return errors
  }

  const at = path || '<root>'
  const t = typeOf(value)

  if (schema.type !== undefined && t !== schema.type) {
    errors.push(`${at}: expected ${schema.type}, got ${t}`)
    return errors
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${at}: must be ${JSON.stringify(schema.const)}`)
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`)
  }

  if (t === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${at}: shorter than ${schema.minLength}`)
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${at}: longer than ${schema.maxLength}`)
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(`${at}: does not match ${schema.pattern}`)
    }
  }

  if (t === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at}: fewer than ${schema.minItems} items`)
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${at}: more than ${schema.maxItems} items`)
    }
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((v) => JSON.stringify(v)))
      if (seen.size !== value.length) errors.push(`${at}: items are not unique`)
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => check(item, schema.items, root, `${at}[${i}]`, errors))
    }
  }

  if (t === 'object') {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${at}: missing required "${key}"`)
    }
    if (schema.additionalProperties === false && schema.properties !== undefined) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties, key)) {
          errors.push(`${at}: unknown field "${key}"`)
        }
      }
    }
    if (schema.propertyNames !== undefined) {
      for (const key of Object.keys(value)) {
        check(key, schema.propertyNames, root, `${at}.<key ${key}>`, errors)
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) check(value[key], sub, root, `${at}.${key}`, errors)
    }
  }

  for (const sub of schema.allOf ?? []) check(value, sub, root, path, errors)

  if (schema.if !== undefined && schema.then !== undefined) {
    if (check(value, schema.if, root, path, []).length === 0) {
      check(value, schema.then, root, path, errors)
    }
  }

  return errors
}

/** Every violation, not just the first: one pass should tell you all of it. */
export function validate(document, schema) {
  return check(document, schema, schema, '', [])
}
