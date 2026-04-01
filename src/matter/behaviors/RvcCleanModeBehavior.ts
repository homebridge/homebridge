/**
 * RvcCleanMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner cleaning mode changes
 */

import type { ModeBase } from '@matter/main/clusters'

import { RvcCleanModeServer } from '@matter/main/behaviors/rvc-clean-mode'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom RvcCleanMode Server that calls plugin handlers
 */
export class HomebridgeRvcCleanModeServer extends RvcCleanModeServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Handle change to mode command
   * Changes the vacuum's cleaning mode (e.g., quick clean, deep clean, spot clean)
   *
   * @param request - Mode change request containing the new mode
   * @returns Response indicating success or failure
   */
  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'rvcCleanMode', 'changeToMode', request)

      // Only reached if handler succeeded - call base implementation
      const result = await super.changeToMode(request)

      // Sync state to cache (the current mode is in request.newMode)
      if (request?.newMode !== undefined) {
        registry.syncStateToCache(endpointId, 'rvcCleanMode', { currentMode: request.newMode })
      }

      return result
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to change clean mode: ${message}`, Status.Failure)
    }
  }
}
