// Human-facing applications under apps/.
//
// Framework rules (Next.js, React) are deliberately absent — they belong to the
// issue that scaffolds the application. This export exists now so the
// application boundary consumes shared tooling from day one rather than
// acquiring its own copy.

import { configFileOverrides } from './base.js'
import { node } from './node.js'

export const application = [
  ...node,
  {
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  configFileOverrides,
]

export default application
