/**
 * Thermostat Cluster Behavior
 *
 * Handles thermostat commands for heating and cooling systems
 */

import type { Thermostat } from '@matter/main/clusters'

import { Node } from '@matter/main'
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

    // matter.js links the temperature and occupancy that controllers read to
    // the state a plugin sets only at the moment the node comes online. A
    // thermostat registered after that never gets linked, and Home shows 0
    // degrees for good. That is any thermostat on the main bridge (it goes
    // online before plugins register) and any plugin slow enough to miss a
    // child bridge's start - on a Pi Zero, a plugin that connects to its
    // device first (homebridge-matter#9). So link them here when the node is
    // already online; otherwise matter.js does it itself.
    if (this.nodeIsOnline()) {
      this.linkExternalReadings()
    }
  }

  /** Whether this endpoint's node has already come online. */
  protected nodeIsOnline(): boolean {
    return Node.forEndpoint(this.endpoint).lifecycle.isOnline
  }

  /**
   * What matter.js does for a thermostat when its node comes online, for the
   * state a plugin sets: copy externalMeasuredIndoorTemperature (calibrated)
   * into localTemperature and externallyMeasuredOccupancy into occupancy, and
   * keep them in step. A plugin cannot point at a separate measurement
   * endpoint through Homebridge, so that path is not needed here.
   *
   * ⚠️ The handlers are methods, not arrow functions: matter.js re-resolves a
   * method against the live behavior each time, and a captured arrow function
   * fails with an expired-reference error.
   */
  protected linkExternalReadings(): void {
    const features = this.features as { localTemperatureNotExposed?: boolean, occupancy?: boolean }
    const state = this.state as { externalMeasuredIndoorTemperature?: number | null, externallyMeasuredOccupancy?: boolean }
    const events = this.events as any

    if (!features.localTemperatureNotExposed && state.externalMeasuredIndoorTemperature !== undefined) {
      this.mirrorTemperature(state.externalMeasuredIndoorTemperature)
      this.reactTo(events.externalMeasuredIndoorTemperature$Changed, this.mirrorTemperature)
    }

    if (features.occupancy && state.externallyMeasuredOccupancy !== undefined) {
      this.mirrorOccupancy(state.externallyMeasuredOccupancy)
      this.reactTo(events.externallyMeasuredOccupancy$Changed, this.mirrorOccupancy)
    }
  }

  protected mirrorTemperature(value: unknown): void {
    const state = this.state as { localTemperature?: number | null, localTemperatureCalibration?: number }
    let temperature = value as number | null
    if (temperature !== null && state.localTemperatureCalibration !== undefined) {
      // calibration is in tenths of a degree, temperatures in hundredths
      temperature += state.localTemperatureCalibration * 10
    }
    state.localTemperature = temperature
  }

  protected mirrorOccupancy(occupied: unknown): void {
    (this.state as { occupancy?: { occupied: boolean } }).occupancy = { occupied: occupied as boolean }
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
