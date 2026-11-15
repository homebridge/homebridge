/**
 * Water Heater Cluster Behaviors
 *
 * WaterHeaterMode (off, manual, timed and so on) and WaterHeaterManagement
 * (boost), the two clusters a Matter water heater carries alongside its
 * heating-only thermostat.
 */

import type { ModeBase } from '@matter/main/clusters'

import { WaterHeaterManagementServer } from '@matter/main/behaviors/water-heater-management'
import { WaterHeaterModeServer } from '@matter/main/behaviors/water-heater-mode'
import { WaterHeaterManagement } from '@matter/main/clusters/water-heater-management'

import { getRegistryManager } from './EndpointContext.js'
import { changeToModeWithHandler } from './handlerResponse.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Custom WaterHeaterMode Server that calls plugin handlers.
 *
 * This tells the plugin first - otherwise a mode picked in a controller changed
 * the cluster and never reached the heater. matter.js's base server validates
 * the mode and records it, but only after the plugin has been told, so the mode
 * is checked here first and the plugin only hears about a mode the device lists.
 */
export class HomebridgeWaterHeaterModeServer extends WaterHeaterModeServer {
  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    return changeToModeWithHandler(this, 'waterHeaterMode', request, () => super.changeToMode(request))
  }
}

/**
 * Default WaterHeaterManagement Server.
 *
 * matter.js's base server leaves boost and cancelBoost unimplemented, so they
 * would fail for every water heater. This records the boost in the cluster
 * state and raises the events the spec requires, so a water heater without
 * handlers still answers.
 */
export class DefaultWaterHeaterManagementServer extends WaterHeaterManagementServer {
  override async boost(request: WaterHeaterManagement.BoostRequest): Promise<void> {
    this.state.boostState = WaterHeaterManagement.BoostState.Active
    this.events.boostStarted?.emit({ boostInfo: request.boostInfo }, this.context)
  }

  override async cancelBoost(): Promise<void> {
    if (this.state.boostState !== WaterHeaterManagement.BoostState.Inactive) {
      this.state.boostState = WaterHeaterManagement.BoostState.Inactive
      this.events.boostEnded?.emit(undefined, this.context)
    }
  }
}

/**
 * Custom WaterHeaterManagement Server that calls plugin handlers. Extends the
 * default so the super calls record the boost.
 */
export class HomebridgeWaterHeaterManagementServer extends DefaultWaterHeaterManagementServer {
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override async boost(request: WaterHeaterManagement.BoostRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    await registry.executeHandler(endpointId, 'waterHeaterManagement', 'boost', request)
    await lockStateForWrite(this)
    await super.boost(request)
    registry.syncStateToCache(endpointId, 'waterHeaterManagement', { boostState: WaterHeaterManagement.BoostState.Active })
  }

  override async cancelBoost(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    await registry.executeHandler(endpointId, 'waterHeaterManagement', 'cancelBoost')
    await lockStateForWrite(this)
    await super.cancelBoost()
    registry.syncStateToCache(endpointId, 'waterHeaterManagement', { boostState: WaterHeaterManagement.BoostState.Inactive })
  }
}
