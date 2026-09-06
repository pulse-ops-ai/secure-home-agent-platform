export function run(): string {
  try {
    return 'ok'
  } catch (error) {
    throw new Error('failed', { cause: error })
  }
}
