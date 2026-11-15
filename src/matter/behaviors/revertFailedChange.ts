/**
 * What the fan and thermostat behaviors do when a plugin's attribute-change
 * handler fails.
 *
 * These handlers run as a reaction to a write that matter.js has already
 * accepted: there is no command to fail, and an error thrown from the reaction
 * never reaches the controller. Left alone, the new value stays on the
 * endpoint and every controller shows a state the device never took. So the
 * old value is written back, which controllers see as the attribute changing
 * back, and the failure is logged.
 */

import { Logger } from '../../logger.js'
import { notePluginUpdate } from './pluginUpdates.js'

const log = Logger.withPrefix('Matter/Behaviors')

/** The part of an endpoint this needs. */
interface RevertableEndpoint {
  id: string
  setStateOf: (type: string, values: Record<string, unknown>) => Promise<void>
}

/**
 * Log a failed attribute-change handler and put the old value back.
 *
 * @param endpoint the endpoint the attribute is on
 * @param cluster the cluster name, as used in the plugin API (`fanControl`)
 * @param attribute the attribute that was changed
 * @param failedValue the value the handler could not apply
 * @param oldValue the value to put back
 * @param error what the handler threw
 */
export async function revertFailedChange(endpoint: RevertableEndpoint, cluster: string, attribute: string, failedValue: unknown, oldValue: unknown, error: unknown): Promise<void> {
  const message = error instanceof Error
    ? error.message
    : String(error)
  log.error(`[${endpoint.id}] The ${cluster} handler for a change of ${attribute} to ${String(failedValue)} failed, putting ${String(oldValue)} back: ${message}`)

  // The write back raises the change event again. It is not a request, so
  // note it like a state report: the handler is not called for it.
  notePluginUpdate(endpoint, cluster, { [attribute]: oldValue }, { [attribute]: failedValue })
  try {
    await endpoint.setStateOf(cluster, { [attribute]: oldValue })
  } catch (revertError) {
    log.error(`[${endpoint.id}] Could not put ${cluster}.${attribute} back to ${String(oldValue)}:`, revertError)
  }
}
