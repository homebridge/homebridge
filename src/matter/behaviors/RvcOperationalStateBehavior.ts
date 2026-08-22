/**
 * RvcOperationalState Cluster Behavior
 *
 * Handles robotic vacuum cleaner operational state commands
 */

import { RvcOperationalStateServer } from '@matter/main/behaviors/rvc-operational-state'
import { RvcOperationalState } from '@matter/main/clusters/rvc-operational-state'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom RvcOperationalState Server that calls plugin handlers
 */
export class HomebridgeRvcOperationalStateServer extends RvcOperationalStateServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Sync current operational state to cache for UI updates
   * Helper method to avoid code duplication across command handlers
   */
  private syncOperationalStateToCache(): void {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()
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
   * All three commands behave identically: the plugin handler does the real
   * work (and updates state via the API, so the base implementation is not
   * called), the resulting state is synced to the cache, and a handler error
   * becomes a proper Matter error response rather than crashing the endpoint.
   * They were three copies of this method before being collapsed.
   */
  private async runOperationalCommand(
    command: 'pause' | 'resume' | 'goHome',
  ): Promise<RvcOperationalState.OperationalCommandResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'rvcOperationalState', command)

      // Only reached if handler succeeded - the plugin handler already
      // updated state via the API, so the base implementation is not called

      // Sync state to cache (operational state should be updated by plugin via updateAccessoryState)
      this.syncOperationalStateToCache()

      return {
        commandResponseState: {
          errorStateId: RvcOperationalState.ErrorState.NoError,
        },
      }
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      const verb = { pause: 'pause', resume: 'resume', goHome: 'go home' }[command]
      throw new StatusResponseError(`Failed to ${verb}: ${message}`, Status.Failure)
    }
  }
}
