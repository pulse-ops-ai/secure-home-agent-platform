export function drop(list: number[]): number[] {
  return list.filter((_, i) => i !== 0)
}
