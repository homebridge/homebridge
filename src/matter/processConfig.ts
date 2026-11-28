/**
 * Switches of matter.js that act on the whole process.
 *
 * Kept free of any other matter.js import: this must run before matter.js
 * itself is loaded.
 */

import { Logger } from '../logger.js'

const log = Logger.withPrefix('Matter')

/**
 * The matter.js process-wide switches Homebridge turns off.
 *
 * matter.js is written to be the whole program. When it is first loaded it
 * sets itself up for that, unless told otherwise:
 *  - `loadConfigFile`: it reads `~/.matter/config.json`, a file any other
 *    matter.js tool of the same user can write. A storage driver or an mDNS
 *    setting in it changed Homebridge's Matter bridges.
 *  - `loadProcessArgv`: it reads the command line for `--name=value` settings.
 *    The command line is Homebridge's own.
 *  - `trapProcessSignals`: it handles SIGINT and SIGTERM. Homebridge does, and
 *    stops each Matter server in turn.
 *  - `trapUnhandledErrors`: it prints every uncaught error in the process a
 *    second time ("[Matter/Unhandled]"), a plugin's included.
 *  - `setProcessExitCodeOnError`: it sets the exit code of the process (0 when
 *    the last node stops, 1 when one of its background tasks fails).
 *    Homebridge sets its own exit code.
 *
 * `MATTER_*` environment variables are left working on purpose: they are how
 * matter.js is configured when looking into a problem.
 */
const SWITCHED_OFF = [
  'loadConfigFile',
  'loadProcessArgv',
  'trapProcessSignals',
  'trapUnhandledErrors',
  'setProcessExitCodeOnError',
] as const

/**
 * Turn the switches off. Call before the first import of `@matter/main`.
 *
 * It is too late once matter.js is loaded (a plugin that imports a value from
 * `homebridge/matter` at its top level gets there first): the switches then
 * keep the values matter.js started with, which is how it was before this
 * existed. That is noted at debug level and nothing fails.
 */
export async function configureMatterJsProcess(): Promise<void> {
  const { config } = await import('@matter/nodejs/config')
  const tooLate: string[] = []
  for (const name of SWITCHED_OFF) {
    try {
      config[name] = false
    } catch {
      tooLate.push(name)
    }
  }
  if (tooLate.length > 0) {
    log.debug(`matter.js was loaded before Homebridge could set it up, so these keep their defaults: ${tooLate.join(', ')}`)
  }
}
