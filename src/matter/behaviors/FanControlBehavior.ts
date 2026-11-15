/**
 * FanControl Cluster Behavior
 *
 * Handles fan control commands for fans
 */

import { FanControlServer } from '@matter/main/behaviors/fan-control'

import { registryOf } from './EndpointContext.js'
import { isPluginUpdate } from './pluginUpdates.js'
import { revertFailedChange } from './revertFailedChange.js'

/**
 * Custom FanControl Server that calls plugin handlers
 */
export class HomebridgeFanControlServer extends FanControlServer {
  override async initialize(): Promise<void> {
    await super.initialize()

    // React to fanMode attribute changes (off, low, medium, high, on, auto, smart)
    this.reactTo(this.events.fanMode$Changed, this.#handleFanModeChange, { offline: true })

    // React to percentSetting attribute changes (the speed asked for, 0 to 100)
    this.reactTo(this.events.percentSetting$Changed, this.#handlePercentSettingChange, { offline: true })
  }

  async #handleFanModeChange(value: number, oldValue: number): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // The plugin reported this change itself (updateAccessoryState): its
    // device is already there, so there is nothing to ask the plugin for.
    if (isPluginUpdate(this.endpoint, 'fanControl', 'fanMode', value)) {
      return
    }

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'fanControl',
        'fanModeChange',
        { fanMode: value, oldFanMode: oldValue },
      )

      // Sync state to cache: only the attribute that changed. Matter does
      // not tie the mode and the speed together (turning the fan off leaves
      // the speed setting as it was), so the cache says what controllers read.
      registry.syncStateToCache(endpointId, 'fanControl', { fanMode: value })
    } catch (error) {
      // The write is already accepted, so an error can not refuse it any more:
      // put the old value back, so controllers show what the device really does.
      await revertFailedChange(this.endpoint, 'fanControl', 'fanMode', value, oldValue, error)
      registry.syncStateToCache(endpointId, 'fanControl', { fanMode: oldValue })
    }
  }

  async #handlePercentSettingChange(value: number | null, oldValue: number | null): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = registryOf(this.endpoint)

    // The plugin reported this change itself (updateAccessoryState): its
    // device is already there, so there is nothing to ask the plugin for.
    if (isPluginUpdate(this.endpoint, 'fanControl', 'percentSetting', value)) {
      return
    }

    try {
      // Execute user handler
      await registry.executeHandler(
        endpointId,
        'fanControl',
        'percentSettingChange',
        { percentSetting: value, oldPercentSetting: oldValue },
      )

      // Sync state to cache: only the attribute that changed. The current
      // speed and the mode are the plugin's to report (updateAccessoryState).
      registry.syncStateToCache(endpointId, 'fanControl', { percentSetting: value })
    } catch (error) {
      // The write is already accepted, so an error can not refuse it any more:
      // put the old value back, so controllers show what the device really does.
      await revertFailedChange(this.endpoint, 'fanControl', 'percentSetting', value, oldValue, error)
      registry.syncStateToCache(endpointId, 'fanControl', { percentSetting: oldValue })
    }
  }
}
