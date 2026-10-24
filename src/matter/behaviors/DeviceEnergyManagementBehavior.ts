/**
 * Device Energy Management Cluster Behaviors
 *
 * DeviceEnergyManagement lets a controller (or the grid) ask an energy device -
 * a home battery, an EV charger, a heat pump - to change how much power it uses,
 * pause, or start later. DeviceEnergyManagementMode picks how freely it may do so.
 */

import type { ModeBase } from '@matter/main/clusters'

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { DeviceEnergyManagementServer } from '@matter/main/behaviors/device-energy-management'
import { DeviceEnergyManagementModeServer } from '@matter/main/behaviors/device-energy-management-mode'
import { DeviceEnergyManagement } from '@matter/main/clusters/device-energy-management'
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
  const message = error instanceof Error
    ? error.message
    : String(error)
  return new StatusResponseError(`Failed to ${action}: ${message}`, Status.Failure)
}

/**
 * Run the plugin's handler for a command, if it registered one. Every handler
 * here is optional - a battery that can only pause has no use for the forecast
 * commands - so a missing one falls through to the default behavior instead of
 * failing the command.
 */
async function runOptionalHandler(registry: BehaviorRegistry, endpointId: string, clusterName: string, commandName: string, args?: unknown): Promise<void> {
  if (registry.getHandler(endpointId, clusterName, commandName)) {
    await registry.executeHandler(endpointId, clusterName, commandName, args)
  }
}

/**
 * Every optional feature, so the commands below exist to override. The device
 * type narrows the endpoint to the features the accessory actually uses - see
 * applyDeviceEnergyManagementFeatures in serverHelpers.ts.
 */
const FeatureRichDeviceEnergyManagementServer = DeviceEnergyManagementServer.with(
  'PowerAdjustment',
  'PowerForecastReporting',
  'StartTimeAdjustment',
  'Pausable',
  'ForecastAdjustment',
  'ConstraintBasedAdjustment',
)

/**
 * Default DeviceEnergyManagement Server.
 *
 * matter.js's base server implements none of the commands, so every one failed.
 * This records what each request means for the device's state and raises the
 * events the spec requires, so a device without handlers still answers.
 */
export class DefaultDeviceEnergyManagementServer extends FeatureRichDeviceEnergyManagementServer {
  override async powerAdjustRequest(request: DeviceEnergyManagement.PowerAdjustRequest): Promise<void> {
    this.state.esaState = DeviceEnergyManagement.EsaState.PowerAdjustActive
    // The spec has the device say why its power is being adjusted
    this.setAdjustReason(request.cause === DeviceEnergyManagement.AdjustmentCause.GridOptimization
      ? DeviceEnergyManagement.PowerAdjustReason.GridOptimizationAdjustment
      : DeviceEnergyManagement.PowerAdjustReason.LocalOptimizationAdjustment)
    this.events.powerAdjustStart?.emit(undefined, this.context)
  }

  override async cancelPowerAdjustRequest(): Promise<void> {
    if (this.state.esaState === DeviceEnergyManagement.EsaState.PowerAdjustActive) {
      this.state.esaState = DeviceEnergyManagement.EsaState.Online
      this.setAdjustReason(DeviceEnergyManagement.PowerAdjustReason.NoAdjustment)
      this.events.powerAdjustEnd?.emit({ cause: DeviceEnergyManagement.Cause.Cancelled, duration: 0, energyUse: 0 }, this.context)
    }
  }

  /**
   * Record why the power is being adjusted, when the plugin declared the
   * capability it belongs to (it is null while the device cannot be adjusted)
   */
  private setAdjustReason(cause: DeviceEnergyManagement.PowerAdjustReason): void {
    const capability = this.state.powerAdjustmentCapability
    if (capability) {
      this.state.powerAdjustmentCapability = { ...capability, cause }
    }
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  override async pauseRequest(request: DeviceEnergyManagement.PauseRequest): Promise<void> {
    this.state.esaState = DeviceEnergyManagement.EsaState.Paused
    this.events.paused?.emit(undefined, this.context)
  }

  override async resumeRequest(): Promise<void> {
    if (this.state.esaState === DeviceEnergyManagement.EsaState.Paused) {
      this.state.esaState = DeviceEnergyManagement.EsaState.Online
      this.events.resumed?.emit({ cause: DeviceEnergyManagement.Cause.Cancelled }, this.context)
    }
  }

  // The forecast commands change a forecast only the device can work out, so
  // without a handler they are accepted and the plugin's next forecast stands.
  // eslint-disable-next-line unused-imports/no-unused-vars
  override async startTimeAdjustRequest(request: DeviceEnergyManagement.StartTimeAdjustRequest): Promise<void> {}

  // eslint-disable-next-line unused-imports/no-unused-vars
  override async modifyForecastRequest(request: DeviceEnergyManagement.ModifyForecastRequest): Promise<void> {}

  // eslint-disable-next-line unused-imports/no-unused-vars
  override async requestConstraintBasedForecast(request: DeviceEnergyManagement.RequestConstraintBasedForecastRequest): Promise<void> {}

  override async cancelRequest(): Promise<void> {
    // Undoes whichever adjustment is running
    if (this.state.esaState === DeviceEnergyManagement.EsaState.PowerAdjustActive) {
      await this.cancelPowerAdjustRequest()
    } else if (this.state.esaState === DeviceEnergyManagement.EsaState.Paused) {
      await this.resumeRequest()
    }
  }
}

/**
 * Custom DeviceEnergyManagement Server that calls plugin handlers. Extends the
 * default so the super calls record each request.
 */
export class HomebridgeDeviceEnergyManagementServer extends DefaultDeviceEnergyManagementServer {
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  private async run(commandName: string, action: string, apply: () => Promise<void>, request?: unknown): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      await runOptionalHandler(registry, endpointId, 'deviceEnergyManagement', commandName, request)
      await apply()
      registry.syncStateToCache(endpointId, 'deviceEnergyManagement', { esaState: this.state.esaState })
    } catch (error) {
      throw asStatusError(error, action)
    }
  }

  override async powerAdjustRequest(request: DeviceEnergyManagement.PowerAdjustRequest): Promise<void> {
    await this.run('powerAdjustRequest', 'adjust power', () => super.powerAdjustRequest(request), request)
  }

  override async cancelPowerAdjustRequest(): Promise<void> {
    await this.run('cancelPowerAdjustRequest', 'cancel the power adjustment', () => super.cancelPowerAdjustRequest())
  }

  override async pauseRequest(request: DeviceEnergyManagement.PauseRequest): Promise<void> {
    await this.run('pauseRequest', 'pause', () => super.pauseRequest(request), request)
  }

  override async resumeRequest(): Promise<void> {
    await this.run('resumeRequest', 'resume', () => super.resumeRequest())
  }

  override async startTimeAdjustRequest(request: DeviceEnergyManagement.StartTimeAdjustRequest): Promise<void> {
    await this.run('startTimeAdjustRequest', 'adjust the start time', () => super.startTimeAdjustRequest(request), request)
  }

  override async modifyForecastRequest(request: DeviceEnergyManagement.ModifyForecastRequest): Promise<void> {
    await this.run('modifyForecastRequest', 'modify the forecast', () => super.modifyForecastRequest(request), request)
  }

  override async requestConstraintBasedForecast(request: DeviceEnergyManagement.RequestConstraintBasedForecastRequest): Promise<void> {
    await this.run('requestConstraintBasedForecast', 'apply the constraints', () => super.requestConstraintBasedForecast(request), request)
  }

  override async cancelRequest(): Promise<void> {
    // Not routed through run(): super.cancelRequest() calls the overridden
    // cancel/resume methods, which ask the plugin themselves
    const endpointId = this.endpoint.id
    try {
      await runOptionalHandler(this.getRegistry(), endpointId, 'deviceEnergyManagement', 'cancelRequest')
      await super.cancelRequest()
    } catch (error) {
      throw asStatusError(error, 'cancel the request')
    }
  }
}

/**
 * Custom DeviceEnergyManagementMode Server that calls plugin handlers.
 *
 * matter.js's base server already validates the mode and records it, so this
 * only has to tell the plugin first.
 */
export class HomebridgeDeviceEnergyManagementModeServer extends DeviceEnergyManagementModeServer {
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      await registry.executeHandler(endpointId, 'deviceEnergyManagementMode', 'changeToMode', request)

      // Only reached if the handler succeeded
      const result = await super.changeToMode(request)

      if (request?.newMode !== undefined) {
        registry.syncStateToCache(endpointId, 'deviceEnergyManagementMode', { currentMode: request.newMode })
      }

      return result
    } catch (error) {
      throw asStatusError(error, 'change energy management mode')
    }
  }
}
