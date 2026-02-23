/**
 * Identify Cluster Behavior
 *
 * Handles identify commands (e.g., flash LED, beep sound)
 */

import type { Identify } from '@matter/main/clusters'

import { IdentifyServer } from '@matter/main/behaviors/identify'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom Identify Server that calls plugin handlers
 */
export class HomebridgeIdentifyServer extends IdentifyServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override async identify(request: Identify.IdentifyRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'identify', 'identify', request)

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
