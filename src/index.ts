/**
 * Export HAP
 */
import type { API } from "./api";

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
 * Export the const enums from hap-nodejs
 * These get converted to their string value at compile time
 * and can be safely used directly.
 */
export {
  Access,
  CharacteristicEventTypes,
  AccessoryEventTypes,
  AudioBitrate,
  AudioCodecTypes,
  AudioSamplerate,
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  ButtonState,
  ButtonType,
  CameraControllerEvents,
  Categories,
  Codes,
  DataFormatTags,
  DataStreamConnectionEvents,
  DataStreamServerEvents,
  DataStreamStatus,
  DefaultControllerType,
  Formats,
  H264Level,
  H264Profile,
  HAPServerEventTypes,
  Perms,
  Protocols,
  RemoteControllerEvents,
  SRTPCryptoSuites,
  ServiceEventTypes,
  SiriAudioSessionEvents,
  SiriInputType,
  Status,
  StreamRequestTypes,
  TargetCategory,
  TargetUpdates,
  Topics,
  Units,
} from "hap-nodejs";

/**
 * Export all other types from Hap-NodeJS
 */
export type {
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
  CameraController,
  CameraControllerOptions,
  CameraControllerServiceMap,
  CameraStreamingDelegate,
  CameraStreamingOptions,
  Characteristic,
  CharacteristicChange,
  ServiceCharacteristicChange,
  CharacteristicEvents,
  CharacteristicGetCallback,
  CharacteristicGetHandler,
  CharacteristicProps,
  CharacteristicSetCallback,
  CharacteristicSetHandler,
  CharacteristicValue,
  Controller,
  ControllerConstructor,
  ControllerContext,
  ControllerServiceMap,
  ControllerType,
  DataSendCloseReason,
  DataStreamConnection,
  DataStreamManagement,
  DataStreamParser,
  DataStreamProtocolHandler,
  DataStreamReader,
  DataStreamServer,
  DataStreamWriter,
  EMPTY_TLV_TYPE,
  ErrorHandler,
  EventAccessory,
  EventHandler,
  EventService,
  Float32,
  Float64,
  FrameHandler,
  GlobalEventHandler,
  GlobalRequestHandler,
  H264CodecParameters,
  HAPServer,
  HAPStorage,
  HDSStatus,
  HomeKitRemoteController,
  IdentificationCallback,
  Int16,
  Int32,
  Int64,
  Int8,
  LegacyCameraSource,
  LegacyCameraSourceAdapter,
  LegacyTypes,
  MacAddress,
  NodeCallback,
  Nullable,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  PreparedDataStreamSession,
  PreparedStreamRequestCallback,
  PreparedStreamResponse,
  PrimitiveTypes,
  ProxiedSourceResponse,
  PublishInfo,
  RTPProxyOptions,
  RTPStreamManagement,
  RTPTime,
  ReconfigureStreamRequest,
  ReconfiguredVideoInfo,
  RemoteController,
  RemoteControllerServiceMap,
  RequestHandler,
  Resolution,
  ResponseHandler,
  SecondsSince2001,
  SerializableController,
  SerializedAccessory,
  SerializedCharacteristic,
  SerializedControllerContext,
  SerializedControllerState,
  SerializedService,
  SerializedServiceMap,
  Service,
  AccessoryCharacteristicChange,
  ServiceConfigurationChange,
  ServiceId,
  SessionIdentifier,
  SiriAudioSession,
  SiriAudioStreamProducer,
  SiriAudioStreamProducerConstructor,
  SnapshotRequest,
  SnapshotRequestCallback,
  Source,
  SourceResponse,
  StartStreamRequest,
  StateChangeDelegate,
  StopStreamRequest,
  StreamAudioParams,
  StreamController,
  StreamControllerOptions,
  StreamRequest,
  StreamRequestCallback,
  StreamSessionIdentifier,
  StreamVideoParams,
  StreamingRequest,
  SupportedButtonConfiguration,
  SupportedConfiguration,
  TargetConfiguration,
  UUID,
  ValueWrapper,
  VideoCodec,
  VideoInfo,
  VideoStreamingOptions,
  VoidCallback,
  WithUUID,
  clone,
  decode,
  decodeList,
  default,
  encode,
  once,
  readUInt16,
  readUInt32,
  readUInt64,
  uuid,
  writeUInt16,
  writeUInt32,
  writeUInt64,
} from "hap-nodejs";
