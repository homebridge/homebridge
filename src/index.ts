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
  H264Level,
  H264Profile,
  HAPServerEventTypes,
  Perms,
  Protocols,
  RemoteControllerEvents,
  ResourceTypes,
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
  Accessory,
  AccessoryLoader,
  Address,
  AudioCodec,
  AudioCodecConfiguration,
  AudioCodecParameters,
  AudioFrame,
  AudioInfo,
  AudioStreamingCodec,
  AudioStreamingOptions,
  Bridge,
  ButtonConfiguration,
  Callback,
  Camera,
  CameraController,
  CameraControllerEventMap,
  CameraControllerOptions,
  CameraControllerServiceMap,
  CameraStreamingDelegate,
  CameraStreamingOptions,
  Characteristic,
  CharacteristicChange,
  CharacteristicData,
  CharacteristicEvents,
  CharacteristicGetCallback,
  CharacteristicProps,
  CharacteristicSetCallback,
  CharacteristicValue,
  CharacteristicsWriteRequest,
  Controller,
  ControllerConstructor,
  ControllerContext,
  ControllerServiceMap,
  ControllerType,
  DataSendCloseReason,
  DataStreamConnection,
  DataStreamConnectionEventMap,
  DataStreamManagement,
  DataStreamParser,
  DataStreamProtocolHandler,
  DataStreamReader,
  DataStreamServer,
  DataStreamServerEventMap,
  DataStreamWriter,
  EMPTY_TLV_TYPE,
  ErrorHandler,
  EventAccessory,
  EventHandler,
  EventService,
  Events,
  Float32,
  Float64,
  Formats,
  FrameHandler,
  GlobalEventHandler,
  GlobalRequestHandler,
  H264CodecParameters,
  HAPEncryption,
  HAPServer,
  HAPStorage,
  HDSStatus,
  HapCharacteristic,
  HapService,
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
  PairingsCallback,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  PrepareWriteRequest,
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
  RemoteControllerEventMap,
  RemoteControllerServiceMap,
  RequestHandler,
  Resolution,
  Resource,
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
  ServiceCharacteristicChange,
  ServiceConfigurationChange,
  ServiceId,
  SessionIdentifier,
  SiriAudioSession,
  SiriAudioSessionEventMap,
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
  ToHAPOptions,
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
  init,
  isSerializableController,
  loadDirectory,
  once,
  parseAccessoryJSON,
  parseCharacteristicJSON,
  parseServiceJSON,
  readUInt16,
  readUInt32,
  readUInt64,
  uuid,
  writeUInt16,
  writeUInt32,
  writeUInt64,
} from "hap-nodejs";
