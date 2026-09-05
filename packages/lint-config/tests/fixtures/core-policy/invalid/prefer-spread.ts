export const call = (f: (...a: number[]) => number, a: number[]): number =>
  f.apply(null, a)
