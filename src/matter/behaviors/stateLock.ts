/**
 * Taking a cluster's state lock after waiting for a plugin handler.
 */

import type { Behavior } from '@matter/main'

/**
 * Wait until this command may write the cluster's state.
 *
 * A command first awaits the plugin's handler and then writes the state. When
 * two commands for one accessory arrive together (a controller sends "set
 * level" and "on" as a pair), the second one resumed while the first was
 * still saving, and its write failed with "Cannot lock ... synchronously"
 * after the plugin had already acted. matter.js takes a lock without waiting
 * unless it is asked for up front, so ask: the second command then waits for
 * the first to finish saving.
 *
 * It is taken after the handler, not before, on purpose: a plugin may update
 * the same cluster from inside its handler, and that update must not wait for
 * a command that is waiting for the handler.
 */
export async function lockStateForWrite(behavior: Behavior): Promise<void> {
  let transaction: Behavior['context']['transaction'] | undefined
  try {
    transaction = (behavior.context as Partial<Behavior['context']>).transaction
  } catch {
    // Not inside a matter.js action, so nothing else can be writing through a
    // transaction. Only the unit tests get here: they call the command methods
    // on a bare object that matter.js never set up.
    return
  }
  if (!transaction) {
    return
  }
  await transaction.addResources(behavior)
  await transaction.begin()
}
