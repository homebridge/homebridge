/**
 * Cluster Handler Map
 *
 * Maps Matter cluster names to their typed handler interfaces.
 * Provides IDE autocomplete for plugin developers when defining
 * command handlers on MatterAccessory.handlers.
 *
 * Handler argument types are derived from @matter/main/clusters where possible,
 * so they automatically update when matter.js is bumped.
 */

import type { ColorControl, DoorLock, FanControl, Identify, LevelControl, ModeBase, ServiceArea, Thermostat, ValveConfigurationAndControl, WindowCovering } from '@matter/main/clusters'

import type { MatterCommandHandler } from './types.js'

/**
 * OnOff cluster handler methods
 */
export interface OnOffHandlers {
  on?: MatterCommandHandler
  off?: MatterCommandHandler
  toggle?: MatterCommandHandler
}

/**
 * LevelControl cluster handler methods
 */
export interface LevelControlHandlers {
  moveToLevel?: MatterCommandHandler<LevelControl.MoveToLevelRequest>
  move?: MatterCommandHandler<LevelControl.MoveRequest>
  step?: MatterCommandHandler<LevelControl.StepRequest>
  stop?: MatterCommandHandler<LevelControl.StopRequest>
  moveToLevelWithOnOff?: MatterCommandHandler<LevelControl.MoveToLevelRequest>
}

/**
 * ColorControl cluster handler methods
 *
 * Note: These use simplified argument types that the behavior passes through,
 * not the raw matter.js request types. The behavior files transform the matter.js
 * requests before calling plugin handlers.
 */
export interface ColorControlHandlers {
  moveToColorTemperatureLogic?: MatterCommandHandler<{
    colorTemperatureMireds: number
    transitionTime: number
  }>
  moveToHueAndSaturationLogic?: MatterCommandHandler<{
    hue: number
    saturation: number
    transitionTime: number
  }>
  moveToColorLogic?: MatterCommandHandler<{
    targetX: number
    targetY: number
    transitionTime: number
  }>
  moveToHueLogic?: MatterCommandHandler<{
    targetHue: number
    direction: ColorControl.Direction
    transitionTime: number
    isEnhancedHue: boolean
  }>
  moveToSaturationLogic?: MatterCommandHandler<{
    targetSaturation: number
    transitionTime: number
  }>
  stopAllColorMovement?: MatterCommandHandler
}

/**
 * DoorLock cluster handler methods
 */
export interface DoorLockHandlers {
  lockDoor?: MatterCommandHandler<DoorLock.LockDoorRequest>
  unlockDoor?: MatterCommandHandler<DoorLock.UnlockDoorRequest>
}

/**
 * WindowCovering cluster handler methods
 */
export interface WindowCoveringHandlers {
  upOrOpen?: MatterCommandHandler
  downOrClose?: MatterCommandHandler
  stopMotion?: MatterCommandHandler
  goToLiftPercentage?: MatterCommandHandler<WindowCovering.GoToLiftPercentageRequest>
  goToTiltPercentage?: MatterCommandHandler<WindowCovering.GoToTiltPercentageRequest>
}

/**
 * Thermostat cluster handler methods
 */
export interface ThermostatHandlers {
  systemModeChange?: MatterCommandHandler<{ systemMode: number, oldSystemMode: number }>
  occupiedHeatingSetpointChange?: MatterCommandHandler<{
    occupiedHeatingSetpoint: number
    oldOccupiedHeatingSetpoint: number
  }>
  occupiedCoolingSetpointChange?: MatterCommandHandler<{
    occupiedCoolingSetpoint: number
    oldOccupiedCoolingSetpoint: number
  }>
  setpointRaiseLower?: MatterCommandHandler<Thermostat.SetpointRaiseLowerRequest>
}

/**
 * FanControl cluster handler methods
 */
export interface FanControlHandlers {
  fanModeChange?: MatterCommandHandler<{
    fanMode: FanControl.FanMode
    oldFanMode: FanControl.FanMode
  }>
  percentSettingChange?: MatterCommandHandler<{
    percentSetting: number | null
    oldPercentSetting: number | null
  }>
}

/**
 * Identify cluster handler methods
 */
export interface IdentifyHandlers {
  identify?: MatterCommandHandler<Identify.IdentifyRequest>
}

/**
 * RvcRunMode cluster handler methods
 */
export interface RvcRunModeHandlers {
  changeToMode?: MatterCommandHandler<ModeBase.ChangeToModeRequest>
}

/**
 * RvcCleanMode cluster handler methods
 */
export interface RvcCleanModeHandlers {
  changeToMode?: MatterCommandHandler<ModeBase.ChangeToModeRequest>
}

/**
 * RvcOperationalState cluster handler methods
 */
export interface RvcOperationalStateHandlers {
  pause?: MatterCommandHandler
  resume?: MatterCommandHandler
  goHome?: MatterCommandHandler
}

/**
 * ServiceArea cluster handler methods
 */
export interface ServiceAreaHandlers {
  selectAreas?: MatterCommandHandler<ServiceArea.SelectAreasRequest>
  skipArea?: MatterCommandHandler<ServiceArea.SkipAreaRequest>
}

/**
 * ValveConfigurationAndControl cluster handler methods
 */
export interface ValveConfigurationAndControlHandlers {
  open?: MatterCommandHandler<ValveConfigurationAndControl.OpenRequest>
  close?: MatterCommandHandler
}

/**
 * Maps known cluster names to their typed handler interfaces.
 *
 * Plugin developers get autocomplete for handler methods within each cluster.
 * Handler argument types are derived from matter.js where possible,
 * so they auto-update when the matter.js dependency is bumped.
 *
 * @example
 * ```typescript
 * const accessory: MatterAccessory = {
 *   // ...
 *   handlers: {
 *     onOff: {
 *       on: async () => { await device.turnOn() },
 *       off: async () => { await device.turnOff() },
 *     },
 *     levelControl: {
 *       moveToLevel: async (args) => {
 *         // args is typed as LevelControl.MoveToLevelRequest
 *         await device.setBrightness(args?.level ?? 0)
 *       },
 *     },
 *   },
 * }
 * ```
 */
export interface ClusterHandlerMap {
  onOff: OnOffHandlers
  levelControl: LevelControlHandlers
  colorControl: ColorControlHandlers
  doorLock: DoorLockHandlers
  windowCovering: WindowCoveringHandlers
  thermostat: ThermostatHandlers
  fanControl: FanControlHandlers
  identify: IdentifyHandlers
  rvcRunMode: RvcRunModeHandlers
  rvcCleanMode: RvcCleanModeHandlers
  rvcOperationalState: RvcOperationalStateHandlers
  serviceArea: ServiceAreaHandlers
  valveConfigurationAndControl: ValveConfigurationAndControlHandlers
}
