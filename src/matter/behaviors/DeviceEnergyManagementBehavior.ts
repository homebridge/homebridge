/**
 * Device Energy Management Cluster Behaviors
 *
 * DeviceEnergyManagement lets a controller (or the grid) ask an energy device -
 * a home battery, an EV charger, a heat pump - to change how much power it uses,
 * pause, or start later. DeviceEnergyManagementMode picks how freely it may do so.
 */

import type { Behavior } from '@matter/main'
import type { ModeBase } from '@matter/main/clusters'

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { DeviceEnergyManagementServer } from '@matter/main/behaviors/device-energy-management'
import { DeviceEnergyManagementModeServer } from '@matter/main/behaviors/device-energy-management-mode'
import { DeviceEnergyManagement } from '@matter/main/clusters/device-energy-management'

import { getRegistryManager } from './EndpointContext.js'
import { changeToModeWithHandler } from './handlerResponse.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Run the plugin's handler for a command, if it registered one. Every handler
 * here is optional - a battery that can only pause has no use for the forecast
 * commands - so a missing one falls through to the default behavior instead of
 * failing the command.
 */
async function runOptionalHandler(behavior: Behavior, registry: BehaviorRegistry, endpointId: string, clusterName: string, commandName: string, args?: unknown): Promise<void> {
  if (registry.getHandler(endpointId, clusterName, commandName)) {
    await registry.executeHandler(endpointId, clusterName, commandName, args)
    await lockStateForWrite(behavior)
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

  // CancelRequest withdraws an earlier change to the forecast (StartTimeAdjust,
  // ModifyForecast, RequestConstraintBasedForecast). It does not end a power
  // adjustment or a pause: those have CancelPowerAdjustRequest and
  // ResumeRequest. Like the forecast commands it is accepted, and the plugin's
  // next forecast stands.
  override async cancelRequest(): Promise<void> {}
}

/**
 * Custom DeviceEnergyManagement Server that calls plugin handlers. Extends the
 * default so the super calls record each request.
 */
export class HomebridgeDeviceEnergyManagementServer extends DefaultDeviceEnergyManagementServer {
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  private async run(commandName: string, apply: () => Promise<void>, request?: unknown): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    await runOptionalHandler(this, registry, endpointId, 'deviceEnergyManagement', commandName, request)
    await apply()
    // A power adjustment also records its reason, in powerAdjustmentCapability
    // (which only exists with the PowerAdjustment feature)
    const capability = this.state.powerAdjustmentCapability
    registry.syncStateToCache(endpointId, 'deviceEnergyManagement', {
      esaState: this.state.esaState,
      ...(capability !== undefined
        ? { powerAdjustmentCapability: capability }
        : {}),
    })
  }

  override async powerAdjustRequest(request: DeviceEnergyManagement.PowerAdjustRequest): Promise<void> {
    await this.run('powerAdjustRequest', () => super.powerAdjustRequest(request), request)
  }

  override async cancelPowerAdjustRequest(): Promise<void> {
    await this.run('cancelPowerAdjustRequest', () => super.cancelPowerAdjustRequest())
  }

  override async pauseRequest(request: DeviceEnergyManagement.PauseRequest): Promise<void> {
    await this.run('pauseRequest', () => super.pauseRequest(request), request)
  }

  override async resumeRequest(): Promise<void> {
    await this.run('resumeRequest', () => super.resumeRequest())
  }

  override async startTimeAdjustRequest(request: DeviceEnergyManagement.StartTimeAdjustRequest): Promise<void> {
    await this.run('startTimeAdjustRequest', () => super.startTimeAdjustRequest(request), request)
  }

  override async modifyForecastRequest(request: DeviceEnergyManagement.ModifyForecastRequest): Promise<void> {
    await this.run('modifyForecastRequest', () => super.modifyForecastRequest(request), request)
  }

  override async requestConstraintBasedForecast(request: DeviceEnergyManagement.RequestConstraintBasedForecastRequest): Promise<void> {
    await this.run('requestConstraintBasedForecast', () => super.requestConstraintBasedForecast(request), request)
  }

  override async cancelRequest(): Promise<void> {
    await this.run('cancelRequest', () => super.cancelRequest())
  }
}

/**
 * Custom DeviceEnergyManagementMode Server that calls plugin handlers.
 *
 * matter.js's base server validates the mode and records it, but only after
 * the plugin has been told - so the mode is checked here first, and the plugin
 * only hears about a mode the device lists.
 */
export class HomebridgeDeviceEnergyManagementModeServer extends DeviceEnergyManagementModeServer {
  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    return changeToModeWithHandler(this, 'deviceEnergyManagementMode', request, () => super.changeToMode(request))
  }
}
