/**
 * ServiceArea Cluster Behavior
 *
 * Handles service area selection for robotic vacuum cleaners
 */

import type { ServiceAreaState } from '../clusterTypes.js'

import { ServiceAreaServer } from '@matter/main/behaviors/service-area'
import { ServiceArea } from '@matter/main/clusters/service-area'

import { getRegistryManager } from './EndpointContext.js'
import { statusResponse } from './handlerResponse.js'
import { lockStateForWrite } from './stateLock.js'

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

    // Check the request first, with matter.js's own rules: an area the
    // device does not have is refused without the plugin being called.
    const { result: checked } = this.assertSelectServiceArea(request)
    if (checked.status !== ServiceArea.SelectAreasStatus.Success) {
      return checked
    }

    // Execute user handler
    // The handler may refuse the selection with an answer of its own
    const { response } = await registry.runHandler(endpointId, 'serviceArea', 'selectAreas', request)
    const answer = statusResponse<ServiceArea.SelectAreasResponse>(response)
    if (answer && answer.status !== ServiceArea.SelectAreasStatus.Success) {
      return answer
    }
    await lockStateForWrite(this)

    // Only reached if handler succeeded - call base implementation
    const result = await super.selectAreas(request)

    // Sync state to cache
    this.syncServiceAreaStateToCache()

    return result
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

    // Check the request first, with matter.js's own rules: an area that is
    // not selected is refused without the plugin being called.
    const result = this.assertSkipServiceArea(request)
    if (result.status !== ServiceArea.SkipAreaStatus.Success) {
      return result
    }

    // Execute user handler
    // The handler may refuse to skip with an answer of its own
    const { response } = await registry.runHandler(endpointId, 'serviceArea', 'skipArea', request)
    const answer = statusResponse<ServiceArea.SkipAreaResponse>(response)
    if (answer && answer.status !== ServiceArea.SkipAreaStatus.Success) {
      return answer
    }
    await lockStateForWrite(this)

    // Only reached if handler succeeded. There is no base implementation to
    // call: matter.js leaves skipArea itself unimplemented (super.skipArea()
    // throws), because what a skip does to the progress and the current area
    // is up to the device. The plugin reports that with updateAccessoryState.

    // Sync state to cache (include progress for skip operations)
    this.syncServiceAreaStateToCache(true)

    return result
  }
}
