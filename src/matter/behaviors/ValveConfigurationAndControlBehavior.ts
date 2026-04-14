/**
 * ValveConfigurationAndControl Cluster Behavior
 *
 * Handles open/close commands for water valves and irrigation controllers.
 */

import { ValveConfigurationAndControlServer } from '@matter/main/behaviors/valve-configuration-and-control'
import { ValveConfigurationAndControl } from '@matter/main/clusters/valve-configuration-and-control'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom ValveConfigurationAndControl Server that calls plugin handlers.
 */
export class HomebridgeValveConfigurationAndControlServer extends ValveConfigurationAndControlServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Handle 'open' command
   */
  override async open(request: ValveConfigurationAndControl.OpenRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'valveConfigurationAndControl', 'open', request)

      // Only reached if handler succeeded - update Matter state via super
      await super.open(request)

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'valveConfigurationAndControl', {
        currentState: ValveConfigurationAndControl.ValveState.Open,
        targetState: ValveConfigurationAndControl.ValveState.Open,
      })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to open valve: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle 'close' command
   */
  override async close(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'valveConfigurationAndControl', 'close')

      // Only reached if handler succeeded - update Matter state via super
      await super.close()

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'valveConfigurationAndControl', {
        currentState: ValveConfigurationAndControl.ValveState.Closed,
        targetState: ValveConfigurationAndControl.ValveState.Closed,
      })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to close valve: ${message}`, Status.Failure)
    }
  }
}
