/**
 * Injection tokens for the port interfaces.
 *
 * Ports are interfaces, and a TypeScript interface has no runtime value
 * to inject by. Symbols give each port a stable identity that cannot
 * collide with a string token from anywhere else in a future application.
 */
export const PORT_TOKENS = {
  authority: Symbol.for('runner-control.port.authority'),
  workspace: Symbol.for('runner-control.port.workspace'),
  artifacts: Symbol.for('runner-control.port.artifacts'),
  execution: Symbol.for('runner-control.port.execution'),
  adapter: Symbol.for('runner-control.port.adapter'),
  events: Symbol.for('runner-control.port.events'),
  evidence: Symbol.for('runner-control.port.evidence'),
  clock: Symbol.for('runner-control.port.clock'),
} as const
