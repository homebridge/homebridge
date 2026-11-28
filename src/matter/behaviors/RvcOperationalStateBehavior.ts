/**
 * RvcOperationalState Cluster Behavior
 *
 * Handles robotic vacuum cleaner operational state commands
 */

import { OperationalStateUtils } from '@matter/main/behaviors/operational-state'
import { RvcOperationalStateServer } from '@matter/main/behaviors/rvc-operational-state'
import { RvcOperationalState } from '@matter/main/clusters/rvc-operational-state'

import { registryOf } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

/** The matter.js check of the current state for each command. */
const STATE_CHECKS = {
  pause: OperationalStateUtils.assertRvcPause,
  resume: OperationalStateUtils.assertRvcResume,
  goHome: OperationalStateUtils.assertRvcGoHome,
}

/**
 * Custom RvcOperationalState Server that calls plugin handlers
 */
// The Robotic Vacuum Cleaner device type requires the OperationCompletion event,
// which the cluster itself leaves optional - matter.js 0.18 checks endpoints
// against their device type and flagged every vacuum without it
export class HomebridgeRvcOperationalStateServer extends RvcOperationalStateServer.enable({
  events: { operationCompletion: true },
}) {
  /**
   * Sync current operational state to cache for UI updates
   * Helper method to avoid code duplication across command handlers
   */
  private syncOperationalStateToCache(): void {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)
    const currentState = this.state

    if (currentState.operationalState !== undefined) {
      registry.syncStateToCache(endpointId, 'rvcOperationalState', {
        operationalState: currentState.operationalState,
      })
    }
  }

  /**
   * Handle pause command
   * Pauses the vacuum's current operation
   *
   * @returns Command response with error state
   */
  override async pause(): Promise<RvcOperationalState.OperationalCommandResponse> {
    return this.runOperationalCommand('pause')
  }

  /**
   * Handle resume command
   * Resumes the vacuum's paused operation
   *
   * @returns Command response with error state
   */
  override async resume(): Promise<RvcOperationalState.OperationalCommandResponse> {
    return this.runOperationalCommand('resume')
  }

  /**
   * Handle go home command
   * Sends the vacuum back to its charging dock
   *
   * @returns Command response with error state
   */
  override async goHome(): Promise<RvcOperationalState.OperationalCommandResponse> {
    return this.runOperationalCommand('goHome')
  }

  /**
   * Run one of the operational commands through the plugin's handler.
   *
   * All three commands behave identically: the command is refused in a state
   * Matter does not allow it in, otherwise the plugin handler does the real
   * work (and is expected to report the new state with updateAccessoryState;
   * nothing here changes the operational state, and the base implementation is not
   * called), the resulting state is synced to the cache, and a handler error
   * becomes a proper Matter error response rather than crashing the endpoint.
   * They were three copies of this method before being collapsed.
   */
  private async runOperationalCommand(
    command: 'pause' | 'resume' | 'goHome',
  ): Promise<RvcOperationalState.OperationalCommandResponse> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // Matter names the states each command is not allowed in (a vacuum that
    // is on its dock can not be paused or sent home, one that is stopped can
    // not be paused or resumed, and so on). matter.js has that check; in such
    // a state the command is answered "not valid in this state" and the
    // plugin is not called.
    const refusal = STATE_CHECKS[command](this.state.operationalState)
    if (refusal.commandResponseState.errorStateId !== RvcOperationalState.ErrorState.NoError) {
      return refusal
    }

    // Execute user handler
    const { response } = await registry.runHandler(endpointId, 'rvcOperationalState', command)
    await lockStateForWrite(this)

    // Only reached if handler succeeded. The operational state is the plugin's
    // to report (updateAccessoryState): no base implementation is called, and
    // nothing here checks that the plugin did.

    // Sync state to cache (operational state should be updated by plugin via updateAccessoryState)
    this.syncOperationalStateToCache()

    // The handler may say what is stopping the vacuum (stuck, dust bin
    // missing, ...) by returning the answer itself. With none, all went well.
    const answer = (response as Partial<RvcOperationalState.OperationalCommandResponse> | undefined)?.commandResponseState
    if (typeof answer?.errorStateId === 'number') {
      return { commandResponseState: answer }
    }
    return {
      commandResponseState: {
        errorStateId: RvcOperationalState.ErrorState.NoError,
      },
    }
  }
}
