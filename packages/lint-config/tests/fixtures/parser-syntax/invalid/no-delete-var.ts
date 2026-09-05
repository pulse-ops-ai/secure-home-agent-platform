let target = 1
export function drop() {
  delete target
  return target
}
