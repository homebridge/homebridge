/**
 * Identify Cluster Behavior
 *
 * Handles identify commands (e.g., flash LED, beep sound)
 */

import type { Identify } from '@matter/main/clusters'

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { IdentifyServer } from '@matter/main/behaviors/identify'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'

/**
 * Custom Identify Server that calls plugin handlers
 */
export class HomebridgeIdentifyServer extends IdentifyServer {
  private static registry: BehaviorRegistry

  /**
   * Set the behavior registry (called once during server initialization)
   */
  static setRegistry(registry: BehaviorRegistry): void {
    this.registry = registry
  }

  override async identify(request: Identify.IdentifyRequest): Promise<void> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeIdentifyServer.registry.executeHandler(endpointId, 'identify', 'identify', request)

      // Only reached if handler succeeded - call base implementation
      return await super.identify(request)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to identify: ${message}`, Status.Failure)
    }
  }
}
