import config from '@secure-home/eslint-config/library'

export default [
  ...config,
  {
    // The wire entry is the package's ONE declared process boundary: it
    // reads stdin, writes the report to stdout, and forwards signals. The
    // library restrictions stay in force for every other file, so process
    // state cannot leak into the pure translation core.
    files: ['src/bin.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-console': 'off',
    },
  },
]
