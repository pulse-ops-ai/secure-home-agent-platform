export function walk(n: number): number {
  for (let i = 0; i < n; i += 1) {
    if (i > 1) break
  }
  return n
}
