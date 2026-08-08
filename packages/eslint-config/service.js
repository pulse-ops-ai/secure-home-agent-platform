// Deployable backend processes under services/.
//
// A service is the composition root: it MAY read the environment and exit the
// process, which a library may not. Framework rules (NestJS, Fastify) are
// deliberately absent — they belong to #26 and #27.

import { configFileOverrides } from './base.js'
import { node } from './node.js'

export const service = [
  ...node,
  {
    rules: {
      // Exported types matter less at a composition root than inside a library.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  configFileOverrides,
]

export default service
