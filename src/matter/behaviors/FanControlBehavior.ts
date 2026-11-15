/**
 * FanControl Cluster Behavior
 *
 * Handles fan control commands for fans
 */

import { FanControlBehavior, FanControlServer } from '@matter/main/behaviors/fan-control'

import { getRegistryManager } from './EndpointContext.js'
import { isPluginUpdate } from './pluginUpdates.js'
import { revertFailedChange } from './revertFailedChange.js'

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
      // The write is already accepted, so an error can not refuse it any more:
      // put the old value back, so controllers show what the device really does.
      await revertFailedChange(this.endpoint, 'fanControl', 'fanMode', value, oldValue, error)
      registry.syncStateToCache(endpointId, 'fanControl', { fanMode: oldValue })
    }
  }

  async #handlePercentSettingChange(value: number | null, oldValue: number | null): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

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
      // The write is already accepted, so an error can not refuse it any more:
      // put the old value back, so controllers show what the device really does.
      await revertFailedChange(this.endpoint, 'fanControl', 'percentSetting', value, oldValue, error)
      registry.syncStateToCache(endpointId, 'fanControl', { percentSetting: oldValue })
    }
  }
}
