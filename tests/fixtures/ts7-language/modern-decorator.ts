import type { Shape } from '@secure-home/contracts'
function log(_value: unknown, _context: unknown) {}
export class Service {
  @log
  read(): Shape | undefined {
    return undefined
  }
}
