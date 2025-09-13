/**
 * Export HAP
 */
import type { API } from './api.js';
export type HAP = API['hap'];
/**
 * Export types for basically everything but the actual API implementation
 */
export type { AccessoryIdentifier, AccessoryName, AccessoryPlugin, AccessoryPluginConstructor, API, DynamicPlatformPlugin, IndependentPlatformPlugin, PlatformIdentifier, PlatformName, PlatformPluginConstructor, PluginIdentifier, PluginInitializer, PluginName, ScopedPluginName, StaticPlatformPlugin, } from './api.js';
/**
 * Export API const enums
 */
export { APIEvent, PluginType } from './api.js';
/**
 * Export bridge types
 */
export type { AccessoryConfig, BridgeConfiguration, HomebridgeConfig, PlatformConfig, } from './bridgeService.js';
/**
 * Export port types
 */
export type { ExternalPortsConfiguration } from './externalPortService.js';
/**
 * Export Logger const enums
 */
export { LogLevel } from './logger.js';
/**
 * Export Logger types
 */
export type { Logger, Logging } from './logger.js';
/**
 * Export Platform Accessory const enums
 */
export { PlatformAccessoryEvent } from './platformAccessory.js';
/**
 * Export Platform Accessory Types
 */
export type { PlatformAccessory, UnknownContext } from './platformAccessory.js';
/**
 * Export server types
 */
export type { HomebridgeOptions } from './server.js';
/**
 * Export User Types
 */
export type { User } from './user.js';
/**
 * Export the CONST ENUMS from hap-nodejs
 * These get converted to their string value at compile time
 * and can be safely used directly.
 */
export { Access, AccessControlEvent, AccessLevel, AccessoryEventTypes, AdaptiveLightingControllerEvents, AdaptiveLightingControllerMode, AudioBitrate, AudioCodecTypes, AudioRecordingCodecType, AudioRecordingSamplerate, AudioSamplerate, AudioStreamingCodecType, AudioStreamingSamplerate, ButtonState, ButtonType, CameraControllerEvents, Categories, ChangeReason, CharacteristicEventTypes, DataFormatTags, DataStreamConnectionEvent, DataStreamServerEvent, DataStreamStatus, DefaultControllerType, EventTriggerOption, Formats, H264Level, H264Profile, HAPServerEventTypes, HAPStatus, HDSProtocolSpecificErrorReason, HDSStatus, MediaContainerType, PacketDataType, Perms, Protocols, RemoteControllerEvents, ResourceRequestReason, ServiceEventTypes, SiriAudioSessionEvents, SRTPCryptoSuites, StreamRequestTypes, TargetCategory, TargetUpdates, Topics, Units, } from 'hap-nodejs';
/**
 * Export HAP-NodeJS namespaces as type only
 */
export type { DataStreamParser } from 'hap-nodejs';
/**
 * Export HAP-NodeJS classes as type only
 */
export type { AccessControlManagement, AdaptiveLightingController, CameraController, Characteristic, ColorUtils, DataStreamConnection, DataStreamManagement, DataStreamReader, DataStreamServer, DataStreamWriter, DoorbellController, HAPServer, HapStatusError, HAPStorage, HDSProtocolError, RecordingManagement, RemoteController, RTPStreamManagement, Service, SiriAudioSession, } from 'hap-nodejs';
/**
 * Export HAP-NodeJS interfaces as type only
 */
export type { ActiveAdaptiveLightingTransition, AdaptiveLightingOptions, AdaptiveLightingTransitionCurveEntry, BrightnessAdjustmentMultiplierRange, CameraControllerOptions, CameraRecordingConfiguration, CameraRecordingDelegate, CameraStreamingDelegate, CharacteristicOperationContext, CharacteristicProps, Controller, ControllerConstructor, ControllerContext, ControllerServiceMap, DataStreamProtocolHandler, DoorbellOptions, H264CodecParameters, MediaContainerConfiguration, ProxiedSourceResponse, PublishInfo, RecordingManagementState, RecordingPacket, RTPProxyOptions, RTPStreamManagementState, SelectedH264CodecParameters, SerializableController, ServiceConfigurationChange, SiriAudioStreamProducer, SiriAudioStreamProducerConstructor, SourceResponse, VideoRecordingOptions, } from 'hap-nodejs';
/**
 * Export HAP-NodeJS type aliases as type only
 */
export type { AccessoriesCallback, AccessoryCharacteristicChange, AdditionalAuthorizationHandler, AddPairingCallback, AudioCodecConfiguration, AudioCodecParameters, AudioFrame, AudioInfo, AudioRecordingCodec, AudioRecordingOptions, AudioStreamingCodec, AudioStreamingOptions, ButtonConfiguration, CameraRecordingOptions, CameraStreamingOptions, CharacteristicChange, CharacteristicGetCallback, CharacteristicGetHandler, CharacteristicSetCallback, CharacteristicSetHandler, CharacteristicValue, ConstructorArgs, ControllerType, ErrorHandler, EventHandler, FrameHandler, GlobalEventHandler, GlobalRequestHandler, HAPHttpError, HAPPincode, IdentificationCallback, IdentifyCallback, InterfaceName, IPAddress, IPv4Address, IPv6Address, ListPairingsCallback, MacAddress, NodeCallback, Nullable, PairCallback, PairingsCallback, PartialAllowingNull, PreparedDataStreamSession, PrepareStreamCallback, PrepareStreamRequest, PrepareStreamResponse, PrimitiveTypes, ReadCharacteristicsCallback, ReconfiguredVideoInfo, ReconfigureStreamRequest, RemovePairingCallback, RequestHandler, Resolution, ResourceRequestCallback, ResponseHandler, RTPTime, SerializedServiceMap, ServiceCharacteristicChange, ServiceId, SessionIdentifier, SnapshotRequest, SnapshotRequestCallback, Source, StartStreamRequest, StateChangeDelegate, StopStreamRequest, StreamingRequest, StreamRequestCallback, StreamSessionIdentifier, SupportedButtonConfiguration, SupportedConfiguration, TargetConfiguration, TLVEncodable, VideoInfo, VideoStreamingOptions, VoidCallback, WithUUID, WriteCharacteristicsCallback, } from 'hap-nodejs';
/**
 * Export HAP-NodeJS variables as type only
 */
export type { LegacyTypes, uuid } from 'hap-nodejs';
/**
 * Export HAP-NodeJS functions as type only
 */
export type { clone, decode, decodeList, decodeWithLists, encode, epochMillisFromMillisSince2001_01_01, epochMillisFromMillisSince2001_01_01Buffer, once, } from 'hap-nodejs';
//# sourceMappingURL=index.d.ts.map