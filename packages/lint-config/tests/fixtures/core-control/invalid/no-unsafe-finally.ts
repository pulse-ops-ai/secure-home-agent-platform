export function run(): string {
  try {
    return 'ok'
  } finally {
    return 'overridden'
  }
}
