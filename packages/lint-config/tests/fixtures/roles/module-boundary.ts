// An exported function with an inferred return type: a library's boundary
// must be stated; a composition root's need not.
export function add(a: number, b: number) {
  return a + b
}
