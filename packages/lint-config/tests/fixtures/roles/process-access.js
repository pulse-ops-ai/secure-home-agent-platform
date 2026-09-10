// The same process access as untyped JavaScript: package-root tooling may do
// all of this.
export function home() {
  console.log('resolving home')
  const value = process.env.HOME
  if (value === undefined) process.exit(1)
  return value
}
