// Must fail no-console — structured logging is a platform contract.
export function f(): void {
  console.log('bypasses the logging package')
}
