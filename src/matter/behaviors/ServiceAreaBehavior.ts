/**
 * ServiceArea Cluster Behavior
 *
 * Handles service area selection for robotic vacuum cleaners
 */

import type { ServiceArea } from '@matter/main/clusters'

import type { ServiceAreaState } from '../clusterTypes.js'

import { ServiceAreaServer } from '@matter/main/behaviors/service-area'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom ServiceArea Server that calls plugin handlers
 */
export class HomebridgeServiceAreaServer extends ServiceAreaServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Sync current service area state to cache for UI updates
   * Helper method to avoid code duplication
   *
   * @param includeProgress - Whether to include progress information in the sync
   */
  private syncServiceAreaStateToCache(includeProgress = false): void {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()
    const currentState = this.state as ServiceAreaState
    const stateUpdate: Partial<ServiceAreaState> = {}

    if (currentState.selectedAreas !== undefined) {
      stateUpdate.selectedAreas = currentState.selectedAreas
    }
    if (currentState.currentArea !== undefined) {
      stateUpdate.currentArea = currentState.currentArea
    }
    if (includeProgress && currentState.progress !== undefined) {
      stateUpdate.progress = currentState.progress
    }

    if (Object.keys(stateUpdate).length > 0) {
      registry.syncStateToCache(endpointId, 'serviceArea', stateUpdate)
    }
  }

  /**
   * Handle select areas command
   * Allows user to select which areas the vacuum should clean
   *
   * @param request - Area selection request with area IDs to clean
   * @returns Response indicating success or failure
   */
  override async selectAreas(request: ServiceArea.SelectAreasRequest): Promise<ServiceArea.SelectAreasResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'serviceArea', 'selectAreas', request)

      // Only reached if handler succeeded - call base implementation
      const result = await super.selectAreas(request)

      // Sync state to cache
      this.syncServiceAreaStateToCache()

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
      throw new StatusResponseError(`Failed to select areas: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle skip area command
   * Allows user to skip cleaning a specific area
   *
   * @param request - Skip area request with area ID to skip
   * @returns Response indicating success or failure
   */
  override async skipArea(request: ServiceArea.SkipAreaRequest): Promise<ServiceArea.SkipAreaResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'serviceArea', 'skipArea', request)

      // Only reached if handler succeeded - call base implementation
      const result = await super.skipArea(request)

      // Sync state to cache (include progress for skip operations)
      this.syncServiceAreaStateToCache(true)

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
      throw new StatusResponseError(`Failed to skip area: ${message}`, Status.Failure)
    }
  }
}
