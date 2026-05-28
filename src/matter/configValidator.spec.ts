import type { AccessoryConfig, PlatformConfig } from '../bridgeService.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import {
  checkPortProximity,
  MatterConfigValidator,
  sanitizeUniqueId,
  truncateString,
  validatePort,
} from './configValidator.js'

// Mock Logger
vi.mock('../logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }
  return {
    Logger: {
      withPrefix: vi.fn(() => mockLogger),
    },
  }
})

describe('configValidator', () => {
  let logWarnSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    logWarnSpy = vi.mocked(Logger).withPrefix('test').warn
  })

  describe('validatePort', () => {
    it('should accept valid port numbers', () => {
      expect(validatePort(5540).valid).toBe(true)
      expect(validatePort(1025).valid).toBe(true)
      expect(validatePort(65534).valid).toBe(true)
    })

    it('should reject non-integer port numbers', () => {
      const result = validatePort(5540.5)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be an integer')
    })

    it('should reject port numbers below 1025', () => {
      const result = validatePort(1024)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be between 1025 and 65534')
    })

    it('should reject port numbers above 65534', () => {
      const result = validatePort(65535)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be between 1025 and 65534')
    })

    it('should warn about conflicting ports when checkConflicts is true', () => {
      const result = validatePort(5353, true)
      expect(result.valid).toBe(true)
      expect(result.warning).toContain('may conflict with other services')
    })

    it('should not warn about conflicting ports when checkConflicts is false', () => {
      const result = validatePort(5353, false)
      expect(result.valid).toBe(true)
      expect(result.warning).toBeUndefined()
    })

    it('should warn about common HTTP port 8080', () => {
      const result = validatePort(8080, true)
      expect(result.valid).toBe(true)
      expect(result.warning).toContain('may conflict')
    })

    it('should warn about common HTTPS port 8443', () => {
      const result = validatePort(8443, true)
      expect(result.valid).toBe(true)
      expect(result.warning).toContain('may conflict')
    })
  })

  describe('sanitizeUniqueId', () => {
    it('should remove colons and convert to uppercase', () => {
      const result = sanitizeUniqueId('ab:cd:ef:12:34:56')
      expect(result.value).toBe('ABCDEF123456')
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('was sanitized')
    })

    it('should handle already sanitized IDs', () => {
      const result = sanitizeUniqueId('ABCDEF123456')
      expect(result.value).toBe('ABCDEF123456')
      expect(result.warnings).toHaveLength(0)
    })

    it('should handle empty strings', () => {
      const result = sanitizeUniqueId('')
      expect(result.value).toBe('')
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('empty after trimming')
    })

    it('should keep whitespace (not trimmed)', () => {
      const result = sanitizeUniqueId('  ABCD  ')
      expect(result.value).toBe('  ABCD  ')
      expect(result.warnings).toHaveLength(0)
    })

    it('should warn when sanitization results in empty string', () => {
      const result = sanitizeUniqueId(':::')
      expect(result.value).toBe('')
      expect(result.warnings).toHaveLength(2)
      expect(result.warnings[0]).toContain('was sanitized')
      expect(result.warnings[1]).toContain('resulted in empty string')
    })

    it('should convert lowercase to uppercase', () => {
      const result = sanitizeUniqueId('abcdef')
      expect(result.value).toBe('ABCDEF')
      expect(result.warnings).toHaveLength(1)
    })

    it('should handle mixed case MAC addresses', () => {
      const result = sanitizeUniqueId('Aa:Bb:Cc:Dd:Ee:Ff')
      expect(result.value).toBe('AABBCCDDEEFF')
    })
  })

  describe('truncateString', () => {
    it('should not truncate strings within limit', () => {
      const result = truncateString('Hello', 10, 'testField')
      expect(result.value).toBe('Hello')
      expect(result.warnings).toHaveLength(0)
    })

    it('should truncate strings exceeding limit', () => {
      const result = truncateString('Hello World!', 5, 'testField')
      expect(result.value).toBe('Hello')
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('exceeds 5 characters')
      expect(logWarnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds 5 characters'))
    })

    it('should handle empty strings', () => {
      const result = truncateString('', 10, 'testField')
      expect(result.value).toBe('')
      expect(result.warnings).toHaveLength(0)
    })

    it('should handle exact length strings', () => {
      const result = truncateString('12345', 5, 'testField')
      expect(result.value).toBe('12345')
      expect(result.warnings).toHaveLength(0)
    })

    it('should include field name in warning', () => {
      const result = truncateString('Too Long', 3, 'myField')
      expect(result.warnings[0]).toContain('myField')
    })
  })

  describe('checkPortProximity', () => {
    it('should warn when ports are too close', () => {
      const warning = checkPortProximity(5540, 5545)
      expect(warning).toBeDefined()
      expect(warning).toContain('very close')
    })

    it('should not warn when ports are far apart', () => {
      const warning = checkPortProximity(5540, 5560)
      expect(warning).toBeUndefined()
    })

    it('should warn when ports differ by less than 10', () => {
      const warning = checkPortProximity(8080, 8089)
      expect(warning).toBeDefined()
    })

    it('should not warn when ports differ by 10 or more', () => {
      const warning = checkPortProximity(8080, 8090)
      expect(warning).toBeUndefined()
    })

    it('should check absolute difference (order independent)', () => {
      const warning1 = checkPortProximity(5540, 5545)
      const warning2 = checkPortProximity(5545, 5540)
      expect(warning1).toBeDefined()
      expect(warning2).toBeDefined()
    })

    it('should warn when ports are identical', () => {
      const warning = checkPortProximity(5540, 5540)
      expect(warning).toBeDefined()
    })
  })

  describe('matterConfigValidator.validate', () => {
    it('should validate valid config', () => {
      const config = { port: 5540 }
      const result = MatterConfigValidator.validate(config)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid port type', () => {
      const config = { port: '5540' }
      const result = MatterConfigValidator.validate(config)
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('must be a number')
    })

    it('should reject invalid port number', () => {
      const config = { port: 99999 }
      const result = MatterConfigValidator.validate(config)
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
    })

    it('should allow config without port', () => {
      const config = {}
      const result = MatterConfigValidator.validate(config)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should include warnings for conflicting ports', () => {
      const config = { port: 5353 }
      const result = MatterConfigValidator.validate(config)
      expect(result.isValid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should handle null port', () => {
      const config = { port: null }
      const result = MatterConfigValidator.validate(config)
      expect(result.isValid).toBe(true)
    })
  })

  describe('matterConfigValidator.validateChildMatterConfig', () => {
    it('should validate valid child config', () => {
      const config: PlatformConfig = {
        platform: 'TestPlatform',
        _bridge: {
          name: 'Test Bridge',
          username: 'AA:BB:CC:DD:EE:FF' as any,
          pin: '123-45-678',
          matter: {
            port: 5540,
          },
        },
      }
      const result = MatterConfigValidator.validateChildMatterConfig(config, 'platform', 'TestPlatform')
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid port in child config', () => {
      const config: PlatformConfig = {
        platform: 'TestPlatform',
        _bridge: {
          name: 'Test Bridge',
          username: 'AA:BB:CC:DD:EE:FF' as any,
          pin: '123-45-678',
          matter: {
            port: 99999,
          },
        },
      }
      const result = MatterConfigValidator.validateChildMatterConfig(config, 'platform', 'TestPlatform')
      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should warn when no port specified', () => {
      const config: PlatformConfig = {
        platform: 'TestPlatform',
        _bridge: {
          name: 'Test',
          username: 'AA:BB:CC:DD:EE:FF' as any,
          pin: '123-45-678',
          matter: {},
        },
      }
      const result = MatterConfigValidator.validateChildMatterConfig(config, 'platform', 'TestPlatform')
      expect(result.isValid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('No port specified')
    })

    it('should warn about port proximity with HAP bridge', () => {
      const config: PlatformConfig = {
        platform: 'TestPlatform',
        _bridge: {
          name: 'Test',
          username: 'AA:BB:CC:DD:EE:FF' as any,
          pin: '123-45-678',
          port: 51826,
          matter: {
            port: 51828,
          },
        },
      }
      const result = MatterConfigValidator.validateChildMatterConfig(config, 'platform', 'TestPlatform')
      expect(result.isValid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.includes('very close'))).toBe(true)
    })

    it('should validate accessory config', () => {
      const config: AccessoryConfig = {
        accessory: 'TestAccessory',
        name: 'Test Accessory',
        _bridge: {
          name: 'Test',
          username: 'AA:BB:CC:DD:EE:FF' as any,
          pin: '123-45-678',
          matter: {
            port: 5540,
          },
        },
      }
      const result = MatterConfigValidator.validateChildMatterConfig(config, 'accessory', 'TestAccessory')
      expect(result.isValid).toBe(true)
    })

    it('should return valid result when no _bridge.matter', () => {
      const config: PlatformConfig = {
        platform: 'TestPlatform',
      }
      const result = MatterConfigValidator.validateChildMatterConfig(config, 'platform', 'TestPlatform')
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('matterConfigValidator.validateAllChildMatterConfigs', () => {
    it('should validate multiple platforms', () => {
      const platforms: PlatformConfig[] = [
        {
          platform: 'Platform1',
          _bridge: { matter: { port: 5540 } } as any,
        },
        {
          platform: 'Platform2',
          _bridge: { matter: { port: 5550 } } as any,
        },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])
      expect(result.isValid).toBe(true)
    })

    it('should detect duplicate ports in platforms', () => {
      const platforms: PlatformConfig[] = [
        {
          platform: 'Platform1',
          _bridge: { matter: { port: 5540 } } as any,
        },
        {
          platform: 'Platform2',
          _bridge: { matter: { port: 5540 } } as any,
        },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])
      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate Matter port'))).toBe(true)
    })

    it('should detect duplicate ports in accessories', () => {
      const accessories: AccessoryConfig[] = [
        {
          accessory: 'Accessory1',
          name: 'Test 1',
          _bridge: { matter: { port: 5540 } } as any,
        },
        {
          accessory: 'Accessory2',
          name: 'Test 2',
          _bridge: { matter: { port: 5540 } } as any,
        },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs([], accessories)
      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate Matter port'))).toBe(true)
    })

    it('should detect duplicate ports across platforms and accessories', () => {
      const platforms: PlatformConfig[] = [
        {
          platform: 'Platform1',
          _bridge: { matter: { port: 5540 } } as any,
        },
      ]
      const accessories: AccessoryConfig[] = [
        {
          accessory: 'Accessory1',
          name: 'Test 1',
          _bridge: { matter: { port: 5540 } } as any,
        },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, accessories)
      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate Matter port'))).toBe(true)
    })

    it('should validate empty configs', () => {
      const result = MatterConfigValidator.validateAllChildMatterConfigs([], [])
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should collect all validation errors and warnings', () => {
      const platforms: PlatformConfig[] = [
        {
          platform: 'Platform1',
          _bridge: { matter: { port: 99999 } } as any, // invalid port
        },
        {
          platform: 'Platform2',
          _bridge: { matter: {} } as any, // missing port (warning)
        },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])
      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should skip platforms without _bridge.matter', () => {
      const platforms: PlatformConfig[] = [
        { platform: 'Platform1' },
        { platform: 'Platform2', _bridge: { matter: { port: 5540 } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])
      expect(result.isValid).toBe(true)
    })

    it('strips Matter config from a duplicate-port platform so the rest of the bridge can start', () => {
      const platforms: PlatformConfig[] = [
        { platform: 'Platform1', _bridge: { matter: { port: 5540 } } as any },
        { platform: 'Platform2', _bridge: { matter: { port: 5540 } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])

      expect(result.isValid).toBe(false)
      expect(platforms[0]._bridge?.matter).toBeDefined()
      expect(platforms[1]._bridge?.matter).toBeUndefined()
    })

    it('strips Matter config from an out-of-range port platform', () => {
      const platforms: PlatformConfig[] = [
        { platform: 'BadPlatform', _bridge: { matter: { port: 99999 } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])

      expect(result.isValid).toBe(false)
      expect(platforms[0]._bridge?.matter).toBeUndefined()
    })

    it('honours reservedPorts so main↔child collisions are caught in the same pass', () => {
      const platforms: PlatformConfig[] = [
        { platform: 'Platform1', _bridge: { matter: { port: 5540 } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(
        platforms,
        [],
        new Set([5540]),
      )

      expect(result.isValid).toBe(false)
      expect(platforms[0]._bridge?.matter).toBeUndefined()
    })

    it('preserves a disabled (enabled:false) platform Matter config even when its port is invalid', () => {
      // disabled-in-place: the config must survive so it can be re-enabled later
      // without re-commissioning. It never starts a server, so a bad port is moot.
      const platforms: PlatformConfig[] = [
        { platform: 'DisabledPlatform', _bridge: { matter: { port: 99999, enabled: false } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])

      expect(platforms[0]._bridge?.matter).toBeDefined()
      expect(result.isValid).toBe(true)
    })

    it('does not let a disabled child reserve its port (an active child may reuse it)', () => {
      // The disabled child never binds 5540, so the enabled child using 5540 must
      // not be treated as a duplicate and stripped.
      const platforms: PlatformConfig[] = [
        { platform: 'Disabled', _bridge: { matter: { port: 5540, enabled: false } } as any },
        { platform: 'Active', _bridge: { matter: { port: 5540 } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])

      expect(result.isValid).toBe(true)
      expect(platforms[0]._bridge?.matter).toBeDefined() // disabled preserved
      expect(platforms[1]._bridge?.matter).toBeDefined() // active kept its port
    })

    it('preserves a disabled accessory Matter config with a duplicate port', () => {
      const accessories: AccessoryConfig[] = [
        { accessory: 'Active', name: 'A', _bridge: { matter: { port: 5540 } } as any },
        { accessory: 'Disabled', name: 'D', _bridge: { matter: { port: 5540, enabled: false } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs([], accessories)

      expect(result.isValid).toBe(true)
      expect(accessories[0]._bridge?.matter).toBeDefined()
      expect(accessories[1]._bridge?.matter).toBeDefined()
    })

    it('preserves an externalsOnly child Matter config (it does not bind its port either)', () => {
      const platforms: PlatformConfig[] = [
        { platform: 'ExternalsOnly', _bridge: { matter: { port: 99999, enabled: false, externalsOnly: true } } as any },
      ]
      const result = MatterConfigValidator.validateAllChildMatterConfigs(platforms, [])

      expect(platforms[0]._bridge?.matter).toBeDefined()
      expect(result.isValid).toBe(true)
    })
  })
})
