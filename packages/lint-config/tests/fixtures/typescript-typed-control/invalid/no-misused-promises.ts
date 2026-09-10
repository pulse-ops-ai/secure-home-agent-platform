export function guard(p: Promise<boolean>): number {
  return p ? 1 : 0
}
