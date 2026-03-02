/**
 * Matter Utility Functions
 *
 * Shared utility functions used across the Matter implementation to avoid code duplication.
 */
import type { MacAddress } from '@homebridge/hap-nodejs';
/**
 * Type guard for Node.js error objects with code property
 */
export interface NodeError extends Error {
    code?: string;
    errno?: number;
    syscall?: string;
    path?: string;
}
/**
 * Type guard to check if an error has a code property
 *
 * @param error - The error to check
 * @returns True if error has a code property
 */
export declare function isNodeError(error: unknown): error is NodeError;
/**
 * Extract error code from an error object
 *
 * @param error - The error object
 * @returns Error code string if present, undefined otherwise
 */
export declare function getErrorCode(error: unknown): string | undefined;
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
export declare function normalizeBindConfig(bind: string | string[] | undefined): string[] | undefined;
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
export declare function createMatterUsername(uniqueId: string): MacAddress;
/**
 * Append suffix to a MAC address for Matter port allocation
 *
 * @param baseUsername - Base MAC address
 * @param suffix - Suffix to append (e.g., 'MATTER')
 * @returns MAC address with suffix
 */
export declare function appendUsernameSuffix(baseUsername: string, suffix: string): MacAddress;
//# sourceMappingURL=utils.d.ts.map