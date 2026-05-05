/**
 * Matter Protocol Support for Homebridge
 *
 * This module provides Matter protocol support through a Plugin API,
 * allowing plugin developers to explicitly register Matter accessories.
 */

import type {
  ColorControl,
  DoorLock,
  FanControl,
  Groups,
  Identify,
  LevelControl,
  ModeBase,
  OnOff,
  ScenesManagement,
  ServiceArea,
  Thermostat,
  ValveConfigurationAndControl,
  WindowCovering,
} from '@matter/main/clusters'

export { ChildBridgeMatterManager } from './ChildBridgeMatterManager.js'
export type { ClusterHandlerMap } from './clusterHandlerMap.js'
export type { ClusterStateMap } from './clusterStateMap.js'
export { MatterConfigCollector } from './config.js'
export { type MatterConfigValidationResult, MatterConfigValidator } from './configValidator.js'
export { MatterStatus } from './errors.js'
export { MatterBridgeManager } from './MatterBridgeManager.js'
export { MatterServer } from './server.js'
export {
  clusterNames,
  clusters,
  devices,
  deviceTypes,
  type InternalMatterAccessory,
  type MatterAccessory,
  type MatterAccessoryEventEmitter,
  MatterAccessoryEventTypes,
  type MatterClusterHandlers,
  type MatterClusterName,
  type MatterCommandHandler,
  MatterCommissioningError,
  type MatterConfig,
  MatterDeviceError,
  MatterError,
  type MatterErrorDetails,
  MatterErrorType,
  MatterNetworkError,
  MatterStorageError,
} from './types.js'

/**
 * Matter Cluster Command Request Types
 * Use these types for handler arguments to get full type safety
 *
 * @example
 * ```typescript
 * import type { MatterRequests } from 'homebridge'
 *
 * handlers: {
 *   levelControl: {
 *     moveToLevel: async (args: MatterRequests.MoveToLevel) => {
 *       console.log(`Level: ${args.level}`)
 *     }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line ts/no-namespace
export namespace MatterRequests {
  // ============================================================================
  // OnOff Cluster (§1.5)
  // ============================================================================
  export type OffWithEffect = OnOff.OffWithEffectRequest
  export type OnWithTimedOff = OnOff.OnWithTimedOffRequest

  // ============================================================================
  // Level Control Cluster (§1.6)
  // ============================================================================
  export type MoveToLevel = LevelControl.MoveToLevelRequest
  export type Move = LevelControl.MoveRequest
  export type Step = LevelControl.StepRequest
  export type Stop = LevelControl.StopRequest
  export type MoveToClosestFrequency = LevelControl.MoveToClosestFrequencyRequest

  // ============================================================================
  // Color Control Cluster (§3.2)
  // ============================================================================
  export type MoveToHue = ColorControl.MoveToHueRequest
  export type MoveHue = ColorControl.MoveHueRequest
  export type StepHue = ColorControl.StepHueRequest
  export type MoveToSaturation = ColorControl.MoveToSaturationRequest
  export type MoveSaturation = ColorControl.MoveSaturationRequest
  export type StepSaturation = ColorControl.StepSaturationRequest
  export type MoveToHueAndSaturation = ColorControl.MoveToHueAndSaturationRequest
  export type MoveToColor = ColorControl.MoveToColorRequest
  export type MoveColor = ColorControl.MoveColorRequest
  export type StepColor = ColorControl.StepColorRequest
  export type MoveToColorTemperature = ColorControl.MoveToColorTemperatureRequest
  export type MoveColorTemperature = ColorControl.MoveColorTemperatureRequest
  export type StepColorTemperature = ColorControl.StepColorTemperatureRequest
  export type StopMoveStep = ColorControl.StopMoveStepRequest
  export type EnhancedMoveToHue = ColorControl.EnhancedMoveToHueRequest
  export type EnhancedMoveHue = ColorControl.EnhancedMoveHueRequest
  export type EnhancedStepHue = ColorControl.EnhancedStepHueRequest
  export type EnhancedMoveToHueAndSaturation = ColorControl.EnhancedMoveToHueAndSaturationRequest
  export type ColorLoopSet = ColorControl.ColorLoopSetRequest

  // ============================================================================
  // Identify Cluster (§1.2)
  // ============================================================================
  export type IdentifyRequest = Identify.IdentifyRequest
  export type TriggerEffect = Identify.TriggerEffectRequest

  // ============================================================================
  // Groups Cluster (§1.3)
  // ============================================================================
  export type AddGroup = Groups.AddGroupRequest
  export type ViewGroup = Groups.ViewGroupRequest
  export type GetGroupMembership = Groups.GetGroupMembershipRequest
  export type RemoveGroup = Groups.RemoveGroupRequest
  export type AddGroupIfIdentifying = Groups.AddGroupIfIdentifyingRequest

  // ============================================================================
  // Scenes Cluster (§1.4)
  // ============================================================================
  export type AddScene = ScenesManagement.AddSceneRequest
  export type ViewScene = ScenesManagement.ViewSceneRequest
  export type RemoveScene = ScenesManagement.RemoveSceneRequest
  export type RemoveAllScenes = ScenesManagement.RemoveAllScenesRequest
  export type StoreScene = ScenesManagement.StoreSceneRequest
  export type RecallScene = ScenesManagement.RecallSceneRequest
  export type GetSceneMembership = ScenesManagement.GetSceneMembershipRequest
  export type CopyScene = ScenesManagement.CopySceneRequest

  // ============================================================================
  // Door Lock Cluster (§5.2)
  // ============================================================================
  export type LockDoor = DoorLock.LockDoorRequest
  export type UnlockDoor = DoorLock.UnlockDoorRequest
  export type UnlockWithTimeout = DoorLock.UnlockWithTimeoutRequest
  export type UnboltDoor = DoorLock.UnboltDoorRequest
  export type SetUser = DoorLock.SetUserRequest
  export type GetUser = DoorLock.GetUserRequest
  export type ClearUser = DoorLock.ClearUserRequest
  export type SetCredential = DoorLock.SetCredentialRequest
  export type GetCredentialStatus = DoorLock.GetCredentialStatusRequest
  export type ClearCredential = DoorLock.ClearCredentialRequest
  export type SetWeekDaySchedule = DoorLock.SetWeekDayScheduleRequest
  export type GetWeekDaySchedule = DoorLock.GetWeekDayScheduleRequest
  export type ClearWeekDaySchedule = DoorLock.ClearWeekDayScheduleRequest
  export type SetYearDaySchedule = DoorLock.SetYearDayScheduleRequest
  export type GetYearDaySchedule = DoorLock.GetYearDayScheduleRequest
  export type ClearYearDaySchedule = DoorLock.ClearYearDayScheduleRequest
  export type SetHolidaySchedule = DoorLock.SetHolidayScheduleRequest
  export type GetHolidaySchedule = DoorLock.GetHolidayScheduleRequest
  export type ClearHolidaySchedule = DoorLock.ClearHolidayScheduleRequest
  export type SetAliroReaderConfig = DoorLock.SetAliroReaderConfigRequest

  // ============================================================================
  // Window Covering Cluster (§5.3)
  // ============================================================================
  export type GoToLiftPercentage = WindowCovering.GoToLiftPercentageRequest
  export type GoToTiltPercentage = WindowCovering.GoToTiltPercentageRequest

  // ============================================================================
  // Thermostat Cluster (§9.1)
  // ============================================================================
  export type SetpointRaiseLower = Thermostat.SetpointRaiseLowerRequest
  export type SetActivePreset = Thermostat.SetActivePresetRequest
  export type SetActiveSchedule = Thermostat.SetActiveScheduleRequest

  // ============================================================================
  // Fan Control Cluster (§4.4)
  // ============================================================================
  export type FanStep = FanControl.StepRequest

  // ============================================================================
  // Mode Base Cluster (used by RvcRunMode, RvcCleanMode, etc.)
  // ============================================================================
  export type ChangeToMode = ModeBase.ChangeToModeRequest

  // ============================================================================
  // Service Area Cluster (§8.5) - for robotic vacuum cleaners
  // ============================================================================
  export type SelectAreas = ServiceArea.SelectAreasRequest
  export type SkipArea = ServiceArea.SkipAreaRequest

  // ============================================================================
  // Valve Configuration and Control Cluster (§4.6) - for water valves
  // ============================================================================
  export type OpenValve = ValveConfigurationAndControl.OpenRequest
}

/**
 * Matter Cluster Types & Enums
 * Import these to access type-safe enum values for cluster attributes.
 *
 * Only the clusters that are actually used are exported here to minimize startup time.
 * If you need additional clusters, they must be added to the imports in types.ts.
 */
export { clusters as MatterTypes } from './types.js'
