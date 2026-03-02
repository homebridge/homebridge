"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSStatus = exports.HDSProtocolSpecificErrorReason = exports.HAPStatus = exports.HAPServerEventTypes = exports.H264Profile = exports.H264Level = exports.Formats = exports.EventTriggerOption = exports.DefaultControllerType = exports.DataStreamStatus = exports.DataStreamServerEvent = exports.DataStreamConnectionEvent = exports.DataFormatTags = exports.CharacteristicEventTypes = exports.ChangeReason = exports.Categories = exports.CameraControllerEvents = exports.ButtonType = exports.ButtonState = exports.AudioStreamingSamplerate = exports.AudioStreamingCodecType = exports.AudioSamplerate = exports.AudioRecordingSamplerate = exports.AudioRecordingCodecType = exports.AudioCodecTypes = exports.AudioBitrate = exports.AdaptiveLightingControllerMode = exports.AdaptiveLightingControllerEvents = exports.AccessoryEventTypes = exports.AccessLevel = exports.AccessControlEvent = exports.Access = exports.PlatformAccessoryEvent = exports.MatterStorageError = exports.MatterNetworkError = exports.MatterErrorType = exports.MatterError = exports.MatterDeviceError = exports.MatterCommissioningError = exports.MatterAccessoryEventTypes = exports.deviceTypes = exports.devices = exports.clusters = exports.clusterNames = exports.MatterBridgeStatus = exports.ChildMatterMessageType = exports.MatterStatus = exports.LogLevel = exports.PluginType = exports.APIEvent = void 0;
exports.Units = exports.Topics = exports.TargetUpdates = exports.TargetCategory = exports.StreamRequestTypes = exports.SRTPCryptoSuites = exports.SiriAudioSessionEvents = exports.ServiceEventTypes = exports.ResourceRequestReason = exports.RemoteControllerEvents = exports.Protocols = exports.Perms = exports.PacketDataType = exports.MediaContainerType = void 0;
/**
 * Export API const enums
 */
var api_js_1 = require("./api.js");
Object.defineProperty(exports, "APIEvent", { enumerable: true, get: function () { return api_js_1.APIEvent; } });
Object.defineProperty(exports, "PluginType", { enumerable: true, get: function () { return api_js_1.PluginType; } });
/**
 * Export Logger const enums
 */
var logger_js_1 = require("./logger.js");
Object.defineProperty(exports, "LogLevel", { enumerable: true, get: function () { return logger_js_1.LogLevel; } });
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
var index_js_1 = require("./matter/index.js");
Object.defineProperty(exports, "MatterStatus", { enumerable: true, get: function () { return index_js_1.MatterStatus; } });
var sharedTypes_js_1 = require("./matter/sharedTypes.js");
Object.defineProperty(exports, "ChildMatterMessageType", { enumerable: true, get: function () { return sharedTypes_js_1.ChildMatterMessageType; } });
Object.defineProperty(exports, "MatterBridgeStatus", { enumerable: true, get: function () { return sharedTypes_js_1.MatterBridgeStatus; } });
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Matter Protocol - UI Integration Types
 * ═══════════════════════════════════════════════════════════════════════
 */
/**
 * Matter device types, clusters, and cluster names
 * Access via api.matter.deviceTypes, api.matter.clusters, api.matter.clusterNames
 */
var types_js_1 = require("./matter/types.js");
Object.defineProperty(exports, "clusterNames", { enumerable: true, get: function () { return types_js_1.clusterNames; } });
Object.defineProperty(exports, "clusters", { enumerable: true, get: function () { return types_js_1.clusters; } });
Object.defineProperty(exports, "devices", { enumerable: true, get: function () { return types_js_1.devices; } });
Object.defineProperty(exports, "deviceTypes", { enumerable: true, get: function () { return types_js_1.deviceTypes; } });
Object.defineProperty(exports, "MatterAccessoryEventTypes", { enumerable: true, get: function () { return types_js_1.MatterAccessoryEventTypes; } });
/**
 * Matter error types for error handling
 */
var types_js_2 = require("./matter/types.js");
Object.defineProperty(exports, "MatterCommissioningError", { enumerable: true, get: function () { return types_js_2.MatterCommissioningError; } });
Object.defineProperty(exports, "MatterDeviceError", { enumerable: true, get: function () { return types_js_2.MatterDeviceError; } });
Object.defineProperty(exports, "MatterError", { enumerable: true, get: function () { return types_js_2.MatterError; } });
Object.defineProperty(exports, "MatterErrorType", { enumerable: true, get: function () { return types_js_2.MatterErrorType; } });
Object.defineProperty(exports, "MatterNetworkError", { enumerable: true, get: function () { return types_js_2.MatterNetworkError; } });
Object.defineProperty(exports, "MatterStorageError", { enumerable: true, get: function () { return types_js_2.MatterStorageError; } });
/**
 * Export Platform Accessory const enums
 */
var platformAccessory_js_1 = require("./platformAccessory.js");
Object.defineProperty(exports, "PlatformAccessoryEvent", { enumerable: true, get: function () { return platformAccessory_js_1.PlatformAccessoryEvent; } });
/**
 * Export the CONST ENUMS from hap-nodejs
 * These get converted to their string value at compile time
 * and can be safely used directly.
 */
var hap_nodejs_1 = require("@homebridge/hap-nodejs");
Object.defineProperty(exports, "Access", { enumerable: true, get: function () { return hap_nodejs_1.Access; } });
Object.defineProperty(exports, "AccessControlEvent", { enumerable: true, get: function () { return hap_nodejs_1.AccessControlEvent; } });
Object.defineProperty(exports, "AccessLevel", { enumerable: true, get: function () { return hap_nodejs_1.AccessLevel; } });
Object.defineProperty(exports, "AccessoryEventTypes", { enumerable: true, get: function () { return hap_nodejs_1.AccessoryEventTypes; } });
Object.defineProperty(exports, "AdaptiveLightingControllerEvents", { enumerable: true, get: function () { return hap_nodejs_1.AdaptiveLightingControllerEvents; } });
Object.defineProperty(exports, "AdaptiveLightingControllerMode", { enumerable: true, get: function () { return hap_nodejs_1.AdaptiveLightingControllerMode; } });
Object.defineProperty(exports, "AudioBitrate", { enumerable: true, get: function () { return hap_nodejs_1.AudioBitrate; } });
Object.defineProperty(exports, "AudioCodecTypes", { enumerable: true, get: function () { return hap_nodejs_1.AudioCodecTypes; } });
Object.defineProperty(exports, "AudioRecordingCodecType", { enumerable: true, get: function () { return hap_nodejs_1.AudioRecordingCodecType; } });
Object.defineProperty(exports, "AudioRecordingSamplerate", { enumerable: true, get: function () { return hap_nodejs_1.AudioRecordingSamplerate; } });
Object.defineProperty(exports, "AudioSamplerate", { enumerable: true, get: function () { return hap_nodejs_1.AudioSamplerate; } });
Object.defineProperty(exports, "AudioStreamingCodecType", { enumerable: true, get: function () { return hap_nodejs_1.AudioStreamingCodecType; } });
Object.defineProperty(exports, "AudioStreamingSamplerate", { enumerable: true, get: function () { return hap_nodejs_1.AudioStreamingSamplerate; } });
Object.defineProperty(exports, "ButtonState", { enumerable: true, get: function () { return hap_nodejs_1.ButtonState; } });
Object.defineProperty(exports, "ButtonType", { enumerable: true, get: function () { return hap_nodejs_1.ButtonType; } });
Object.defineProperty(exports, "CameraControllerEvents", { enumerable: true, get: function () { return hap_nodejs_1.CameraControllerEvents; } });
Object.defineProperty(exports, "Categories", { enumerable: true, get: function () { return hap_nodejs_1.Categories; } });
Object.defineProperty(exports, "ChangeReason", { enumerable: true, get: function () { return hap_nodejs_1.ChangeReason; } });
Object.defineProperty(exports, "CharacteristicEventTypes", { enumerable: true, get: function () { return hap_nodejs_1.CharacteristicEventTypes; } });
Object.defineProperty(exports, "DataFormatTags", { enumerable: true, get: function () { return hap_nodejs_1.DataFormatTags; } });
Object.defineProperty(exports, "DataStreamConnectionEvent", { enumerable: true, get: function () { return hap_nodejs_1.DataStreamConnectionEvent; } });
Object.defineProperty(exports, "DataStreamServerEvent", { enumerable: true, get: function () { return hap_nodejs_1.DataStreamServerEvent; } });
Object.defineProperty(exports, "DataStreamStatus", { enumerable: true, get: function () { return hap_nodejs_1.DataStreamStatus; } });
Object.defineProperty(exports, "DefaultControllerType", { enumerable: true, get: function () { return hap_nodejs_1.DefaultControllerType; } });
Object.defineProperty(exports, "EventTriggerOption", { enumerable: true, get: function () { return hap_nodejs_1.EventTriggerOption; } });
Object.defineProperty(exports, "Formats", { enumerable: true, get: function () { return hap_nodejs_1.Formats; } });
Object.defineProperty(exports, "H264Level", { enumerable: true, get: function () { return hap_nodejs_1.H264Level; } });
Object.defineProperty(exports, "H264Profile", { enumerable: true, get: function () { return hap_nodejs_1.H264Profile; } });
Object.defineProperty(exports, "HAPServerEventTypes", { enumerable: true, get: function () { return hap_nodejs_1.HAPServerEventTypes; } });
Object.defineProperty(exports, "HAPStatus", { enumerable: true, get: function () { return hap_nodejs_1.HAPStatus; } });
Object.defineProperty(exports, "HDSProtocolSpecificErrorReason", { enumerable: true, get: function () { return hap_nodejs_1.HDSProtocolSpecificErrorReason; } });
Object.defineProperty(exports, "HDSStatus", { enumerable: true, get: function () { return hap_nodejs_1.HDSStatus; } });
Object.defineProperty(exports, "MediaContainerType", { enumerable: true, get: function () { return hap_nodejs_1.MediaContainerType; } });
Object.defineProperty(exports, "PacketDataType", { enumerable: true, get: function () { return hap_nodejs_1.PacketDataType; } });
Object.defineProperty(exports, "Perms", { enumerable: true, get: function () { return hap_nodejs_1.Perms; } });
Object.defineProperty(exports, "Protocols", { enumerable: true, get: function () { return hap_nodejs_1.Protocols; } });
Object.defineProperty(exports, "RemoteControllerEvents", { enumerable: true, get: function () { return hap_nodejs_1.RemoteControllerEvents; } });
Object.defineProperty(exports, "ResourceRequestReason", { enumerable: true, get: function () { return hap_nodejs_1.ResourceRequestReason; } });
Object.defineProperty(exports, "ServiceEventTypes", { enumerable: true, get: function () { return hap_nodejs_1.ServiceEventTypes; } });
Object.defineProperty(exports, "SiriAudioSessionEvents", { enumerable: true, get: function () { return hap_nodejs_1.SiriAudioSessionEvents; } });
Object.defineProperty(exports, "SRTPCryptoSuites", { enumerable: true, get: function () { return hap_nodejs_1.SRTPCryptoSuites; } });
Object.defineProperty(exports, "StreamRequestTypes", { enumerable: true, get: function () { return hap_nodejs_1.StreamRequestTypes; } });
Object.defineProperty(exports, "TargetCategory", { enumerable: true, get: function () { return hap_nodejs_1.TargetCategory; } });
Object.defineProperty(exports, "TargetUpdates", { enumerable: true, get: function () { return hap_nodejs_1.TargetUpdates; } });
Object.defineProperty(exports, "Topics", { enumerable: true, get: function () { return hap_nodejs_1.Topics; } });
Object.defineProperty(exports, "Units", { enumerable: true, get: function () { return hap_nodejs_1.Units; } });
//# sourceMappingURL=index.js.map