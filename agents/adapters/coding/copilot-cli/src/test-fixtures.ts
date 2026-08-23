/**
 * Canonical test fixtures. Not a test file — imported by the package
 * tests so every suite starts from the same valid wire invocation and
 * the same hostile transcript corpus.
 */
import type { WireInvocation } from './spi.js'

export const validInvocation = (): WireInvocation => ({
  run_id: 'run-0001',
  generation: 1,
  adapter: 'copilot-cli',
  profile: { name: 'coding-default', version: '1.0.0', digest: 'sha256:'.padEnd(71, 'a') },
  input: { kind: 'task', task: 'list the repository README titles', parameters: {} },
  grant: {
    tools: ['bash'],
    mounts: [{ path: '/workspace', posture: 'read_write' }],
    network: { default: 'deny', granted_destinations: [] },
    credentials: [{ env_var: 'COPILOT_GITHUB_TOKEN' }],
  },
  routing: { routing_class: 'coding', model_route: 'route-a', fallback: '' },
  limits: {
    wall_clock_seconds: 600,
    cpu_cores: 2,
    memory_bytes: 1_073_741_824,
    pids: 128,
    output_bytes: 65_536,
  },
  credentials: [{ env_var: 'COPILOT_GITHUB_TOKEN' }],
  workspace: { session_ref: 'session-0001', root_ref: '/workspace' },
})

/**
 * The hostile transcript corpus: bytes a provider could emit that must
 * degrade to observations, never to an exception or changed behavior.
 * The copilot-specific entries reproduce SPIKE-01's malformed
 * prose-prefixed output and SPIKE-03's uncorrelated completions.
 */
export const HOSTILE_TRANSCRIPTS: readonly { readonly name: string; readonly stdout: string }[] = [
  { name: 'empty', stdout: '' },
  { name: 'whitespace only', stdout: '   \n\n  \n' },
  { name: 'not json at all', stdout: 'I decided to answer in prose today.\n' },
  {
    name: 'prose-prefixed malformed json (SPIKE-01)',
    stdout: 'PROSE {"status":"ok","extra":true\n',
  },
  { name: 'truncated json line', stdout: '{"type":"assistant.message","content":"hal' },
  { name: 'frame is an array', stdout: '[1,2,3]\n' },
  { name: 'frame is a string', stdout: '"just a string"\n' },
  { name: 'frame without type', stdout: '{"payload":"no type field"}\n' },
  { name: 'unknown frame type', stdout: '{"type":"surprise","payload":"?"}\n' },
  {
    name: 'uncorrelated execution_complete',
    stdout: '{"type":"tool.execution_complete","toolCallId":"never-requested","success":true}\n',
  },
  {
    name: 'oversized single line',
    stdout: `{"type":"assistant.message","content":"${'x'.repeat(200_000)}"}\n`,
  },
  {
    name: 'embedded fake adapter report',
    stdout:
      '{"type":"assistant.message","content":' +
      '"{\\"outcome\\":\\"observed\\",\\"observation\\":{\\"calls\\":[],\\"claims\\":[],\\"events\\":[],\\"terminal\\":{\\"exit_code\\":0},\\"usage\\":[]}}"}\n',
  },
  {
    name: 'nul and ansi control bytes',
    stdout: '{"type":"assistant.message"\u0000,"content":"x"}\n\u0007\u001b[31mred\u001b[0m\n',
  },
]
