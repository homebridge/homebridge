"use strict";
/**
 * Matter Server Configuration
 *
 * Constants and configuration validation for the Matter server.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PASSCODE_ATTEMPTS = exports.SERVER_INIT_DELAY_MS = exports.SERVER_READY_POLL_INTERVAL_MS = exports.SERVER_READY_TIMEOUT_MS = exports.MAX_DEVICES_PER_BRIDGE = exports.DEFAULT_PRODUCT_ID = exports.DEFAULT_VENDOR_ID = exports.DEFAULT_MATTER_PORT = void 0;
exports.validateAndSanitizeConfig = validateAndSanitizeConfig;
const node_path_1 = require("node:path");
const configValidator_js_1 = require("../configValidator.js");
const types_js_1 = require("../types.js");
exports.DEFAULT_MATTER_PORT = 5540;
exports.DEFAULT_VENDOR_ID = 0xFFF1; // test vendor ID from Matter spec
exports.DEFAULT_PRODUCT_ID = 0x8001; // test product ID
exports.MAX_DEVICES_PER_BRIDGE = 1000; // matter spec maximum devices per aggregator
exports.SERVER_READY_TIMEOUT_MS = 5000;
exports.SERVER_READY_POLL_INTERVAL_MS = 100;
exports.SERVER_INIT_DELAY_MS = 200;
exports.MAX_PASSCODE_ATTEMPTS = 100;
/**
 * Validate and sanitize Matter server configuration
 * Throws descriptive errors if configuration is invalid
 */
function validateAndSanitizeConfig(config) {
    const errors = [];
    // Validate port
    const port = config.port || exports.DEFAULT_MATTER_PORT;
    const portValidation = (0, configValidator_js_1.validatePort)(port, false);
    if (!portValidation.valid) {
        errors.push(`Invalid port: ${portValidation.error}`);
    }
    // Validate and sanitize uniqueId (REQUIRED)
    if (!config.uniqueId) {
        errors.push('uniqueId is required for Matter server configuration');
    }
    const rawUniqueId = config.uniqueId || '';
    const uniqueIdResult = (0, configValidator_js_1.sanitizeUniqueId)(rawUniqueId);
    const uniqueId = uniqueIdResult.value;
    if (uniqueId.length === 0) {
        errors.push('Invalid uniqueId: must be a non-empty string');
    }
    // Validate storagePath (if provided)
    let storagePath = config.storagePath;
    if (storagePath !== undefined) {
        storagePath = (0, node_path_1.resolve)(storagePath); // resolve to absolute path
    }
    // Validate and sanitize manufacturer
    let manufacturer = config.manufacturer;
    if (manufacturer !== undefined) {
        manufacturer = (0, configValidator_js_1.truncateString)(manufacturer, 32, 'Manufacturer name').value;
    }
    // Validate and sanitize model
    let model = config.model;
    if (model !== undefined) {
        model = (0, configValidator_js_1.truncateString)(model, 32, 'Model name').value;
    }
    // Validate firmwareRevision
    let firmwareRevision = config.firmwareRevision;
    if (firmwareRevision !== undefined) {
        firmwareRevision = (0, configValidator_js_1.truncateString)(firmwareRevision, 64, 'Firmware revision').value;
    }
    // Validate serialNumber
    let serialNumber = config.serialNumber;
    if (serialNumber !== undefined) {
        serialNumber = (0, configValidator_js_1.truncateString)(serialNumber, 32, 'Serial number').value;
    }
    // Validate debugModeEnabled
    const debugModeEnabled = config.debugModeEnabled || false;
    // Validate externalAccessory
    const externalAccessory = config.externalAccessory || false;
    // Throw if there are validation errors
    if (errors.length > 0) {
        throw new types_js_1.MatterDeviceError(`Matter configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }
    return {
        port,
        uniqueId,
        storagePath,
        manufacturer,
        model,
        firmwareRevision,
        serialNumber,
        debugModeEnabled,
        externalAccessory,
    };
}
//# sourceMappingURL=ServerConfig.js.map