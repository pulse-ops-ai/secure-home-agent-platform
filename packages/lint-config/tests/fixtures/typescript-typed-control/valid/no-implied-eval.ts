export function later(fn: () => void): void {
  setTimeout(fn, 0)
}
