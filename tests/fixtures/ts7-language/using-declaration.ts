import { resource } from '@secure-home/contracts'
export function f() {
  using held = resource
  return held
}
