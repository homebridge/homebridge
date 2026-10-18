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
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Wrap a handler failure the way every Homebridge behavior does: a Matter
 * status the plugin threw on purpose goes back to the controller as it is,
 * anything else becomes a plain Failure so the endpoint stays up.
 */
function asStatusError(error: unknown, action: string): unknown {
  if (MatterStatus.isMatterProtocolError(error)) {
    return error
  }
  const message = error instanceof Error ? error.message : String(error)
  return new StatusResponseError(`Failed to ${action}: ${message}`, Status.Failure)
}

/**
 * Custom WaterHeaterMode Server that calls plugin handlers.
 *
 * matter.js's base server already validates the mode and records it, so this
 * only has to tell the plugin first - otherwise a mode picked in a controller
 * changed the cluster and never reached the heater.
 */
export class HomebridgeWaterHeaterModeServer extends WaterHeaterModeServer {
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      await registry.executeHandler(endpointId, 'waterHeaterMode', 'changeToMode', request)

      // Only reached if the handler succeeded
      const result = await super.changeToMode(request)

      if (request?.newMode !== undefined) {
        registry.syncStateToCache(endpointId, 'waterHeaterMode', { currentMode: request.newMode })
      }

      return result
    } catch (error) {
      throw asStatusError(error, 'change water heater mode')
    }
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

    try {
      await registry.executeHandler(endpointId, 'waterHeaterManagement', 'boost', request)
      await super.boost(request)
      registry.syncStateToCache(endpointId, 'waterHeaterManagement', { boostState: WaterHeaterManagement.BoostState.Active })
    } catch (error) {
      throw asStatusError(error, 'boost water heater')
    }
  }

  override async cancelBoost(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      await registry.executeHandler(endpointId, 'waterHeaterManagement', 'cancelBoost')
      await super.cancelBoost()
      registry.syncStateToCache(endpointId, 'waterHeaterManagement', { boostState: WaterHeaterManagement.BoostState.Inactive })
    } catch (error) {
      throw asStatusError(error, 'cancel water heater boost')
    }
  }
}
