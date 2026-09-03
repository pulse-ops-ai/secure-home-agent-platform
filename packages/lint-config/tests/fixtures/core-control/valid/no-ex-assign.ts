export function run(): string {
  try {
    return 'ok'
  } catch (error) {
    return String(error)
  }
}
