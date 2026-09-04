export function drop(list: number[]): number[] {
  delete list[0]
  return list
}
