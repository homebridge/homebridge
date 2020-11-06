/**
 * Export HAP
 */
import type { API } from "./api";

// noinspection JSUnusedGlobalSymbols
export type HAP = API["hap"];

/**
 * Export API const enums
 */
export {
  APIEvent,
  PluginType,
} from "./api";

/**
 * Export types for basically everything but the actual API implementation
 */
export type {
  PluginIdentifier,
  PluginName,
  ScopedPluginName,
  AccessoryName,
  PlatformName,

  AccessoryIdentifier,
  PlatformIdentifier,

  PluginInitializer,
  AccessoryPluginConstructor,
  AccessoryPlugin,
  PlatformPluginConstructor,
  DynamicPlatformPlugin,
  StaticPlatformPlugin,
  IndependentPlatformPlugin,

  API,
} from "./api";

/**
 * Export Platform Accessory const enums
 */
export {
  PlatformAccessoryEvent,
} from "./platformAccessory";

/**
 * Export Platform Accessory Types
 */
export type {
  PlatformAccessory,
} from "./platformAccessory";

/**
 * Export server types
 */
export type {
  HomebridgeOptions,
  HomebridgeConfig,
  BridgeConfiguration,
  AccessoryConfig,
  PlatformConfig,
  ExternalPortsConfiguration,
} from "./server";

/**
 * Export User Types
 */
export type { User } from "./user";

/**
 * Export Logger const enums
 */
export {
  LogLevel,
} from "./logger";

/**
 * Export Logger types
 */
export type {
  Logger,
  Logging,
} from "./logger";

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
  AmbientLightningControllerEvents,
  AmbientLightningControllerMode,
  AudioBitrate,
  AudioCodecTypes,
  AudioSamplerate,
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  ButtonState,
  ButtonType,
  CameraControllerEvents,
  Categories,
  ChangeReason,
  CharacteristicEventTypes,
  // CharacteristicWarningType,
  DataFormatTags,
  DataSendCloseReason,
  DataStreamConnectionEvents,
  DataStreamServerEvents,
  DataStreamStatus,
  DefaultControllerType,
  Formats,
  H264Level,
  H264Profile,
  // HAPHTTPCode,
  // HAPPairingHTTPCode,
  HAPServerEventTypes,
  HAPStatus,
  HDSStatus,
  Perms,
  Protocols,
  RemoteControllerEvents,
  SRTPCryptoSuites,
  ServiceEventTypes,
  SiriAudioSessionEvents,
  StreamRequestTypes,
  TargetCategory,
  TargetUpdates,
  Topics,
  Units,
} from "hap-nodejs";

/**
 * Export HAP-NodeJS namespaces as type only
 */
export type {
  DataStreamParser,
} from "hap-nodejs";

/**
 * Export HAP-NodeJS classes as type only
 */
export type {
  AccessControlManagement,
  // Accessory,
  AmbientLightningController,
  // Bridge,
  CameraController,
  Characteristic,
  ColorUtils,
  DataStreamConnection,
  DataStreamManagement,
  DataStreamReader,
  DataStreamServer,
  DataStreamWriter,
  DoorbellController,
  // Float32,
  // Float64,
  HAPServer,
  HAPStorage,
  HapStatusError,
  HomeKitRemoteController,
  // Int16,
  // Int32,
  // Int64,
  // Int8,
  LegacyCameraSourceAdapter,
  RTPStreamManagement,
  RemoteController,
  // SecondsSince2001,
  Service,
  SiriAudioSession,
  StreamController,
  // UUID,
  // ValueWrapper,
} from "hap-nodejs";

/**
 * Export HAP-NodeJS interfaces as type only
 */
export type {
  ActiveAmbientLightningTransition,
  AmbientLightningOptions,
  AmbientLightningTransitionCurveEntry,
  BrightnessAdjustmentMultiplierRange,
  CameraControllerOptions,
  CameraStreamingDelegate,
  CharacteristicOperationContext,
  CharacteristicProps,
  Controller,
  ControllerConstructor,
  ControllerContext,
  ControllerServiceMap,
  DataStreamProtocolHandler,
  LegacyCameraSource,
  ProxiedSourceResponse,
  PublishInfo,
  RTPProxyOptions,
  SerializableController,
  ServiceConfigurationChange,
  SiriAudioStreamProducer,
  SiriAudioStreamProducerConstructor,
  SourceResponse,
} from "hap-nodejs";

/**
 * Export HAP-NodeJS type aliases as type only
 */
export type  {
  AccessoriesCallback,
  AccessoryCharacteristicChange,
  AddPairingCallback,
  AdditionalAuthorizationHandler,
  Address,
  AudioCodec,
  AudioCodecConfiguration,
  AudioCodecParameters,
  AudioFrame,
  AudioInfo,
  AudioStreamingCodec,
  AudioStreamingOptions,
  ButtonConfiguration,
  Callback,
  Camera,
  CameraStreamingOptions,
  CharacteristicChange,
  CharacteristicEvents, // TODO remove
  CharacteristicGetCallback,
  CharacteristicGetHandler,
  CharacteristicSetCallback,
  CharacteristicSetHandler,
  CharacteristicValue,
  ControllerType,
  ErrorHandler,
  EventAccessory, // TODO remove
  EventHandler,
  EventService, // TODO remove
  FrameHandler,
  GlobalEventHandler,
  GlobalRequestHandler,
  H264CodecParameters,
  HAPHttpError,
  HAPPincode,
  IPAddress,
  IPv4Address,
  IPv6Address,
  IdentificationCallback,
  IdentifyCallback,
  InterfaceName,
  ListPairingsCallback,
  MacAddress,
  NodeCallback,
  Nullable,
  PairCallback,
  PairingsCallback,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  PreparedDataStreamSession,
  PreparedStreamRequestCallback,
  PreparedStreamResponse,
  PrimitiveTypes,
  RTPTime,
  ReadCharacteristicsCallback,
  ReconfigureStreamRequest,
  ReconfiguredVideoInfo,
  RemovePairingCallback,
  RequestHandler,
  Resolution,
  ResourceRequestCallback,
  ResponseHandler,
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
  StreamAudioParams,
  StreamControllerOptions,
  StreamRequest,
  StreamRequestCallback,
  StreamSessionIdentifier,
  StreamVideoParams,
  StreamingRequest,
  SupportedButtonConfiguration,
  SupportedConfiguration,
  TLVEncodable,
  TargetConfiguration,
  VideoCodec,
  VideoInfo,
  VideoStreamingOptions,
  VoidCallback,
  WithUUID,
  WriteCharacteristicsCallback,
} from "hap-nodejs";

/**
 * Export HAP-NodeJS variables as type only
 */
export type {
  // AccessoryLoader,
  Codes,
  LegacyTypes,
  Status,
  uuid,
} from "hap-nodejs";

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
  // init,
  // isSerializableController,
  // loadDirectory,
  once,
  // parseAccessoryJSON,
  // parseCharacteristicJSON,
  // parseServiceJSON,
  // readUInt16,
  // readUInt32,
  // readUInt64,
  // readUInt64BE,
  // writeUInt16,
  // writeUInt32,
  // writeUInt64,
} from "hap-nodejs";
