/**
 * RvcCleanMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner cleaning mode changes
 */

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { RvcCleanModeServer } from '@matter/main/behaviors/rvc-clean-mode'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'

/**
 * Custom RvcCleanMode Server that calls plugin handlers
 */
export class HomebridgeRvcCleanModeServer extends RvcCleanModeServer {
  private static registry: BehaviorRegistry

  /**
   * Set the behavior registry (called once during server initialization)
   */
  static setRegistry(registry: BehaviorRegistry): void {
    this.registry = registry
  }

  override async changeToMode(request: any): Promise<any> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeRvcCleanModeServer.registry.executeHandler(endpointId, 'rvcCleanMode', 'changeToMode', request)

      // Only reached if handler succeeded - call base implementation
      return await super.changeToMode(request)
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
