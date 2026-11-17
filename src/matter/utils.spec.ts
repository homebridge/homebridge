/**
 * Tests for Matter utility functions
 */

import type { NetworkInterfaceInfo } from 'node:os'

import { describe, expect, it } from 'vitest'

import {
  appendUsernameSuffix,
  createMatterUsername,
  getErrorCode,
  getMatterJsVersion,
  isNodeError,
  normalizeBindConfig,
  resolveInterfaceNames,
  stripVendorFromLabel,
} from './utils.js'

describe('matter utilities', () => {
  describe('isNodeError', () => {
    it('should return true for Error with code property', () => {
      const error = new Error('Test error')
      Object.assign(error, { code: 'ENOENT' })

      expect(isNodeError(error)).toBe(true)
    })

    it('should return false for Error without code property', () => {
      const error = new Error('Test error')

      expect(isNodeError(error)).toBe(false)
    })

    it('should return false for non-Error objects', () => {
      expect(isNodeError({ code: 'ENOENT' })).toBe(false)
      expect(isNodeError('error')).toBe(false)
      expect(isNodeError(null)).toBe(false)
      expect(isNodeError(undefined)).toBe(false)
    })
  })

  describe('getErrorCode', () => {
    it('should extract code from NodeJS error', () => {
      const error = new Error('File not found')
      Object.assign(error, { code: 'ENOENT' })

      expect(getErrorCode(error)).toBe('ENOENT')
    })

    it('should return undefined for Error without code', () => {
      const error = new Error('Generic error')

      expect(getErrorCode(error)).toBeUndefined()
    })

    it('should return undefined for non-error values', () => {
      expect(getErrorCode('error')).toBeUndefined()
      expect(getErrorCode(null)).toBeUndefined()
      expect(getErrorCode(undefined)).toBeUndefined()
      expect(getErrorCode({})).toBeUndefined()
    })

    it('should handle various error codes', () => {
      const codes = [
        'ENOENT',
        'EACCES',
        'EADDRINUSE',
        'ECONNREFUSED',
      ]

      for (const code of codes) {
        const error = new Error('Test')
        Object.assign(error, { code })
        expect(getErrorCode(error)).toBe(code)
      }
    })
  })

  describe('normalizeBindConfig', () => {
    it('should return undefined for undefined input', () => {
      expect(normalizeBindConfig(undefined)).toBeUndefined()
    })

    it('should convert single string to array', () => {
      expect(normalizeBindConfig('192.168.1.1')).toEqual(['192.168.1.1'])
    })

    it('should pass through array unchanged', () => {
      const addresses = ['192.168.1.1', '10.0.0.1']
      expect(normalizeBindConfig(addresses)).toEqual(addresses)
    })

    it('should handle empty string', () => {
      expect(normalizeBindConfig('')).toBeUndefined()
    })

    it('should handle various IP formats', () => {
      expect(normalizeBindConfig('127.0.0.1')).toEqual(['127.0.0.1'])
      expect(normalizeBindConfig('::1')).toEqual(['::1'])
      expect(normalizeBindConfig('0.0.0.0')).toEqual(['0.0.0.0'])
    })

    it('should preserve multiple addresses in array', () => {
      const addresses = ['192.168.1.1', '192.168.1.2', '10.0.0.1']
      expect(normalizeBindConfig(addresses)).toEqual(addresses)
    })
  })

  describe('resolveInterfaceNames', () => {
    const address = (value: string, family: 'IPv4' | 'IPv6' = 'IPv4', scopeid?: number) => ({ address: value, family, scopeid }) as NetworkInterfaceInfo
    // A dual-homed Docker container: Docker brings eth0/eth1 up in a random order, so
    // which of them sits on which network changes from one start to the next.
    const interfaces = {
      eth0: [
        address('192.168.1.10'),
        address('fd00:1234::10', 'IPv6', 0),
        address('fe80::1', 'IPv6', 2),
      ],
      wlan0: [
        address('10.0.0.5'),
        address('fe80::1', 'IPv6', 3),
      ],
    }

    it('keeps an interface name', () => {
      expect(resolveInterfaceNames(['wlan0'], interfaces)).toEqual({
        names: ['wlan0'],
        unknown: [],
        unspecified: [],
      })
    })

    it('turns an address into the name of the interface that owns it', () => {
      expect(resolveInterfaceNames(['192.168.1.10'], interfaces)).toEqual({
        names: ['eth0'],
        unknown: [],
        unspecified: [],
      })
      expect(resolveInterfaceNames(['fd00:1234::10'], interfaces)).toEqual({
        names: ['eth0'],
        unknown: [],
        unspecified: [],
      })
    })

    it('follows the address when the interfaces swap networks between starts', () => {
      const swapped = { eth0: interfaces.wlan0, wlan0: interfaces.eth0 }
      expect(resolveInterfaceNames(['192.168.1.10'], interfaces).names).toEqual(['eth0'])
      expect(resolveInterfaceNames(['192.168.1.10'], swapped).names).toEqual(['wlan0'])
    })

    it('matches an IPv6 address however it is spelled, as HAP does', () => {
      // Node reports addresses in canonical form; a user may well type them otherwise.
      expect(resolveInterfaceNames(['FD00:1234:0000:0000:0000:0000:0000:0010'], interfaces).names).toEqual(['eth0'])
      expect(resolveInterfaceNames(['fd00:1234:0:0:0:0:0:10'], interfaces).names).toEqual(['eth0'])
    })

    it('uses the zone of a link-local address to pick the interface', () => {
      // fe80::1 is on both interfaces; the zone says which one is meant.
      expect(resolveInterfaceNames(['fe80::1%wlan0'], interfaces).names).toEqual(['wlan0'])
      expect(resolveInterfaceNames(['fe80::1%eth0'], interfaces).names).toEqual(['eth0'])
      // A numeric zone is the scope id Node reports for the interface.
      expect(resolveInterfaceNames(['fe80::1%3'], interfaces).names).toEqual(['wlan0'])
      // Without a zone the first interface that has the address wins.
      expect(resolveInterfaceNames(['fe80::1'], interfaces).names).toEqual(['eth0'])
    })

    it('reports a zone that names no interface as unknown', () => {
      expect(resolveInterfaceNames(['fe80::1%eth9'], interfaces)).toEqual({
        names: [],
        unknown: ['fe80::1%eth9'],
        unspecified: [],
      })
    })

    it('names an interface once when it is given by name and by address', () => {
      expect(resolveInterfaceNames(['eth0', '192.168.1.10', 'wlan0'], interfaces)).toEqual({
        names: ['eth0', 'wlan0'],
        unknown: [],
        unspecified: [],
      })
    })

    it('reports an entry that is no interface and no address of one', () => {
      expect(resolveInterfaceNames(['eth9', '192.168.99.99', 'wlan0'], interfaces)).toEqual({
        names: ['wlan0'],
        unknown: ['eth9', '192.168.99.99'],
        unspecified: [],
      })
    })

    it('sets the unspecified addresses aside rather than calling them unknown', () => {
      // HAP reads 0.0.0.0 and :: in bridge.bind as "listen on everything", not as a restriction.
      expect(resolveInterfaceNames(['0.0.0.0', 'wlan0', '::'], interfaces)).toEqual({
        names: ['wlan0'],
        unknown: [],
        unspecified: ['0.0.0.0', '::'],
      })
      expect(resolveInterfaceNames(['0:0:0:0:0:0:0:0'], interfaces).unspecified).toEqual(['0:0:0:0:0:0:0:0'])
    })

    it('does not take a subnet for an address', () => {
      expect(resolveInterfaceNames(['192.168.1.0/24'], interfaces).unknown).toEqual(['192.168.1.0/24'])
    })
  })

  describe('createMatterUsername', () => {
    it('should format hex string as MAC address', () => {
      expect(createMatterUsername('ABCDEF123456')).toBe('AB:CD:EF:12:34:56')
    })

    it('should handle lowercase hex', () => {
      expect(createMatterUsername('abcdef123456')).toBe('AB:CD:EF:12:34:56')
    })

    it('should remove existing colons before formatting', () => {
      expect(createMatterUsername('AB:CD:EF:12:34:56')).toBe('AB:CD:EF:12:34:56')
    })

    it('should handle strings with dashes', () => {
      expect(createMatterUsername('AB-CD-EF-12-34-56')).toBe('AB:CD:EF:12:34:56')
    })

    it('should limit to 6 octets', () => {
      expect(createMatterUsername('ABCDEF1234567890')).toBe('AB:CD:EF:12:34:56')
    })

    it('should handle short strings', () => {
      expect(createMatterUsername('ABC')).toBe('AB:C')
    })

    it('should extract hex characters from mixed string', () => {
      // Function extracts only A-F0-9 characters
      expect(createMatterUsername('not-hex-at-all')).toBe('EA:A')
      expect(createMatterUsername('xyz')).toBe('xyz') // No hex chars, returns original
    })

    it('should handle mixed case', () => {
      expect(createMatterUsername('AbCdEf123456')).toBe('AB:CD:EF:12:34:56')
    })
  })

  describe('appendUsernameSuffix', () => {
    it('should append suffix to username', () => {
      expect(appendUsernameSuffix('AA:BB:CC:DD:EE:FF', 'MATTER')).toBe('AA:BB:CC:DD:EE:FF:MATTER')
    })

    it('should handle various suffixes', () => {
      const base = 'AA:BB:CC:DD:EE:FF'
      expect(appendUsernameSuffix(base, 'TEST')).toBe('AA:BB:CC:DD:EE:FF:TEST')
      expect(appendUsernameSuffix(base, 'CHILD')).toBe('AA:BB:CC:DD:EE:FF:CHILD')
      expect(appendUsernameSuffix(base, '1')).toBe('AA:BB:CC:DD:EE:FF:1')
    })

    it('should handle username without colons', () => {
      expect(appendUsernameSuffix('AABBCCDDEEFF', 'MATTER')).toBe('AABBCCDDEEFF:MATTER')
    })

    it('should handle empty suffix', () => {
      expect(appendUsernameSuffix('AA:BB:CC:DD:EE:FF', '')).toBe('AA:BB:CC:DD:EE:FF:')
    })
  })

  describe('stripVendorFromLabel', () => {
    it('strips a leading vendor prefix and trims the result', () => {
      expect(stripVendorFromLabel('Eufy Front Door', 'Eufy')).toBe('Front Door')
    })

    it('strips a trailing vendor suffix and trims separators', () => {
      expect(stripVendorFromLabel('Front Door - Eufy', 'Eufy')).toBe('Front Door')
    })

    it('strips a vendor occurring mid-string', () => {
      expect(stripVendorFromLabel('My Eufy Camera', 'Eufy')).toBe('My Camera')
    })

    it('matches case-insensitively', () => {
      expect(stripVendorFromLabel('Govee Light', 'govee')).toBe('Light')
      expect(stripVendorFromLabel('govee light', 'GOVEE')).toBe('light')
    })

    it('returns the label unchanged when the vendor is not present', () => {
      expect(stripVendorFromLabel('Front Door', 'Eufy')).toBe('Front Door')
    })

    it('returns an empty string when the vendor is inside a word, which matter.js refuses too', () => {
      expect(stripVendorFromLabel('LGTV Lounge', 'LG')).toBe('')
      expect(stripVendorFromLabel('Evening Lamp', 'Eve')).toBe('')
      expect(stripVendorFromLabel('Lamp 2000', '200')).toBe('')
      // with another case it is not the vendor, for matter.js either
      expect(stripVendorFromLabel('Garage Door', 'GE')).toBe('Garage Door')
    })

    it('returns an empty string when stripping consumes the entire label', () => {
      // Matches the main-bridge edge case where displayName === vendorName.
      // Callers are expected to supply a non-vendor fallback in this case.
      expect(stripVendorFromLabel('Homebridge', 'Homebridge')).toBe('')
      expect(stripVendorFromLabel('  Eufy  ', 'Eufy')).toBe('')
    })

    it('returns the label unchanged when the vendor is empty or undefined', () => {
      expect(stripVendorFromLabel('Eufy Front Door', '')).toBe('Eufy Front Door')
      expect(stripVendorFromLabel('Eufy Front Door', undefined)).toBe('Eufy Front Door')
    })

    it('returns an empty string when the label is empty or undefined', () => {
      expect(stripVendorFromLabel('', 'Eufy')).toBe('')
      expect(stripVendorFromLabel(undefined, 'Eufy')).toBe('')
    })

    it('strips every occurrence of the vendor', () => {
      expect(stripVendorFromLabel('Eufy Eufy Camera', 'Eufy')).toBe('Camera')
      expect(stripVendorFromLabel('Eve Light by Eve', 'Eve')).toBe('Light by')
    })

    it.each([
      { label: 'Garage Door', vendor: 'GE' },
      { label: 'Bulgaria Lamp', vendor: 'LG' },
    ])('leaves "$label" alone for the vendor "$vendor", which is only part of a word with another case', ({ label, vendor }) => {
      expect(stripVendorFromLabel(label, vendor)).toBe(label)
    })

    it('copes with a vendor name that holds characters with a meaning in patterns', () => {
      expect(stripVendorFromLabel('A.C.M.E (EU) Plug', 'A.C.M.E (EU)')).toBe('Plug')
      expect(stripVendorFromLabel('AxCxMxE Plug', 'A.C.M.E')).toBe('AxCxMxE Plug')
    })

    it('strips a vendor next to punctuation', () => {
      expect(stripVendorFromLabel('Eufy: Front Door', 'Eufy')).toBe('Front Door')
      expect(stripVendorFromLabel('Front Door (Eufy)', 'Eufy')).toBe('Front Door ()')
    })

    it('collapses repeated whitespace introduced by the strip', () => {
      expect(stripVendorFromLabel('Eufy   Front Door', 'Eufy')).toBe('Front Door')
      expect(stripVendorFromLabel('My Eufy Front Door', 'Eufy')).toBe('My Front Door')
    })
  })

  describe('getMatterJsVersion', () => {
    it('returns the raw semver string with no leading "v" so callers can format with v%s', () => {
      // Callers log it as `Matter.js v%s` — a leading `v` here would
      // produce `Matter.js vv0.17.0`. Lock the contract so a future
      // tweak doesn't reintroduce the double prefix.
      const version = getMatterJsVersion()
      expect(version).toMatch(/^\d+\.\d+\.\d+/)
      expect(version.startsWith('v')).toBe(false)
    })
  })
})
