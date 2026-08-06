// Node runtime globals, without a DOM.
//
// Split from `base` so a future browser-side config can exist without every
// package inheriting Node globals it does not have.

import globals from 'globals'

import { base } from './base.js'

export const node = [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },
]

export default node
