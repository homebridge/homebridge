/**
 * FanControl Cluster Behavior
 *
 * Handles fan control commands for fans
 */

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { FanControlServer } from '@matter/main/behaviors/fan-control'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'

/**
 * Custom FanControl Server that calls plugin handlers
 */
export class HomebridgeFanControlServer extends FanControlServer {
  private static registry: BehaviorRegistry

  /**
   * Set the behavior registry (called once during server initialization)
   */
  static setRegistry(registry: BehaviorRegistry): void {
    this.registry = registry
  }

  override initialize(): void {
    super.initialize()

    // React to fanMode attribute changes (on/off)
    this.reactTo(this.events.fanMode$Changed, this.#handleFanModeChange)

    // React to percentSetting attribute changes (speed)
    this.reactTo(this.events.percentSetting$Changed, this.#handlePercentSettingChange)
  }

  async #handleFanModeChange(value: number, oldValue: number): Promise<void> {
    const endpointId = this.endpoint.id

    try {
      // Execute user handler
      await HomebridgeFanControlServer.registry.executeHandler(
        endpointId,
        'fanControl',
        'fanModeChange',
        { fanMode: value, oldFanMode: oldValue },
      )

      // Sync state to cache
      HomebridgeFanControlServer.registry.syncStateToCache(endpointId, 'fanControl', { fanMode: value })
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

    try {
      // Execute user handler
      await HomebridgeFanControlServer.registry.executeHandler(
        endpointId,
        'fanControl',
        'percentSettingChange',
        { percentSetting: value, oldPercentSetting: oldValue },
      )

      // Sync state to cache
      HomebridgeFanControlServer.registry.syncStateToCache(endpointId, 'fanControl', {
        percentSetting: value,
        percentCurrent: value,
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
      throw new StatusResponseError(`Failed to change fan speed: ${message}`, Status.Failure)
    }
  }
}
