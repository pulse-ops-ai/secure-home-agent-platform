export function walk(n: number): number {
  unused: for (let i = 0; i < n; i += 1) {
    void i
  }
  return n
}
