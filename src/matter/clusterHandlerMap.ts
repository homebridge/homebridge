/**
 * Cluster Handler Map
 *
 * Maps Matter cluster names to their typed handler interfaces.
 * Provides IDE autocomplete for plugin developers when defining
 * command handlers on MatterAccessory.handlers.
 *
 * Handler argument types are derived from @matter/main/clusters where possible,
 * so they automatically update when matter.js is bumped.
 *
 * Every handler is optional. A command the plugin has no handler for is not
 * failed: the state changes in Matter and the plugin is not called, as HAP
 * accepts a write to a characteristic that has no onSet. Where another handler
 * can do the job it is called instead, so the plugin still hears about it:
 * a level command reaches the move-to-level handler, and a blind's open or
 * close reaches the go-to-percentage handlers (0 = open, 10000 = closed).
 * A key press with no `sendKey` handler is answered as an unsupported key.
 */

import type { ClosureControl, ColorControl, DeviceEnergyManagement, DoorLock, EnergyEvse, FanControl, Identify, KeypadInput, LevelControl, MediaPlayback, ModeBase, ServiceArea, Thermostat, ValveConfigurationAndControl, WaterHeaterManagement, WindowCovering } from '@matter/main/clusters'

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
  // Optional: without them, these three fall back to the move, step and stop handlers
  moveWithOnOff?: MatterCommandHandler<LevelControl.MoveRequest>
  stepWithOnOff?: MatterCommandHandler<LevelControl.StepRequest>
  stopWithOnOff?: MatterCommandHandler<LevelControl.StopRequest>
}

/**
 * ColorControl cluster handler methods
 *
 * Note: These use simplified argument types that the behavior passes through,
 * not the raw matter.js request types. The behavior files transform the matter.js
 * requests before calling plugin handlers.
 *
 * All are optional. One command from a controller calls one handler:
 * - MoveToHueAndSaturation calls `moveToHueAndSaturationLogic` when the plugin
 *   has it. Without it, `moveToHueLogic` and `moveToSaturationLogic` are called
 *   instead (one each).
 * - `stopAllColorMovement` is called for the StopMoveStep command. It is not
 *   called when a command only switches the color mode.
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
 *
 * Once a handler has returned, Matter holds the new target position, and the
 * current position is set to the target at once: Homebridge does not know how
 * long the motor takes. Controllers then show the covering as already there.
 * A plugin that knows the real position reports it with
 * `updateAccessoryState()` while the covering moves, and again when it stops.
 *
 * A covering that does not know its position (open and close only) gets
 * `upOrOpen` for a go-to-percentage command of 0 and `downOrClose` for any
 * other value, as Matter says.
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
 *
 * The `...Change` handlers are called after a controller (or the Homebridge
 * UI) has written the attribute. They are not called for state the plugin
 * reports itself with `updateAccessoryState()`. The write is already accepted
 * by then, so a handler can not refuse it: when one throws, the error is
 * logged and the old value is put back.
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
  /** For a thermostat with the Occupancy feature: the heating setpoint used while nobody is there. */
  unoccupiedHeatingSetpointChange?: MatterCommandHandler<{
    unoccupiedHeatingSetpoint: number
    oldUnoccupiedHeatingSetpoint: number
  }>
  /** For a thermostat with the Occupancy feature: the cooling setpoint used while nobody is there. */
  unoccupiedCoolingSetpointChange?: MatterCommandHandler<{
    unoccupiedCoolingSetpoint: number
    oldUnoccupiedCoolingSetpoint: number
  }>
  /**
   * Optional. Called for the SetpointRaiseLower command, before the setpoints
   * move. The moves themselves then reach the setpoint-change handlers above
   * as well, with the new values, so a plugin that has those does not need
   * this one.
   */
  setpointRaiseLower?: MatterCommandHandler<Thermostat.SetpointRaiseLowerRequest>
}

/**
 * FanControl cluster handler methods
 *
 * The `...Change` handlers are called after a controller (or the Homebridge
 * UI) has written the attribute. They are not called for state the plugin
 * reports itself with `updateAccessoryState()`. The write is already accepted
 * by then, so a handler can not refuse it: when one throws, the error is
 * logged and the old value is put back.
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
 * ClosureControl cluster handler methods
 *
 * Once `moveTo` has returned, Matter holds the move as finished: the current
 * state is set to the target at once and the main state to Stopped. No
 * MovementCompleted or SecureStateChanged event is raised. A plugin that knows
 * the real state (a garage door takes a while) reports `mainState` and
 * `overallCurrentState` with `updateAccessoryState()` as the closure moves.
 *
 * `stop` is not available on a closure composed with the Instantaneous
 * feature - such a closure reaches its target immediately, so the spec has
 * nothing for Stop to do.
 */
export interface ClosureControlHandlers {
  moveTo?: MatterCommandHandler<ClosureControl.MoveToRequest>
  stop?: MatterCommandHandler
}

/**
 * MediaPlayback cluster handler methods
 *
 * The transport controls a player always has. The feature-gated commands
 * (Rewind and FastForward behind VariableSpeed, Seek behind AdvancedSeek, the
 * track commands behind AudioTracks/TextTracks) are not routed - a plugin that
 * composes those features needs to supply its own behavior for them.
 */
export interface MediaPlaybackHandlers {
  play?: MatterCommandHandler
  pause?: MatterCommandHandler
  stop?: MatterCommandHandler
  startOver?: MatterCommandHandler
  previous?: MatterCommandHandler
  next?: MatterCommandHandler
  skipForward?: MatterCommandHandler<MediaPlayback.SkipForwardRequest>
  skipBackward?: MatterCommandHandler<MediaPlayback.SkipBackwardRequest>
}

/**
 * KeypadInput cluster handler methods
 */
export interface KeypadInputHandlers {
  sendKey?: MatterCommandHandler<KeypadInput.SendKeyRequest>
}

/**
 * ValveConfigurationAndControl cluster handler methods
 *
 * Once `open` has returned, Matter holds the valve as open at once. The
 * request's `openDuration` and `targetLevel` are given to the handler and not
 * used otherwise: `openDuration` and `remainingDuration` are not set, and
 * nothing closes the valve when the time is up. A plugin whose valve closes by
 * itself reports that with `updateAccessoryState()`.
 */
export interface ValveConfigurationAndControlHandlers {
  open?: MatterCommandHandler<ValveConfigurationAndControl.OpenRequest>
  close?: MatterCommandHandler
}

/**
 * WaterHeaterMode cluster handler methods
 */
export interface WaterHeaterModeHandlers {
  changeToMode?: MatterCommandHandler<ModeBase.ChangeToModeRequest>
}

/**
 * WaterHeaterManagement cluster handler methods
 *
 * Once `boost` has returned, `boostState` is Active, and it stays Active:
 * nothing ends the boost when `boostInfo.duration` runs out. The plugin sets
 * `boostState` back to 0 (Inactive) with `updateAccessoryState()` when its
 * heater is done, or a controller sends CancelBoost.
 */
export interface WaterHeaterManagementHandlers {
  boost?: MatterCommandHandler<WaterHeaterManagement.BoostRequest>
  cancelBoost?: MatterCommandHandler
}

/**
 * DeviceEnergyManagement cluster handler methods. Each is optional: one the
 * plugin leaves out is still answered, by recording the request in the state.
 */
export interface DeviceEnergyManagementHandlers {
  powerAdjustRequest?: MatterCommandHandler<DeviceEnergyManagement.PowerAdjustRequest>
  cancelPowerAdjustRequest?: MatterCommandHandler
  pauseRequest?: MatterCommandHandler<DeviceEnergyManagement.PauseRequest>
  resumeRequest?: MatterCommandHandler
  startTimeAdjustRequest?: MatterCommandHandler<DeviceEnergyManagement.StartTimeAdjustRequest>
  modifyForecastRequest?: MatterCommandHandler<DeviceEnergyManagement.ModifyForecastRequest>
  requestConstraintBasedForecast?: MatterCommandHandler<DeviceEnergyManagement.RequestConstraintBasedForecastRequest>
  cancelRequest?: MatterCommandHandler
}

/**
 * DeviceEnergyManagementMode cluster handler methods
 */
export interface DeviceEnergyManagementModeHandlers {
  changeToMode?: MatterCommandHandler<ModeBase.ChangeToModeRequest>
}

/**
 * EnergyEvse (EV charger) cluster handler methods. Each is optional: one the
 * plugin leaves out is still answered, by recording the command in the state.
 * There is no getTargets handler - Homebridge answers it with the targets the
 * last setTargets gave.
 */
export interface EnergyEvseHandlers {
  disable?: MatterCommandHandler
  enableCharging?: MatterCommandHandler<EnergyEvse.EnableChargingRequest>
  enableDischarging?: MatterCommandHandler<EnergyEvse.EnableDischargingRequest>
  startDiagnostics?: MatterCommandHandler
  setTargets?: MatterCommandHandler<EnergyEvse.SetTargetsRequest>
  clearTargets?: MatterCommandHandler
}

/**
 * EnergyEvseMode cluster handler methods
 */
export interface EnergyEvseModeHandlers {
  changeToMode?: MatterCommandHandler<ModeBase.ChangeToModeRequest>
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
  closureControl: ClosureControlHandlers
  mediaPlayback: MediaPlaybackHandlers
  keypadInput: KeypadInputHandlers
  waterHeaterMode: WaterHeaterModeHandlers
  waterHeaterManagement: WaterHeaterManagementHandlers
  deviceEnergyManagement: DeviceEnergyManagementHandlers
  deviceEnergyManagementMode: DeviceEnergyManagementModeHandlers
  energyEvse: EnergyEvseHandlers
  energyEvseMode: EnergyEvseModeHandlers
}
