/**
 * Thermostat Cluster Behavior
 *
 * Handles thermostat commands for heating and cooling systems
 */

import type { Thermostat } from '@matter/main/clusters'

import { ThermostatServer } from '@matter/main/behaviors/thermostat'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom Thermostat Server that calls plugin handlers
 */
export class HomebridgeThermostatServer extends ThermostatServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override initialize(): void {
    super.initialize()

    // React to systemMode attribute changes (off, heat, cool, auto, etc.)
    this.reactTo(this.events.systemMode$Changed, this.#handleSystemModeChange, { offline: true })

    // React to occupiedHeatingSetpoint attribute changes (target heating temperature)
    // Using 'as any' because these events are feature-dependent (Heating/Cooling features)
    // and may not be present in the base events type at compile time
    const events = this.events as any
    if (events.occupiedHeatingSetpoint$Changing) {
      this.reactTo(events.occupiedHeatingSetpoint$Changing, this.#handleOccupiedHeatingSetpointChanging, { offline: true })
    }

    // React to occupiedCoolingSetpoint attribute changes (target cooling temperature)
    if (events.occupiedCoolingSetpoint$Changing) {
      this.reactTo(events.occupiedCoolingSetpoint$Changing, this.#handleOccupiedCoolingSetpointChanging, { offline: true })
    }
  }

  async #handleSystemModeChange(value: number, oldValue: number): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'thermostat',
        'systemModeChange',
        { systemMode: value, oldSystemMode: oldValue },
      )

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'thermostat', { systemMode: value })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to change system mode: ${message}`, Status.Failure)
    }
  }

  async #handleOccupiedHeatingSetpointChanging(value: unknown): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()
    // Using 'as any' because occupiedHeatingSetpoint is feature-dependent (Heating feature)
    const oldValue = (this.state as any).occupiedHeatingSetpoint

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'thermostat',
        'occupiedHeatingSetpointChange',
        { occupiedHeatingSetpoint: value as number, oldOccupiedHeatingSetpoint: oldValue },
      )

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'thermostat', { occupiedHeatingSetpoint: value })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to change heating setpoint: ${message}`, Status.Failure)
    }
  }

  async #handleOccupiedCoolingSetpointChanging(value: unknown): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()
    // Using 'as any' because occupiedCoolingSetpoint is feature-dependent (Cooling feature)
    const oldValue = (this.state as any).occupiedCoolingSetpoint

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'thermostat',
        'occupiedCoolingSetpointChange',
        { occupiedCoolingSetpoint: value as number, oldOccupiedCoolingSetpoint: oldValue },
      )

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'thermostat', { occupiedCoolingSetpoint: value })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to change cooling setpoint: ${message}`, Status.Failure)
    }
  }

  override async setpointRaiseLower(request: Thermostat.SetpointRaiseLowerRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'thermostat', 'setpointRaiseLower', request)

      // Only reached if handler succeeded - update Matter state
      await super.setpointRaiseLower(request)

      // Sync thermostat setpoints to cache
      // Using 'as any' because these properties are feature-dependent (Heating/Cooling features)
      // and may not be present in the base state type at compile time
      const currentState = this.state as any
      const stateUpdate: Record<string, number> = {}
      if (currentState.occupiedCoolingSetpoint !== undefined) {
        stateUpdate.occupiedCoolingSetpoint = currentState.occupiedCoolingSetpoint
      }
      if (currentState.occupiedHeatingSetpoint !== undefined) {
        stateUpdate.occupiedHeatingSetpoint = currentState.occupiedHeatingSetpoint
      }
      registry.syncStateToCache(endpointId, 'thermostat', stateUpdate)
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to adjust setpoint: ${message}`, Status.Failure)
    }
  }
}
