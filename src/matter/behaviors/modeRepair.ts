/**
 * Repair of a saved mode that the device no longer lists.
 *
 * A mode cluster (a robot vacuum's clean mode, a water heater's mode, ...) has
 * a list of supported modes and one current mode. matter.js saves the current
 * mode when it changes, and puts it back at the next start, before the plugin's
 * value. When a plugin update makes the list shorter, the saved mode can be one
 * the list no longer has. matter.js then refuses to start the cluster, and the
 * whole accessory fails to register, at every start (#4057).
 */

import type { Endpoint } from '@matter/main'

import { Logger } from '../../logger.js'
import { declaredClustersOf } from './EndpointContext.js'

const log = Logger.withPrefix('Matter/Behaviors')

interface ModeState {
  supportedModes?: readonly { mode: number }[]
  currentMode?: number
}

/** Whether `mode` is one of the modes in `supportedModes`. */
export function isSupportedMode(supportedModes: unknown, mode: unknown): boolean {
  return Array.isArray(supportedModes) && supportedModes.some(supported => supported?.mode === mode)
}

/**
 * Called by a mode server before matter.js checks its state. A current mode
 * that is not in the list is replaced by the mode the plugin registered the
 * accessory with, or by the first mode in the list when that one is not in the
 * list either.
 *
 * @param behavior - the mode server being started
 * @param behavior.state - its cluster state
 * @param behavior.endpoint - the endpoint it belongs to
 * @param clusterName - the cluster's name in `accessory.clusters`, e.g. `rvcCleanMode`
 */
export function repairCurrentMode(behavior: { state: ModeState, endpoint: Endpoint }, clusterName: string): void {
  const { supportedModes, currentMode } = behavior.state
  if (!Array.isArray(supportedModes) || supportedModes.length === 0 || isSupportedMode(supportedModes, currentMode)) {
    // nothing to repair; an empty list is an error matter.js reports itself
    return
  }
  const registered = declaredClustersOf(behavior.endpoint)?.[clusterName]?.currentMode
  const replacement = isSupportedMode(supportedModes, registered)
    ? registered as number
    : supportedModes[0].mode
  log.debug(`${behavior.endpoint.id}: the saved ${clusterName} mode ${currentMode} is no longer supported, using mode ${replacement}`)
  behavior.state.currentMode = replacement
}
