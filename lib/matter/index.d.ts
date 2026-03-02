/**
 * Matter Protocol Support for Homebridge
 *
 * This module provides Matter protocol support through a Plugin API,
 * allowing plugin developers to explicitly register Matter accessories.
 */
import type { ColorControl, DoorLock, FanControl, Groups, Identify, LevelControl, ModeBase, OnOff, ScenesManagement, ServiceArea, Thermostat, WindowCovering } from '@matter/main/clusters';
export { ChildBridgeMatterManager } from './ChildBridgeMatterManager.js';
export type { ClusterHandlerMap } from './clusterHandlerMap.js';
export type { ClusterStateMap } from './clusterStateMap.js';
export { MatterConfigCollector } from './config.js';
export { type MatterConfigValidationResult, MatterConfigValidator } from './configValidator.js';
export { MatterStatus } from './errors.js';
export { MatterBridgeManager } from './MatterBridgeManager.js';
export { MatterServer } from './server.js';
export { clusterNames, clusters, devices, deviceTypes, type InternalMatterAccessory, type MatterAccessory, type MatterAccessoryEventEmitter, MatterAccessoryEventTypes, type MatterClusterHandlers, type MatterClusterName, type MatterCommandHandler, MatterCommissioningError, type MatterConfig, MatterDeviceError, MatterError, type MatterErrorDetails, MatterErrorType, MatterNetworkError, MatterStorageError, } from './types.js';
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
export declare namespace MatterRequests {
    type OffWithEffect = OnOff.OffWithEffectRequest;
    type OnWithTimedOff = OnOff.OnWithTimedOffRequest;
    type MoveToLevel = LevelControl.MoveToLevelRequest;
    type Move = LevelControl.MoveRequest;
    type Step = LevelControl.StepRequest;
    type Stop = LevelControl.StopRequest;
    type MoveToClosestFrequency = LevelControl.MoveToClosestFrequencyRequest;
    type MoveToHue = ColorControl.MoveToHueRequest;
    type MoveHue = ColorControl.MoveHueRequest;
    type StepHue = ColorControl.StepHueRequest;
    type MoveToSaturation = ColorControl.MoveToSaturationRequest;
    type MoveSaturation = ColorControl.MoveSaturationRequest;
    type StepSaturation = ColorControl.StepSaturationRequest;
    type MoveToHueAndSaturation = ColorControl.MoveToHueAndSaturationRequest;
    type MoveToColor = ColorControl.MoveToColorRequest;
    type MoveColor = ColorControl.MoveColorRequest;
    type StepColor = ColorControl.StepColorRequest;
    type MoveToColorTemperature = ColorControl.MoveToColorTemperatureRequest;
    type MoveColorTemperature = ColorControl.MoveColorTemperatureRequest;
    type StepColorTemperature = ColorControl.StepColorTemperatureRequest;
    type StopMoveStep = ColorControl.StopMoveStepRequest;
    type EnhancedMoveToHue = ColorControl.EnhancedMoveToHueRequest;
    type EnhancedMoveHue = ColorControl.EnhancedMoveHueRequest;
    type EnhancedStepHue = ColorControl.EnhancedStepHueRequest;
    type EnhancedMoveToHueAndSaturation = ColorControl.EnhancedMoveToHueAndSaturationRequest;
    type ColorLoopSet = ColorControl.ColorLoopSetRequest;
    type IdentifyRequest = Identify.IdentifyRequest;
    type TriggerEffect = Identify.TriggerEffectRequest;
    type AddGroup = Groups.AddGroupRequest;
    type ViewGroup = Groups.ViewGroupRequest;
    type GetGroupMembership = Groups.GetGroupMembershipRequest;
    type RemoveGroup = Groups.RemoveGroupRequest;
    type AddGroupIfIdentifying = Groups.AddGroupIfIdentifyingRequest;
    type AddScene = ScenesManagement.AddSceneRequest;
    type ViewScene = ScenesManagement.ViewSceneRequest;
    type RemoveScene = ScenesManagement.RemoveSceneRequest;
    type RemoveAllScenes = ScenesManagement.RemoveAllScenesRequest;
    type StoreScene = ScenesManagement.StoreSceneRequest;
    type RecallScene = ScenesManagement.RecallSceneRequest;
    type GetSceneMembership = ScenesManagement.GetSceneMembershipRequest;
    type CopyScene = ScenesManagement.CopySceneRequest;
    type LockDoor = DoorLock.LockDoorRequest;
    type UnlockDoor = DoorLock.UnlockDoorRequest;
    type UnlockWithTimeout = DoorLock.UnlockWithTimeoutRequest;
    type UnboltDoor = DoorLock.UnboltDoorRequest;
    type SetUser = DoorLock.SetUserRequest;
    type GetUser = DoorLock.GetUserRequest;
    type ClearUser = DoorLock.ClearUserRequest;
    type SetUserStatus = DoorLock.SetUserStatusRequest;
    type GetUserStatus = DoorLock.GetUserStatusRequest;
    type SetUserType = DoorLock.SetUserTypeRequest;
    type GetUserType = DoorLock.GetUserTypeRequest;
    type SetCredential = DoorLock.SetCredentialRequest;
    type GetCredentialStatus = DoorLock.GetCredentialStatusRequest;
    type ClearCredential = DoorLock.ClearCredentialRequest;
    type SetPinCode = DoorLock.SetPinCodeRequest;
    type GetPinCode = DoorLock.GetPinCodeRequest;
    type ClearPinCode = DoorLock.ClearPinCodeRequest;
    type SetRfidCode = DoorLock.SetRfidCodeRequest;
    type GetRfidCode = DoorLock.GetRfidCodeRequest;
    type ClearRfidCode = DoorLock.ClearRfidCodeRequest;
    type SetWeekDaySchedule = DoorLock.SetWeekDayScheduleRequest;
    type GetWeekDaySchedule = DoorLock.GetWeekDayScheduleRequest;
    type ClearWeekDaySchedule = DoorLock.ClearWeekDayScheduleRequest;
    type SetYearDaySchedule = DoorLock.SetYearDayScheduleRequest;
    type GetYearDaySchedule = DoorLock.GetYearDayScheduleRequest;
    type ClearYearDaySchedule = DoorLock.ClearYearDayScheduleRequest;
    type SetHolidaySchedule = DoorLock.SetHolidayScheduleRequest;
    type GetHolidaySchedule = DoorLock.GetHolidayScheduleRequest;
    type ClearHolidaySchedule = DoorLock.ClearHolidayScheduleRequest;
    type SetAliroReaderConfig = DoorLock.SetAliroReaderConfigRequest;
    type GoToLiftPercentage = WindowCovering.GoToLiftPercentageRequest;
    type GoToTiltPercentage = WindowCovering.GoToTiltPercentageRequest;
    type GoToLiftValue = WindowCovering.GoToLiftValueRequest;
    type GoToTiltValue = WindowCovering.GoToTiltValueRequest;
    type SetpointRaiseLower = Thermostat.SetpointRaiseLowerRequest;
    type SetActivePreset = Thermostat.SetActivePresetRequest;
    type SetActiveSchedule = Thermostat.SetActiveScheduleRequest;
    type GetWeeklySchedule = Thermostat.GetWeeklyScheduleRequest;
    type SetWeeklySchedule = Thermostat.SetWeeklyScheduleRequest;
    type FanStep = FanControl.StepRequest;
    type ChangeToMode = ModeBase.ChangeToModeRequest;
    type SelectAreas = ServiceArea.SelectAreasRequest;
    type SkipArea = ServiceArea.SkipAreaRequest;
}
/**
 * Matter Cluster Types & Enums
 * Import these to access type-safe enum values for cluster attributes.
 *
 * Only the clusters that are actually used are exported here to minimize startup time.
 * If you need additional clusters, they must be added to the imports in types.ts.
 */
export { clusters as MatterTypes } from './types.js';
//# sourceMappingURL=index.d.ts.map