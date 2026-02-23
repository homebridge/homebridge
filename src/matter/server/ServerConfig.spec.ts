import type { MatterServerConfig } from '../sharedTypes.js'

import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_MATTER_PORT, validateAndSanitizeConfig } from './ServerConfig.js'

// Mock the configValidator module
vi.mock('../configValidator.js', () => ({
  validatePort: vi.fn((port: number) => {
    if (!Number.isInteger(port) || port < 1025 || port > 65534) {
      return { valid: false, error: `Port must be between 1025 and 65534 (got: ${port})` }
    }
    return { valid: true }
  }),
  sanitizeUniqueId: vi.fn((value: string) => ({
    value: value.replace(/[^\w-]/g, ''),
    warnings: [],
  })),
  truncateString: vi.fn((value: string, maxLength: number) => ({
    value: value.slice(0, maxLength),
    warnings: value.length > maxLength ? [`Truncated to ${maxLength} characters`] : [],
  })),
}))
vi.mock('../types.js', async () => {
  class MatterDeviceError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'MatterDeviceError'
    }
  }
  return { MatterDeviceError }
})

describe('serverConfig', () => {
  describe('constants', () => {
    it('should export default port', () => {
      expect(DEFAULT_MATTER_PORT).toBe(5540)
    })
  })

  describe('validateAndSanitizeConfig', () => {
    const validConfig: MatterServerConfig = {
      port: 5540,
      uniqueId: 'test-bridge-001',
    }

    it('should accept a valid minimal config', () => {
      const result = validateAndSanitizeConfig(validConfig)
      expect(result.uniqueId).toBe('test-bridge-001')
      expect(result.port).toBe(5540)
    })

    it('should use default port when not specified', () => {
      const result = validateAndSanitizeConfig({ uniqueId: 'test-bridge' })
      expect(result.port).toBe(DEFAULT_MATTER_PORT)
    })

    it('should throw for missing uniqueId', () => {
      expect(() => validateAndSanitizeConfig({ uniqueId: '' })).toThrow('validation failed')
    })

    it('should throw for invalid port', () => {
      expect(() => validateAndSanitizeConfig({ uniqueId: 'test', port: 80 })).toThrow('Invalid port')
    })

    it('should pass through optional string fields after sanitization', () => {
      const config: MatterServerConfig = {
        uniqueId: 'test-bridge',
        manufacturer: 'Test Manufacturer',
        model: 'Test Model',
        firmwareRevision: '1.0.0',
        serialNumber: 'SN-001',
      }
      const result = validateAndSanitizeConfig(config)
      expect(result.manufacturer).toBe('Test Manufacturer')
      expect(result.model).toBe('Test Model')
      expect(result.firmwareRevision).toBe('1.0.0')
      expect(result.serialNumber).toBe('SN-001')
    })

    it('should default debugModeEnabled to false', () => {
      const result = validateAndSanitizeConfig(validConfig)
      expect(result.debugModeEnabled).toBe(false)
    })

    it('should preserve debugModeEnabled when true', () => {
      const result = validateAndSanitizeConfig({ ...validConfig, debugModeEnabled: true })
      expect(result.debugModeEnabled).toBe(true)
    })

    it('should default externalAccessory to false', () => {
      const result = validateAndSanitizeConfig(validConfig)
      expect(result.externalAccessory).toBe(false)
    })

    it('should preserve externalAccessory when true', () => {
      const result = validateAndSanitizeConfig({ ...validConfig, externalAccessory: true })
      expect(result.externalAccessory).toBe(true)
    })

    it('should resolve storagePath to absolute path', () => {
      const result = validateAndSanitizeConfig({ ...validConfig, storagePath: './data' })
      // resolve() should produce an absolute path
      expect(result.storagePath).toContain('data')
      expect(result.storagePath).not.toBeUndefined()
    })

    it('should leave storagePath undefined when not provided', () => {
      const result = validateAndSanitizeConfig(validConfig)
      expect(result.storagePath).toBeUndefined()
    })

    it('should collect multiple errors and report all at once', () => {
      try {
        validateAndSanitizeConfig({ uniqueId: '', port: 80 })
        expect.fail('Should have thrown')
      } catch (error: any) {
        // Should contain both port and uniqueId errors
        expect(error.message).toContain('Invalid port')
        expect(error.message).toContain('uniqueId')
      }
    })
  })
})
