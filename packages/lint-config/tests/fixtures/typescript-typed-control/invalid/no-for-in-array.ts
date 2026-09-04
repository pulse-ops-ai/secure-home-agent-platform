export function walk(list: number[]): number {
  let total = 0
  for (const i in list) total += list[i as unknown as number]
  return total
}
