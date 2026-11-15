/**
 * EV Charger Cluster Behaviors
 *
 * EnergyEvse is the charger itself: whether charging (and, for a bidirectional
 * charger, discharging) is allowed, up to what current, and the charging
 * targets a controller sets. EnergyEvseMode picks how it decides when to charge.
 */

import type { Behavior } from '@matter/main'

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { EnergyEvseServer } from '@matter/main/behaviors/energy-evse'
import { EnergyEvseModeServer } from '@matter/main/behaviors/energy-evse-mode'
import { ModeUtils } from '@matter/main/behaviors/mode-base'
import { ModeBase } from '@matter/main/clusters'
import { EnergyEvse } from '@matter/main/clusters/energy-evse'
import { Status, StatusResponseError } from '@matter/main/types'

import { getRegistryManager } from './EndpointContext.js'
import { lockStateForWrite } from './stateLock.js'

/**
 * Run the plugin's handler for a command, if it registered one. A charger that
 * only switches charging on and off has no use for the targets commands, so a
 * missing handler falls through to the default behavior instead of failing.
 */
async function runOptionalHandler(behavior: Behavior, registry: BehaviorRegistry, endpointId: string, commandName: string, args?: unknown): Promise<void> {
  if (registry.getHandler(endpointId, 'energyEvse', commandName)) {
    await registry.executeHandler(endpointId, 'energyEvse', commandName, args)
    await lockStateForWrite(behavior)
  }
}

/**
 * Every optional feature, so the commands below exist to override. The device
 * type narrows the endpoint to the features the accessory actually uses - see
 * applyEnergyEvseFeatures in serverHelpers.ts.
 */
const FeatureRichEnergyEvseServer = EnergyEvseServer.with(
  'ChargingPreferences',
  'SoCReporting',
  'PlugAndCharge',
  'Rfid',
  'V2X',
)

/**
 * Charging targets are not an attribute - a controller reads them back with
 * GetTargets - so they are kept here, per endpoint, for the life of the process.
 * A plugin that needs them across a restart keeps them from its setTargets handler.
 */
const chargingTargets = new WeakMap<object, EnergyEvse.ChargingTargetSchedule[]>()

/** The spec only allows diagnostics on a charger that has been disabled first. */
function assertDiagnosticsAllowed(supplyState: EnergyEvse.SupplyState): void {
  if (supplyState !== EnergyEvse.SupplyState.Disabled) {
    throw new StatusResponseError('Diagnostics can only start when the charger is disabled', Status.Failure)
  }
}

/** The attributes the charging and discharging commands change. */
const SYNCED_ATTRIBUTES = [
  'supplyState',
  'chargingEnabledUntil',
  'minimumChargeCurrent',
  'maximumChargeCurrent',
  'dischargingEnabledUntil',
  'maximumDischargeCurrent',
] as const

/**
 * Default EnergyEvse Server.
 *
 * matter.js's base server implements none of the commands, so every one failed -
 * including Disable and EnableCharging, which every charger must support. This
 * records what each command means for the charger's state, so a charger without
 * handlers still answers.
 */
export class DefaultEnergyEvseServer extends FeatureRichEnergyEvseServer {
  override async disable(): Promise<void> {
    // The spec ends charging "now". matter.js keeps these times as Unix seconds
    // and refuses 0 (anything before 2000), so now it is, which has passed
    const now = Math.floor(Date.now() / 1000)
    this.state.supplyState = EnergyEvse.SupplyState.Disabled
    this.state.chargingEnabledUntil = now
    this.state.minimumChargeCurrent = 0
    this.state.maximumChargeCurrent = 0
    if (this.features.v2X) {
      this.state.dischargingEnabledUntil = now
      this.state.maximumDischargeCurrent = 0
    }
  }

  override async enableCharging(request: EnergyEvse.EnableChargingRequest): Promise<void> {
    this.state.chargingEnabledUntil = request.chargingEnabledUntil
    this.state.minimumChargeCurrent = request.minimumChargeCurrent
    this.state.maximumChargeCurrent = request.maximumChargeCurrent
    // Already allowed to discharge as well, so now it may do both
    this.state.supplyState = this.state.supplyState === EnergyEvse.SupplyState.DischargingEnabled || this.state.supplyState === EnergyEvse.SupplyState.Enabled
      ? EnergyEvse.SupplyState.Enabled
      : EnergyEvse.SupplyState.ChargingEnabled
  }

  override async enableDischarging(request: EnergyEvse.EnableDischargingRequest): Promise<void> {
    this.state.dischargingEnabledUntil = request.dischargingEnabledUntil
    this.state.maximumDischargeCurrent = request.maximumDischargeCurrent
    this.state.supplyState = this.state.supplyState === EnergyEvse.SupplyState.ChargingEnabled || this.state.supplyState === EnergyEvse.SupplyState.Enabled
      ? EnergyEvse.SupplyState.Enabled
      : EnergyEvse.SupplyState.DischargingEnabled
  }

  override async startDiagnostics(): Promise<void> {
    assertDiagnosticsAllowed(this.state.supplyState)
    this.state.supplyState = EnergyEvse.SupplyState.DisabledDiagnostics
  }

  override async setTargets(request: EnergyEvse.SetTargetsRequest): Promise<void> {
    chargingTargets.set(this.endpoint, request.chargingTargetSchedules)
  }

  override async getTargets(): Promise<EnergyEvse.GetTargetsResponse> {
    return { chargingTargetSchedules: chargingTargets.get(this.endpoint) ?? [] }
  }

  override async clearTargets(): Promise<void> {
    chargingTargets.delete(this.endpoint)
  }
}

/**
 * Custom EnergyEvse Server that calls plugin handlers. Extends the default so
 * the super calls record each command.
 */
export class HomebridgeEnergyEvseServer extends DefaultEnergyEvseServer {
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Run the plugin's handler, then the default server's command, then sync
   * the attributes the command can change to the cache. The targets commands
   * change no attribute, so they pass `syncState: false`.
   */
  private async run(commandName: string, apply: () => Promise<void>, request?: unknown, syncState = true): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    await runOptionalHandler(this, registry, endpointId, commandName, request)
    await apply()
    if (!syncState) {
      return
    }
    // The discharging attributes only exist on a charger with the V2X feature
    const stateUpdate: Record<string, unknown> = {}
    for (const attribute of SYNCED_ATTRIBUTES) {
      const value = this.state[attribute]
      if (value !== undefined) {
        stateUpdate[attribute] = value
      }
    }
    registry.syncStateToCache(endpointId, 'energyEvse', stateUpdate)
  }

  override async disable(): Promise<void> {
    await this.run('disable', () => super.disable())
  }

  override async enableCharging(request: EnergyEvse.EnableChargingRequest): Promise<void> {
    await this.run('enableCharging', () => super.enableCharging(request), request)
  }

  override async enableDischarging(request: EnergyEvse.EnableDischargingRequest): Promise<void> {
    await this.run('enableDischarging', () => super.enableDischarging(request), request)
  }

  override async startDiagnostics(): Promise<void> {
    // Checked before the plugin is told, so its handler only runs for a
    // request the charger is going to accept
    assertDiagnosticsAllowed(this.state.supplyState)
    await this.run('startDiagnostics', () => super.startDiagnostics())
  }

  override async setTargets(request: EnergyEvse.SetTargetsRequest): Promise<void> {
    await this.run('setTargets', () => super.setTargets(request), request, false)
  }

  override async clearTargets(): Promise<void> {
    await this.run('clearTargets', () => super.clearTargets(), undefined, false)
  }
}

/**
 * Custom EnergyEvseMode Server that calls plugin handlers.
 *
 * matter.js's base server validates the mode and records it, but only after
 * the plugin has been told - so the mode is checked here first, and the plugin
 * only hears about a mode the device lists.
 */
export class HomebridgeEnergyEvseModeServer extends EnergyEvseModeServer {
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override async changeToMode(request: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // matter.js only checks the mode in super.changeToMode, after the handler has run
    const modeCheck = ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, request.newMode)
    if (modeCheck.status !== ModeBase.ModeChangeStatus.Success) {
      return modeCheck
    }

    await registry.executeHandler(endpointId, 'energyEvseMode', 'changeToMode', request)
    await lockStateForWrite(this)

    // Only reached if the handler succeeded
    const result = await super.changeToMode(request)

    if (request?.newMode !== undefined) {
      registry.syncStateToCache(endpointId, 'energyEvseMode', { currentMode: request.newMode })
    }

    return result
  }
}
