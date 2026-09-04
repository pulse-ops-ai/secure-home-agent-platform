export const has = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k)
