/**
 * Handlers that answer a command themselves.
 *
 * Some Matter commands answer with a status of their own: a mode change says
 * why the mode can not be used right now, a vacuum says what is stopping it, a
 * key press says the key is not supported. A plugin handler for one of these
 * commands may return that answer. A handler that returns nothing means "done".
 */

import type { Behavior } from '@matter/main'

import { ModeUtils } from '@matter/main/behaviors/mode-base'
import { ModeBase } from '@matter/main/clusters'

import { registryOf } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * The highest status a cluster-level answer has: 0x00 to 0x3F general, 0x40 to
 * 0x7F for the cluster, 0x80 to 0xBF for the maker.
 */
const HIGHEST_ANSWER_STATUS = 0xBF

/**
 * What a handler returned, when it is an answer with a status. Anything else a
 * handler returns is ignored, so an existing handler that happens to return a
 * value changes nothing.
 *
 * An answer is a plain object with a whole-number status in the range above.
 * A handler that ends with `return fetch(url)` or an axios call returns a
 * response with an HTTP status (200 and up): that is not an answer, and before
 * it refused every mode change.
 */
export function statusResponse<T extends { status: number }>(response: unknown): T | undefined {
  if (typeof response !== 'object' || response === null) {
    return undefined
  }
  const prototype = Object.getPrototypeOf(response)
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined
  }
  const status = (response as { status?: unknown }).status
  return typeof status === 'number' && Number.isInteger(status) && status >= 0 && status <= HIGHEST_ANSWER_STATUS
    ? response as T
    : undefined
}

/** The parts of a mode behavior a mode change needs. */
type ModeBehavior = Behavior & {
  state: { supportedModes: ModeBase.ModeOption[], currentMode: number }
}

/**
 * The ChangeToMode command of every mode cluster, with the plugin told first.
 *
 * matter.js validates the mode and records it, but only once the plugin has
 * been told - so the mode is checked here first, and the plugin only hears
 * about a mode the device lists. The handler may refuse the change by
 * returning an answer with a status other than Success (for a vacuum: stuck,
 * battery low, and so on); the mode then stays as it was.
 *
 * @param behavior the mode behavior the command arrived on
 * @param clusterName the cluster name, as used in the plugin API (`rvcRunMode`)
 * @param request the command's request
 * @param applyChange records the new mode in Matter (the matter.js command)
 * @param refuse an extra check before the plugin is told; returns the answer to refuse with
 */
export async function changeToModeWithHandler(
  behavior: ModeBehavior,
  clusterName: string,
  request: ModeBase.ChangeToModeRequest,
  applyChange: () => ModeBase.ChangeToModeResponse | PromiseLike<ModeBase.ChangeToModeResponse>,
  refuse?: () => ModeBase.ChangeToModeResponse | undefined,
): Promise<ModeBase.ChangeToModeResponse> {
  const endpointId = behavior.endpoint.id
  const registry = registryOf(behavior.endpoint)

  // matter.js only checks the mode in its own changeToMode, after the handler has run
  const modeCheck = ModeUtils.assertModeChange(behavior.state.supportedModes, behavior.state.currentMode, request.newMode)
  if (modeCheck.status !== ModeBase.ModeChangeStatus.Success) {
    return modeCheck
  }
  const refused = refuse?.()
  if (refused) {
    return refused
  }

  const { response } = await registry.runHandler(endpointId, clusterName, 'changeToMode', request)
  const answer = statusResponse<ModeBase.ChangeToModeResponse>(response)
  if (answer && answer.status !== ModeBase.ModeChangeStatus.Success) {
    return answer
  }
  await lockStateForWrite(behavior)

  // Only reached if the handler succeeded
  const result = await applyChange()
  registry.syncStateToCache(endpointId, clusterName, { currentMode: request.newMode })
  return result
}
