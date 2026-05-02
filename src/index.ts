/**
 * Export HAP
 */
import type { API } from './api.js'

// noinspection JSUnusedGlobalSymbols
export type HAP = API['hap']

/**
 * Export types for basically everything but the actual API implementation
 */
export type {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  AccessoryPluginConstructor,
  API,
  DynamicPlatformPlugin,
  IndependentPlatformPlugin,
  MatterAPI,
  PlatformIdentifier,
  PlatformName,
  PlatformPluginConstructor,
  PluginIdentifier,
  PluginInitializer,
  PluginName,
  ScopedPluginName,
  StaticPlatformPlugin,
} from './api.js'

/**
 * Export API const enums
 */
export { APIEvent, PluginType } from './api.js'

/**
 * Export bridge types
 */
export type {
  AccessoryConfig,
  BridgeConfiguration,
  HomebridgeConfig,
  PlatformConfig,
} from './bridgeService.js'

/**
 * Export port types
 */
export type { ExternalPortsConfiguration } from './externalPortService.js'

/**
 * Export Logger const enums
 */
export { LogLevel } from './logger.js'

/**
 * Export Logger types
 */
export type { Logger, Logging } from './logger.js'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Matter Protocol - Plugin API Exports
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Matter cache types
 */
export type { SerializedMatterAccessory } from './matter/accessoryCache.js'

/**
 * Matter cluster handler types for type-safe handler definitions
 */
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

/**
 * Matter cluster state map for type-safe state access
 */
export type { ClusterStateMap } from './matter/clusterStateMap.js'

/**
 * Matter cluster state types (per-cluster attribute interfaces)
 */
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

/**
 * Matter cluster command request types namespace for type-safe handlers
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
export { MatterRequests } from './matter/index.js'

/**
 * Matter protocol status errors for plugin handlers
 * @example
 * ```typescript
 * import { MatterStatus } from 'homebridge'
 *
 * handlers: {
 *   onOff: {
 *     on: async () => {
 *       if (deviceIsBusy) {
 *         throw new MatterStatus.Busy('Device is processing another command')
 *       }
 *       // ... control device
 *     }
 *   }
 * }
 * ```
 */
export { MatterStatus } from './matter/index.js'

export type {
  MatterAccessoriesResponse,
  MatterAccessoryInfo,
  MatterBridgeMetadata,
  MatterCommissioningInfo,
  MatterServerConfig,
} from './matter/sharedTypes.js'

export { ChildMatterMessageType, MatterBridgeStatus } from './matter/sharedTypes.js'

/**
 * Matter device-type helper APIs (nested under `api.matter?.<helper>`)
 */
export type { SwitchAPI } from './matter/SwitchAPI.js'

/**
 * Matter accessory and configuration types
 */
export type {
  MatterAccessory,
  MatterClusterHandlers,
  MatterClusterName,
  MatterCommandHandler,
  MatterConfig,
} from './matter/types.js'

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Matter Protocol - UI Integration Types
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Matter device types, clusters, and cluster names
 * Access via api.matter?.deviceTypes, api.matter?.clusters, api.matter?.clusterNames
 */
export { clusterNames, clusters, devices, deviceTypes, MatterAccessoryEventTypes } from './matter/types.js'

/**
 * Matter error types for error handling
 */
export {
  MatterCommissioningError,
  MatterDeviceError,
  MatterError,
  MatterErrorType,
  MatterNetworkError,
  MatterStorageError,
} from './matter/types.js'

export type { EndpointType, MatterErrorDetails } from './matter/types.js'

/**
 * Export Platform Accessory const enums
 */
export { PlatformAccessoryEvent } from './platformAccessory.js'

/**
 * Export Platform Accessory Types
 */
export type { PlatformAccessory, UnknownContext } from './platformAccessory.js'

/**
 * Export server types
 */
export type { HomebridgeOptions } from './server.js'

/**
 * Export User Types
 */
export type { User } from './user.js'

/**
 * Export the CONST ENUMS from hap-nodejs
 * These get converted to their string value at compile time
 * and can be safely used directly.
 */
export {
  Access,
  AccessControlEvent,
  AccessLevel,
  AccessoryEventTypes,
  AdaptiveLightingControllerEvents,
  AdaptiveLightingControllerMode,
  AudioBitrate,
  AudioCodecTypes,
  AudioRecordingCodecType,
  AudioRecordingSamplerate,
  AudioSamplerate,
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  ButtonState,
  ButtonType,
  CameraControllerEvents,
  Categories,
  ChangeReason,
  CharacteristicEventTypes,
  DataFormatTags,
  DataStreamConnectionEvent,
  DataStreamServerEvent,
  DataStreamStatus,
  DefaultControllerType,
  EventTriggerOption,
  Formats,
  H264Level,
  H264Profile,
  HAPServerEventTypes,
  HAPStatus,
  HDSProtocolSpecificErrorReason,
  HDSStatus,
  MediaContainerType,
  PacketDataType,
  Perms,
  Protocols,
  RemoteControllerEvents,
  ResourceRequestReason,
  ServiceEventTypes,
  SiriAudioSessionEvents,
  SRTPCryptoSuites,
  StreamRequestTypes,
  TargetCategory,
  TargetUpdates,
  Topics,
  Units,
} from '@homebridge/hap-nodejs'

/**
 * Export HAP-NodeJS namespaces as type only
 */
export type { DataStreamParser } from '@homebridge/hap-nodejs'

/**
 * Export HAP-NodeJS classes as type only
 */
export type {
  AccessControlManagement,
  AdaptiveLightingController,
  CameraController,
  Characteristic,
  ColorUtils,
  DataStreamConnection,
  DataStreamManagement,
  DataStreamReader,
  DataStreamServer,
  DataStreamWriter,
  DoorbellController,
  HAPServer,
  HapStatusError,
  HAPStorage,
  HDSProtocolError,
  RecordingManagement,
  RemoteController,
  RTPStreamManagement,
  Service,
  SiriAudioSession,
} from '@homebridge/hap-nodejs'

/**
 * Export HAP-NodeJS interfaces as type only
 */
export type {
  ActiveAdaptiveLightingTransition,
  AdaptiveLightingOptions,
  AdaptiveLightingTransitionCurveEntry,
  BrightnessAdjustmentMultiplierRange,
  CameraControllerOptions,
  CameraRecordingConfiguration,
  CameraRecordingDelegate,
  CameraStreamingDelegate,
  CharacteristicOperationContext,
  CharacteristicProps,
  Controller,
  ControllerConstructor,
  ControllerContext,
  ControllerServiceMap,
  DataStreamProtocolHandler,
  DoorbellOptions,
  H264CodecParameters,
  MediaContainerConfiguration,
  ProxiedSourceResponse,
  PublishInfo,
  RecordingManagementState,
  RecordingPacket,
  RTPProxyOptions,
  RTPStreamManagementState,
  SelectedH264CodecParameters,
  SerializableController,
  ServiceConfigurationChange,
  SiriAudioStreamProducer,
  SiriAudioStreamProducerConstructor,
  SourceResponse,
  VideoRecordingOptions,
} from '@homebridge/hap-nodejs'

/**
 * Export HAP-NodeJS type aliases as type only
 */
export type {
  AccessoriesCallback,
  AccessoryCharacteristicChange,
  AdditionalAuthorizationHandler,
  AddPairingCallback,
  AudioCodecConfiguration,
  AudioCodecParameters,
  AudioFrame,
  AudioInfo,
  AudioRecordingCodec,
  AudioRecordingOptions,
  AudioStreamingCodec,
  AudioStreamingOptions,
  ButtonConfiguration,
  CameraRecordingOptions,
  CameraStreamingOptions,
  CharacteristicChange,
  CharacteristicGetCallback,
  CharacteristicGetHandler,
  CharacteristicSetCallback,
  CharacteristicSetHandler,
  CharacteristicValue,
  ConstructorArgs,
  ControllerType,
  ErrorHandler,
  EventHandler,
  FrameHandler,
  GlobalEventHandler,
  GlobalRequestHandler,
  HAPHttpError,
  HAPPincode,
  IdentificationCallback,
  IdentifyCallback,
  InterfaceName,
  IPAddress,
  IPv4Address,
  IPv6Address,
  ListPairingsCallback,
  MacAddress,
  NodeCallback,
  Nullable,
  PairCallback,
  PairingsCallback,
  PartialAllowingNull,
  PreparedDataStreamSession,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  PrimitiveTypes,
  ReadCharacteristicsCallback,
  ReconfiguredVideoInfo,
  ReconfigureStreamRequest,
  RemovePairingCallback,
  RequestHandler,
  Resolution,
  ResourceRequestCallback,
  ResponseHandler,
  RTPTime,
  SerializedServiceMap,
  ServiceCharacteristicChange,
  ServiceId,
  SessionIdentifier,
  SnapshotRequest,
  SnapshotRequestCallback,
  Source,
  StartStreamRequest,
  StateChangeDelegate,
  StopStreamRequest,
  StreamingRequest,
  StreamRequestCallback,
  StreamSessionIdentifier,
  SupportedButtonConfiguration,
  SupportedConfiguration,
  TargetConfiguration,
  TLVEncodable,
  VideoInfo,
  VideoStreamingOptions,
  VoidCallback,
  WithUUID,
  WriteCharacteristicsCallback,
} from '@homebridge/hap-nodejs'

/**
 * Export HAP-NodeJS variables as type only
 */
export type { LegacyTypes, uuid } from '@homebridge/hap-nodejs'

/**
 * Export HAP-NodeJS functions as type only
 */
export type {
  clone,
  decode,
  decodeList,
  decodeWithLists,
  encode,
  epochMillisFromMillisSince2001_01_01,
  epochMillisFromMillisSince2001_01_01Buffer,
  once,
} from '@homebridge/hap-nodejs'
