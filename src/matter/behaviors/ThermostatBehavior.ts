/**
 * Thermostat Cluster Behavior
 *
 * Handles thermostat commands for heating and cooling systems
 */

import type { Thermostat } from '@matter/main/clusters'

import { Node } from '@matter/main'
import { ThermostatServer } from '@matter/main/behaviors/thermostat'

import { registryOf } from './EndpointContext.js'
import { isPluginUpdate } from './pluginUpdates.js'
import { revertFailedChange } from './revertFailedChange.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Custom Thermostat Server that calls plugin handlers
 */
export class HomebridgeThermostatServer extends ThermostatServer {
  override async initialize(): Promise<void> {
    // matter.js's own set-up can be async and can fail (it refuses a thermostat
    // whose limits it can not make sense of). Waited for, the failure fails
    // this one registration. Not waited for, nobody caught it, and Node ended
    // Homebridge for an unhandled rejection.
    await super.initialize()

    // React to systemMode attribute changes (off, heat, cool, auto, etc.)
    this.reactTo(this.events.systemMode$Changed, this.#handleSystemModeChange, { offline: true })

    // React to changes of the setpoints (the target temperatures). These use
    // the "changing" event, raised while the write is still being made, where
    // the system mode above uses "changed", raised after it. Either way the
    // reaction runs on its own, after the write was accepted. Which of
    // them exist depends on the features (Heating, Cooling, Occupancy), so the
    // base type does not list their events.
    const events = this.events as unknown as Record<string, Parameters<typeof this.reactTo>[0] | undefined>
    this.maybeReactTo(events.occupiedHeatingSetpoint$Changing, this.#handleOccupiedHeatingSetpointChanging, { offline: true })
    this.maybeReactTo(events.occupiedCoolingSetpoint$Changing, this.#handleOccupiedCoolingSetpointChanging, { offline: true })
    this.maybeReactTo(events.unoccupiedHeatingSetpoint$Changing, this.#handleUnoccupiedHeatingSetpointChanging, { offline: true })
    this.maybeReactTo(events.unoccupiedCoolingSetpoint$Changing, this.#handleUnoccupiedCoolingSetpointChanging, { offline: true })

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
    // Which of these events exist depends on the features, so the base type does not list them
    const events = this.events as unknown as Record<string, Parameters<typeof this.reactTo>[0] | undefined>

    if (!features.localTemperatureNotExposed && state.externalMeasuredIndoorTemperature !== undefined) {
      this.mirrorTemperature(state.externalMeasuredIndoorTemperature)
      this.maybeReactTo(events.externalMeasuredIndoorTemperature$Changed, this.mirrorTemperature)
    }

    if (features.occupancy && state.externallyMeasuredOccupancy !== undefined) {
      this.mirrorOccupancy(state.externallyMeasuredOccupancy)
      this.maybeReactTo(events.externallyMeasuredOccupancy$Changed, this.mirrorOccupancy)
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
    const registry = registryOf(this.endpoint)

    // The plugin reported this change itself (updateAccessoryState): its
    // device is already there, so there is nothing to ask the plugin for.
    if (isPluginUpdate(this.endpoint, 'thermostat', 'systemMode', value)) {
      return
    }

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
      // The write is already accepted, so an error can not refuse it any more:
      // put the old value back, so controllers show what the device really does.
      await revertFailedChange(this.endpoint, 'thermostat', 'systemMode', value, oldValue, error)
      registry.syncStateToCache(endpointId, 'thermostat', { systemMode: oldValue })
    }
  }

  // One reaction per setpoint: matter.js wants each to be a method of its own.
  async #handleOccupiedHeatingSetpointChanging(value: number, oldValue: number): Promise<void> {
    await this.setpointChanging('occupiedHeatingSetpoint', 'oldOccupiedHeatingSetpoint', value, oldValue)
  }

  async #handleOccupiedCoolingSetpointChanging(value: number, oldValue: number): Promise<void> {
    await this.setpointChanging('occupiedCoolingSetpoint', 'oldOccupiedCoolingSetpoint', value, oldValue)
  }

  async #handleUnoccupiedHeatingSetpointChanging(value: number, oldValue: number): Promise<void> {
    await this.setpointChanging('unoccupiedHeatingSetpoint', 'oldUnoccupiedHeatingSetpoint', value, oldValue)
  }

  async #handleUnoccupiedCoolingSetpointChanging(value: number, oldValue: number): Promise<void> {
    await this.setpointChanging('unoccupiedCoolingSetpoint', 'oldUnoccupiedCoolingSetpoint', value, oldValue)
  }

  /**
   * Tell the plugin a setpoint was changed, through its `<setpoint>Change`
   * handler, which is given the new and the old value.
   */
  private async setpointChanging(attribute: string, oldName: string, value: number, oldValue: number): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // The plugin reported this change itself (updateAccessoryState): its
    // device is already there, so there is nothing to ask the plugin for.
    if (isPluginUpdate(this.endpoint, 'thermostat', attribute, value)) {
      return
    }

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'thermostat',
        `${attribute}Change`,
        { [attribute]: value, [oldName]: oldValue },
      )

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'thermostat', { [attribute]: value })
    } catch (error) {
      // The write is already accepted, so an error can not refuse it any more:
      // put the old value back, so controllers show what the device really does.
      await revertFailedChange(this.endpoint, 'thermostat', attribute, value, oldValue, error)
      registry.syncStateToCache(endpointId, 'thermostat', { [attribute]: oldValue })
    }
  }

  override async setpointRaiseLower(request: Thermostat.SetpointRaiseLowerRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // The handler is optional. matter.js moves the setpoints itself, and each
    // move reaches the plugin through its setpoint-change handler, so a plugin
    // with only those handlers needs nothing more for this command.
    if (!registry.getHandler(endpointId, 'thermostat', 'setpointRaiseLower')) {
      return super.setpointRaiseLower(request)
    }

    // Execute user handler
    await registry.executeHandler(endpointId, 'thermostat', 'setpointRaiseLower', request)
    await lockStateForWrite(this)

    // Only reached if handler succeeded - update Matter state
    await super.setpointRaiseLower(request)

    // Sync thermostat setpoints to cache. Which of them exist depends on the
    // features (Heating, Cooling), so the base state type does not list them.
    const currentState = this.state as { occupiedCoolingSetpoint?: number, occupiedHeatingSetpoint?: number }
    const stateUpdate: Record<string, number> = {}
    if (currentState.occupiedCoolingSetpoint !== undefined) {
      stateUpdate.occupiedCoolingSetpoint = currentState.occupiedCoolingSetpoint
    }
    if (currentState.occupiedHeatingSetpoint !== undefined) {
      stateUpdate.occupiedHeatingSetpoint = currentState.occupiedHeatingSetpoint
    }
    registry.syncStateToCache(endpointId, 'thermostat', stateUpdate)
  }
}
