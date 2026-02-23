/**
 * Matter Utility Functions
 *
 * Shared utility functions used across the Matter implementation to avoid code duplication.
 */

import type { MacAddress } from '@homebridge/hap-nodejs'

/**
 * Type guard for Node.js error objects with code property
 */
const NON_HEX_RE = /[^A-F0-9]/gi
const HEX_PAIR_RE = /.{1,2}/g

export interface NodeError extends Error {
  code?: string
  errno?: number
  syscall?: string
  path?: string
}

/**
 * Type guard to check if an error has a code property
 *
 * @param error - The error to check
 * @returns True if error has a code property
 */
export function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error && 'code' in error
}

/**
 * Extract error code from an error object
 *
 * @param error - The error object
 * @returns Error code string if present, undefined otherwise
 */
export function getErrorCode(error: unknown): string | undefined {
  return isNodeError(error) ? error.code : undefined
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
export function normalizeBindConfig(bind: string | string[] | undefined): string[] | undefined {
  if (!bind) {
    return undefined
  }
  return Array.isArray(bind) ? bind : [bind]
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
export function createMatterUsername(uniqueId: string): MacAddress {
  const cleanId = uniqueId.replace(NON_HEX_RE, '')
  const formatted = cleanId.match(HEX_PAIR_RE)?.slice(0, 6).join(':').toUpperCase() || uniqueId
  return formatted as MacAddress
}

/**
 * Append suffix to a MAC address for Matter port allocation
 *
 * @param baseUsername - Base MAC address
 * @param suffix - Suffix to append (e.g., 'MATTER')
 * @returns MAC address with suffix
 */
export function appendUsernameSuffix(baseUsername: string, suffix: string): MacAddress {
  return `${baseUsername}:${suffix}` as MacAddress
}
