/**
 * The Matter exports of the `homebridge` package, as an entry of their own:
 *
 * ```typescript
 * import { deviceTypes, MatterStatus } from 'homebridge/matter'
 * ```
 *
 * The main entry (`'homebridge'`) exports these values too, and that is what
 * makes it expensive: importing any value from `'homebridge'` loads all of
 * matter.js into the process (about 0.6 s and 150 MB), also on a bridge with
 * Matter switched off. This entry lets a plugin take the Matter values from
 * here and everything else from `'homebridge'`. The Matter value exports of
 * the main entry are deprecated, to be removed from it in a later release.
 *
 * Most plugins need neither: `api.matter` carries the same objects
 * (`api.matter.deviceTypes`, `api.matter.clusters`, `api.matter.status`)
 * with no import at all, and types can be imported from either entry at no
 * cost (`import type`).
 */

export type { SerializedMatterAccessory } from './matter/accessoryCache.js'

export type {
  ClusterHandlerMap,
  ColorControlHandlers,
  DoorLockHandlers,
  FanControlHandlers,
  IdentifyHandlers,
  LevelControlHandlers,
  OnOffHandlers,
  RvcCleanModeHandlers,
  RvcOperationalStateHandlers,
  RvcRunModeHandlers,
  ServiceAreaHandlers,
  ThermostatHandlers,
  WindowCoveringHandlers,
} from './matter/clusterHandlerMap.js'

export type { ClusterStateMap } from './matter/clusterStateMap.js'

export type {
  ColorControlState,
  DoorLockState,
  FanControlState,
  LevelControlState,
  OnOffState,
  RvcCleanModeState,
  RvcOperationalState,
  RvcRunModeState,
  ServiceAreaState,
  ThermostatState,
  WindowCoveringState,
} from './matter/clusterTypes.js'

export { MatterRequests, MatterStatus } from './matter/index.js'

export type {
  MatterAccessoriesResponse,
  MatterAccessoryInfo,
  MatterBridgeMetadata,
  MatterCommissioningInfo,
  MatterServerConfig,
} from './matter/sharedTypes.js'

export { ChildMatterMessageType, MatterBridgeStatus } from './matter/sharedTypes.js'

export type { SwitchAPI } from './matter/SwitchAPI.js'

export type {
  EndpointType,
  MatterAccessory,
  MatterClusterHandlers,
  MatterClusterName,
  MatterCommandHandler,
  MatterConfig,
  MatterErrorDetails,
} from './matter/types.js'

export {
  clusterNames,
  clusters,
  devices,
  deviceTypes,
  MatterAccessoryEventTypes,
  MatterCommissioningError,
  MatterDeviceError,
  MatterError,
  MatterErrorType,
  MatterNetworkError,
  MatterStorageError,
} from './matter/types.js'
