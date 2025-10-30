/**
 * ServiceArea Cluster Behavior
 *
 * Handles service area selection for robotic vacuum cleaners
 */

import type { ServiceArea } from '@matter/main/clusters'

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { ServiceAreaServer } from '@matter/main/behaviors/service-area'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'

/**
 * Custom ServiceArea Server that calls plugin handlers
 */
export class HomebridgeServiceAreaServer extends ServiceAreaServer {
  private static registry: BehaviorRegistry

  /**
   * Set the behavior registry (called once during server initialization)
   */
  static setRegistry(registry: BehaviorRegistry): void {
    this.registry = registry
  }

  override async selectAreas(request: ServiceArea.SelectAreasRequest): Promise<ServiceArea.SelectAreasResponse> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeServiceAreaServer.registry.executeHandler(endpointId, 'serviceArea', 'selectAreas', request)

      // Only reached if handler succeeded - call base implementation
      return await super.selectAreas(request)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to select areas: ${message}`, Status.Failure)
    }
  }

  override async skipArea(request: ServiceArea.SkipAreaRequest): Promise<ServiceArea.SkipAreaResponse> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeServiceAreaServer.registry.executeHandler(endpointId, 'serviceArea', 'skipArea', request)

      // Only reached if handler succeeded - call base implementation
      return await super.skipArea(request)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to skip area: ${message}`, Status.Failure)
    }
  }
}
