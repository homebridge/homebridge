/**
 * Matter Utility Functions
 *
 * Shared utility functions used across the Matter implementation to avoid code duplication.
 */

import type { MacAddress } from '@homebridge/hap-nodejs'
import type { NetworkInterfaceInfo } from 'node:os'

import { isIP, isIPv6, SocketAddress } from 'node:net'
import { networkInterfaces } from 'node:os'

import { version as matterJsVersion } from '@matter/main'

const NON_HEX_RE = /[^A-F0-9]/gi
const DECIMAL_RE = /^\d+$/
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
 * The canonical text of an IPv6 address (lower case, longest zero run compressed),
 * without any zone. Node reports addresses in this form; a user may spell the
 * same address any number of other ways in `bridge.bind`.
 */
function canonicalIPv6(address: string): string {
  const zoneStart = address.indexOf('%')
  const bare = zoneStart === -1
    ? address
    : address.slice(0, zoneStart)
  try {
    return new SocketAddress({ address: bare, family: 'ipv6' }).address
  } catch {
    return bare.toLowerCase()
  }
}

/**
 * The name of the interface that owns `address`, in the table `interfaces`.
 *
 * An IPv6 address is compared by value, not spelling. Its zone (RFC 4007,
 * `fe80::1%eth0` or `fe80::1%2`) names the interface the address must be on:
 * the interface of that name, or for a number, the interface whose link-local
 * address reports that scope id. Without a zone, the first interface that has
 * the address wins. This is the resolution ciao performs for HAP.
 */
function interfaceOwningAddress(address: string, interfaces: Record<string, NetworkInterfaceInfo[] | undefined>): string | undefined {
  const ipv6 = isIPv6(address)
  const wanted = ipv6
    ? canonicalIPv6(address)
    : address

  let candidates = Object.keys(interfaces)
  let scopeId: number | undefined
  const zoneStart = ipv6
    ? address.indexOf('%')
    : -1
  if (zoneStart !== -1) {
    const zone = address.slice(zoneStart + 1)
    if (interfaces[zone]) {
      candidates = [zone]
    } else if (DECIMAL_RE.test(zone)) {
      scopeId = Number(zone)
    } else {
      return undefined
    }
  }

  for (const name of candidates) {
    for (const info of interfaces[name] ?? []) {
      if (ipv6) {
        if (!isIPv6(info.address)) {
          continue
        }
        if (scopeId !== undefined && scopeId !== 0 && info.scopeid !== scopeId) {
          continue
        }
        if (canonicalIPv6(info.address) === wanted) {
          return name
        }
      } else if (info.address === wanted) {
        return name
      }
    }
  }
  return undefined
}

/**
 * Turn `bridge.bind` entries into network interface names.
 *
 * `bridge.bind` may hold interface names or IP addresses, and HAP accepts
 * both. matter.js only takes an interface NAME, and fails to start its mDNS
 * service when it is given anything else. So an address is replaced by the
 * name of the interface that owns it *at the time of the call*, which lets a
 * bridge follow a network rather than an interface — in a multi-homed Docker
 * container, which of `eth0`/`eth1` sits on which network changes from one
 * start to the next, but the container's address on each network does not.
 *
 * An IPv6 address is matched by value, however it is spelled, and its zone
 * picks the interface when the same link-local address is on several. The
 * unspecified addresses `0.0.0.0` and `::`, which HAP reads as "listen on
 * everything", are set aside rather than reported as unknown. An entry that
 * is neither a name nor an address of an interface on this machine, or a
 * subnet, is reported back as unknown.
 *
 * @param bind - the normalised `bridge.bind` entries
 * @param interfaces - the machine's interfaces (injectable for tests)
 * @returns the interface names, in order and without repeats; the entries that matched nothing;
 * and the unspecified addresses
 *
 * @example
 * ```typescript
 * resolveInterfaceNames(['192.168.1.10', 'wlan0', 'eth9', '0.0.0.0'])
 * // { names: ['eth0', 'wlan0'], unknown: ['eth9'], unspecified: ['0.0.0.0'] } on a machine where eth0 has 192.168.1.10
 * ```
 */
export function resolveInterfaceNames(
  bind: string[],
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces(),
): { names: string[], unknown: string[], unspecified: string[] } {
  const names: string[] = []
  const unknown: string[] = []
  const unspecified: string[] = []
  for (const entry of bind) {
    let name: string | undefined
    if (interfaces[entry]) {
      name = entry
    } else if (isIP(entry)) {
      if (entry === '0.0.0.0' || (isIPv6(entry) && canonicalIPv6(entry) === '::')) {
        unspecified.push(entry)
        continue
      }
      name = interfaceOwningAddress(entry, interfaces)
    }
    if (!name) {
      unknown.push(entry)
    } else if (!names.includes(name)) {
      names.push(name)
    }
  }
  return { names, unknown, unspecified }
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
 * empty string if stripping consumes the entire label, or if the vendor is
 * still in it with the same case (inside a word) — callers should provide a
 * non-vendor fallback in that case.
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
 * stripVendorFromLabel('LGTV Lounge', 'LG')        // '' (the vendor is inside a word)
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
  const stripped = vendorAsWord.test(label)
    ? label
        .replace(vendorAsWord, '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-_:,]+|[\s\-_:,]+$/g, '')
    : label
  // matter.js warns, and the spec does not allow it, when the label holds the
  // vendor anywhere, with the same case: inside a word too ("LGTV Lounge" for
  // the vendor "LG"). Cutting it out of a word gives nonsense ("ning Lamp"
  // for "Evening Lamp" and "Eve"), so the caller's fallback is used instead.
  return stripped.includes(vendor)
    ? ''
    : stripped
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
