"use strict";
/**
 * Matter Utility Functions
 *
 * Shared utility functions used across the Matter implementation to avoid code duplication.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNodeError = isNodeError;
exports.getErrorCode = getErrorCode;
exports.normalizeBindConfig = normalizeBindConfig;
exports.createMatterUsername = createMatterUsername;
exports.appendUsernameSuffix = appendUsernameSuffix;
/**
 * Type guard to check if an error has a code property
 *
 * @param error - The error to check
 * @returns True if error has a code property
 */
function isNodeError(error) {
    return error instanceof Error && 'code' in error;
}
/**
 * Extract error code from an error object
 *
 * @param error - The error object
 * @returns Error code string if present, undefined otherwise
 */
function getErrorCode(error) {
    return isNodeError(error) ? error.code : undefined;
}
/**
 * Normalize bind configuration to array format
 *
 * Converts a single bind address or array of addresses to a consistent array format.
 * Returns undefined if no bind config provided.
 *
 * @param bind - Single bind address, array of addresses, or undefined
 * @returns Array of bind addresses or undefined
 *
 * @example
 * ```typescript
 * normalizeBindConfig('192.168.1.1') // ['192.168.1.1']
 * normalizeBindConfig(['192.168.1.1', '10.0.0.1']) // ['192.168.1.1', '10.0.0.1']
 * normalizeBindConfig(undefined) // undefined
 * ```
 */
function normalizeBindConfig(bind) {
    if (!bind) {
        return undefined;
    }
    return Array.isArray(bind) ? bind : [bind];
}
/**
 * Create a Matter username from a unique identifier
 *
 * Formats a unique ID (like a serial number) into a MAC address format
 * suitable for use as a Matter bridge username.
 *
 * @param uniqueId - Unique identifier (typically without colons)
 * @returns MAC address formatted username
 *
 * @example
 * ```typescript
 * createMatterUsername('ABCDEF123456') // 'AB:CD:EF:12:34:56'
 * ```
 */
function createMatterUsername(uniqueId) {
    const cleanId = uniqueId.replace(/[^A-F0-9]/gi, '');
    const formatted = cleanId.match(/.{1,2}/g)?.slice(0, 6).join(':').toUpperCase() || uniqueId;
    return formatted;
}
/**
 * Append suffix to a MAC address for Matter port allocation
 *
 * @param baseUsername - Base MAC address
 * @param suffix - Suffix to append (e.g., 'MATTER')
 * @returns MAC address with suffix
 */
function appendUsernameSuffix(baseUsername, suffix) {
    return `${baseUsername}:${suffix}`;
}
//# sourceMappingURL=utils.js.map