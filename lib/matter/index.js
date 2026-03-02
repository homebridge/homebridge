"use strict";
/**
 * Matter Protocol Support for Homebridge
 *
 * This module provides Matter protocol support through a Plugin API,
 * allowing plugin developers to explicitly register Matter accessories.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterTypes = exports.MatterStorageError = exports.MatterNetworkError = exports.MatterErrorType = exports.MatterError = exports.MatterDeviceError = exports.MatterCommissioningError = exports.MatterAccessoryEventTypes = exports.deviceTypes = exports.devices = exports.clusters = exports.clusterNames = exports.MatterServer = exports.MatterBridgeManager = exports.MatterStatus = exports.MatterConfigValidator = exports.MatterConfigCollector = exports.ChildBridgeMatterManager = void 0;
var ChildBridgeMatterManager_js_1 = require("./ChildBridgeMatterManager.js");
Object.defineProperty(exports, "ChildBridgeMatterManager", { enumerable: true, get: function () { return ChildBridgeMatterManager_js_1.ChildBridgeMatterManager; } });
var config_js_1 = require("./config.js");
Object.defineProperty(exports, "MatterConfigCollector", { enumerable: true, get: function () { return config_js_1.MatterConfigCollector; } });
var configValidator_js_1 = require("./configValidator.js");
Object.defineProperty(exports, "MatterConfigValidator", { enumerable: true, get: function () { return configValidator_js_1.MatterConfigValidator; } });
var errors_js_1 = require("./errors.js");
Object.defineProperty(exports, "MatterStatus", { enumerable: true, get: function () { return errors_js_1.MatterStatus; } });
var MatterBridgeManager_js_1 = require("./MatterBridgeManager.js");
Object.defineProperty(exports, "MatterBridgeManager", { enumerable: true, get: function () { return MatterBridgeManager_js_1.MatterBridgeManager; } });
var server_js_1 = require("./server.js");
Object.defineProperty(exports, "MatterServer", { enumerable: true, get: function () { return server_js_1.MatterServer; } });
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "clusterNames", { enumerable: true, get: function () { return types_js_1.clusterNames; } });
Object.defineProperty(exports, "clusters", { enumerable: true, get: function () { return types_js_1.clusters; } });
Object.defineProperty(exports, "devices", { enumerable: true, get: function () { return types_js_1.devices; } });
Object.defineProperty(exports, "deviceTypes", { enumerable: true, get: function () { return types_js_1.deviceTypes; } });
Object.defineProperty(exports, "MatterAccessoryEventTypes", { enumerable: true, get: function () { return types_js_1.MatterAccessoryEventTypes; } });
Object.defineProperty(exports, "MatterCommissioningError", { enumerable: true, get: function () { return types_js_1.MatterCommissioningError; } });
Object.defineProperty(exports, "MatterDeviceError", { enumerable: true, get: function () { return types_js_1.MatterDeviceError; } });
Object.defineProperty(exports, "MatterError", { enumerable: true, get: function () { return types_js_1.MatterError; } });
Object.defineProperty(exports, "MatterErrorType", { enumerable: true, get: function () { return types_js_1.MatterErrorType; } });
Object.defineProperty(exports, "MatterNetworkError", { enumerable: true, get: function () { return types_js_1.MatterNetworkError; } });
Object.defineProperty(exports, "MatterStorageError", { enumerable: true, get: function () { return types_js_1.MatterStorageError; } });
/**
 * Matter Cluster Types & Enums
 * Import these to access type-safe enum values for cluster attributes.
 *
 * Only the clusters that are actually used are exported here to minimize startup time.
 * If you need additional clusters, they must be added to the imports in types.ts.
 */
var types_js_2 = require("./types.js");
Object.defineProperty(exports, "MatterTypes", { enumerable: true, get: function () { return types_js_2.clusters; } });
//# sourceMappingURL=index.js.map