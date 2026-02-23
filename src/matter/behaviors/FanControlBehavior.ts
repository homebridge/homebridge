/**
 * FanControl Cluster Behavior
 *
 * Handles fan control commands for fans
 */

import { FanControlBehavior, FanControlServer } from '@matter/main/behaviors/fan-control'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom FanControl Server that calls plugin handlers
 */
export class HomebridgeFanControlServer extends FanControlServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override initialize(): void {
    super.initialize()

    // React to fanMode attribute changes (on/off)
    this.reactTo(this.events.fanMode$Changed, this.#handleFanModeChange, { offline: true })

    // React to percentSetting attribute changes (speed)
    this.reactTo(this.events.percentSetting$Changed, this.#handlePercentSettingChange, { offline: true })
  }

  async #handleFanModeChange(value: number, oldValue: number): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'fanControl',
        'fanModeChange',
        { fanMode: value, oldFanMode: oldValue },
      )

      // Sync state to cache
      // When turning off (fanMode = 0), also set percentSetting and percentCurrent to 0
      // This ensures the UI correctly reflects the off state
      const stateUpdate: Partial<FanControlBehavior.State> = { fanMode: value }
      if (value === 0) {
        stateUpdate.percentSetting = 0
        stateUpdate.percentCurrent = 0
      }
      registry.syncStateToCache(endpointId, 'fanControl', stateUpdate)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to change fan mode: ${message}`, Status.Failure)
    }
  }

  async #handlePercentSettingChange(value: number | null, oldValue: number | null): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'fanControl',
        'percentSettingChange',
        { percentSetting: value, oldPercentSetting: oldValue },
      )

      // Sync state to cache
      // When setting to 0%, also set fanMode to 0 (Off) for UI consistency
      const stateUpdate: Partial<FanControlBehavior.State> = {
        percentSetting: value ?? undefined,
        percentCurrent: value ?? undefined,
      }
      if (value === 0) {
        stateUpdate.fanMode = 0
      }
      registry.syncStateToCache(endpointId, 'fanControl', stateUpdate)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to change fan speed: ${message}`, Status.Failure)
    }
  }
}
