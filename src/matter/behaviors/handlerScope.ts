/**
 * Knowing whether code runs inside a plugin's command handler.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

const scope = new AsyncLocalStorage<true>()

/**
 * Run a plugin's command handler, marked as such for everything it awaits.
 */
export function runInHandlerScope<T>(handler: () => T): T {
  return scope.run(true, handler)
}

/**
 * Whether the caller is (awaited from) a plugin's command handler.
 *
 * matter.js may lock a cluster's state for a command before it calls the
 * handler (a colour command sets the colour mode first). An update of that
 * cluster which the handler waits for then waits for the command, and the
 * command waits for the handler: neither ever ends.
 */
export function isInHandlerScope(): boolean {
  return scope.getStore() === true
}
