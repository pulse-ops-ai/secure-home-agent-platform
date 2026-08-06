// Aggregate entry point.
//
// Prefer a role-specific export — `@secure-home/eslint-config/library`,
// `/service`, `/application`, `/test` — so a package gets the rules that match
// what it is. This default is the library configuration, which is the strictest
// role and the safe fallback.

export { base, ignores, configFileOverrides } from './base.js'
export { node } from './node.js'
export { library } from './library.js'
export { service } from './service.js'
export { application } from './application.js'
export { test } from './test.js'

export { library as default } from './library.js'
