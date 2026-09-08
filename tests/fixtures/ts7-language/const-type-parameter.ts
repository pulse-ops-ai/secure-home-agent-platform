import type { Shape } from '@secure-home/contracts'
export function f<const P extends Shape>(p: P): P {
  return p
}
