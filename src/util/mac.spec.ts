import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { generate, validMacAddress } from './mac.js'

describe('mac', () => {
  describe('validMacAddress', () => {
    it('should verify a valid mac address', () => {
      expect(validMacAddress('61:67:0F:6E:B0:48')).toBe(true)
    })

    it('should accept an upper case mac address and reject the same one in lower case', () => {
      const macAddress = '0E:80:9C:B4:E4:C5'
      expect(validMacAddress(macAddress)).toBe(true)
      expect(validMacAddress(macAddress.toLowerCase())).toBe(false)
    })

    it('should reject too short mac address', () => {
      expect(validMacAddress('25:22:04:2B:3A')).toBe(false)
    })

    it('should reject too long mac address', () => {
      expect(validMacAddress('7F:9A:58:0E:87:23:AA')).toBe(false)
    })

    it.each([
      '61-67-0F-6E-B0-48',
      '61670F6EB048',
      '61:67:0F:6E:B0:4G',
      ' 61:67:0F:6E:B0:48',
      '61:67:0F:6E:B0:48\n',
      '',
    ])('should reject %j', (address) => {
      expect(validMacAddress(address)).toBe(false)
    })
  })

  describe('generate', () => {
    it('should give the address a known input has always given', () => {
      // The address is the username an external accessory is paired under, so
      // it must never change for the same input: the first six bytes of the
      // SHA-1 of the input.
      expect(generate('homebridge')).toBe('7D:9F:D3:03:22:F3')
    })

    it('should give the same address for the same input, as a text or as bytes', () => {
      expect(generate('some accessory uuid')).toBe(generate('some accessory uuid'))
      expect(generate(Buffer.from('some accessory uuid'))).toBe(generate('some accessory uuid'))
    })

    it('should give different addresses for different inputs', () => {
      expect(generate('accessory one')).not.toBe(generate('accessory two'))
    })

    it.each([
      '',
      'a',
      '00000000-0000-0000-0000-000000000000',
      'ff'.repeat(64),
    ])('should give a valid mac address for %j', (input) => {
      expect(validMacAddress(generate(input))).toBe(true)
    })
  })
})
