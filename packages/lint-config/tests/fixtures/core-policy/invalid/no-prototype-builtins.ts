export const has = (o: { hasOwnProperty(k: string): boolean }, k: string): boolean =>
  o.hasOwnProperty(k)
