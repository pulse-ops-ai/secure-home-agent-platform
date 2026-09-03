export function run(): string {
  try {
    return 'ok'
  } catch (error) {
    error = 'replaced'
    return String(error)
  }
}
