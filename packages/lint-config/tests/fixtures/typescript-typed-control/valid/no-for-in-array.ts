export function walk(list: number[]): number {
  let total = 0
  for (const item of list) total += item
  return total
}
