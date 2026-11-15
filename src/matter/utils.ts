/**
 * Matter Utility Functions
 *
 * Shared utility functions used across the Matter implementation to avoid code duplication.
 */

import type { MacAddress } from '@homebridge/hap-nodejs'
import type { NetworkInterfaceInfo } from 'node:os'

import { networkInterfaces } from 'node:os'

import { version as matterJsVersion } from '@matter/main'

/**
 * Type guard for Node.js error objects with code property
 */
const NON_HEX_RE = /[^A-F0-9]/gi
const HEX_PAIR_RE = /.{1,2}/g
const REGEXP_SPECIAL_RE = /[.*+?^${}()|[\]\\]/g

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
  return isNodeError(error)
    ? error.code
    : undefined
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
  return Array.isArray(bind)
    ? bind
    : [bind]
}

/**
 * Turn `bridge.bind` entries into network interface names.
 *
 * `bridge.bind` may hold interface names or IP addresses, and HAP accepts
 * both. matter.js only takes an interface NAME, and fails to start its mDNS
 * service when it is given anything else. So an address is replaced by the
 * name of the interface that owns it, and an entry that is neither a name nor
 * an address of an interface on this machine is reported back as unknown.
 *
 * @param bind - the normalised `bridge.bind` entries
 * @param interfaces - the machine's interfaces (injectable for tests)
 * @returns the interface names, in order and without repeats, and the entries that matched nothing
 *
 * @example
 * ```typescript
 * resolveInterfaceNames(['192.168.1.10', 'wlan0', 'eth9'])
 * // { names: ['eth0', 'wlan0'], unknown: ['eth9'] } on a machine where eth0 has 192.168.1.10
 * ```
 */
export function resolveInterfaceNames(
  bind: string[],
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces(),
): { names: string[], unknown: string[] } {
  const names: string[] = []
  const unknown: string[] = []
  for (const entry of bind) {
    const name = interfaces[entry]
      ? entry
      : Object.keys(interfaces).find(interfaceName =>
          // an IPv6 address may carry a zone: fe80::1%eth0
          interfaces[interfaceName]?.some(info => info.address === entry || info.address === entry.split('%')[0]))
    if (!name) {
      unknown.push(entry)
    } else if (!names.includes(name)) {
      names.push(name)
    }
  }
  return { names, unknown }
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

/**
 * Sanitise a Matter `productLabel` (or similar) so it does not contain the
 * vendor name. The Matter spec requires that `productLabel` SHALL NOT include
 * the `vendorName`, and matter.js logs a warning when it does. Many users
 * name accessories with the manufacturer prefix (e.g. "Eufy Front Door"),
 * which trips the check unless we strip the vendor first.
 *
 * Removes every case-insensitive occurrence of `vendor` as a whole word from
 * `label`, collapses whitespace, and trims leading/trailing separators. A
 * word that only contains the vendor's letters is kept. Returns an
 * empty string if stripping consumes the entire label — callers should
 * provide a non-vendor fallback in that case.
 *
 * @param label - The candidate label (e.g. an accessory display name)
 * @param vendor - The vendor name to strip
 * @returns A label safe to send as `productLabel`, or `''` if fully consumed
 *
 * @example
 * ```typescript
 * stripVendorFromLabel('Eufy Front Door', 'Eufy') // 'Front Door'
 * stripVendorFromLabel('Govee Light', 'govee')    // 'Light'
 * stripVendorFromLabel('Homebridge', 'Homebridge') // '' (caller supplies fallback)
 * stripVendorFromLabel('Garage Door', 'GE')        // 'Garage Door'
 * ```
 */
export function stripVendorFromLabel(label: string | undefined, vendor: string | undefined): string {
  if (!label) {
    return ''
  }
  if (!vendor) {
    return label
  }
  // The vendor as a word of its own only: a name that merely contains the
  // vendor's letters ("Garage Door" for the vendor "GE") is left alone.
  const vendorAsWord = new RegExp(`(?<![\\p{L}\\p{N}])${vendor.replace(REGEXP_SPECIAL_RE, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu')
  if (!vendorAsWord.test(label)) {
    return label
  }
  return label
    .replace(vendorAsWord, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-_:,]+|[\s\-_:,]+$/g, '')
}

/**
 * Get the version of @matter/main reported by the installed package.
 * Returns the raw semver string (no `v` prefix) — callers format it with
 * `v%s` when logging.
 *
 * @returns The version string of @matter/main.
 */
export function getMatterJsVersion(): string {
  return matterJsVersion
}
