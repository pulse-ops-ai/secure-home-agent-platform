export function pick(n: number): string {
  let out = ''
  switch (n) {
    case 1:
      out = 'a'
    default:
      out = 'b'
  }
  return out
}
