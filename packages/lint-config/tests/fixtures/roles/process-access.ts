// A library must not read process state, exit, or print; a composition root
// may read and exit but still must not print; the adapter's wire entry may do
// all three.
export function home(): string {
  console.log('resolving home')
  const value = process.env.HOME
  if (value === undefined) process.exit(1)
  return value
}
