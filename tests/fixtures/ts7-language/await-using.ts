import { resource } from '@secure-home/contracts'
export async function f() {
  await using held = resource
  return held
}
