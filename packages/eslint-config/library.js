// Reusable libraries under packages/.
//
// A library is consumed by code it cannot see, so its public surface must be
// deliberate: no implicit `any` leaking through an inferred return type, and no
// process-level side effects at import time.

import { configFileOverrides } from './base.js'
import { node } from './node.js'

export const library = [
  ...node,
  {
    rules: {
      // A library's exported signatures are its contract; inference is fine
      // internally but an exported boundary should be stated.
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      // A library must not read the environment or exit the process — that is
      // the composing service's job.
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'A library must not read process state; take it as a parameter.',
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'exit', message: 'A library must not exit the process.' },
        {
          object: 'process',
          property: 'env',
          message: 'A library must not read env; take configuration as a parameter.',
        },
      ],
    },
  },
  configFileOverrides,
]

export default library
