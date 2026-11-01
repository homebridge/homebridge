/**
 * RvcCleanMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner cleaning mode changes
 */

import { RvcCleanModeServer } from '@matter/main/behaviors/rvc-clean-mode'
import { RvcRunModeBehavior } from '@matter/main/behaviors/rvc-run-mode'
import { ModeBase, RvcRunMode } from '@matter/main/clusters'
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
   * Whether the RvcRunMode cluster's current mode carries the Idle tag.
   * An endpoint without a run mode cluster counts as idle - there is nothing to check against.
   */
  private isRunModeIdle(): boolean {
    const runMode = this.agent.maybeGet(RvcRunModeBehavior)
    if (!runMode) {
      return true
    }
    const { currentMode, supportedModes } = runMode.state
    const current = supportedModes.find(({ mode }) => mode === currentMode)
    return current?.modeTags.some(({ value }) => value === RvcRunMode.ModeTag.Idle) ?? false
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

    // Without DirectModeChange the spec only allows clean-mode changes while the run mode is idle
    if (!(this.features as { directModeChange?: boolean }).directModeChange && !this.isRunModeIdle()) {
      return {
        status: ModeBase.ModeChangeStatus.InvalidInMode,
        statusText: 'Cannot change clean mode while the device is not idle',
      }
    }

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
      const message = error instanceof Error
        ? error.message
        : String(error)
      throw new StatusResponseError(`Failed to change clean mode: ${message}`, Status.Failure)
    }
  }
}
