import type { HomebridgeConfig } from '../bridgeService.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import { MatterConfigCollector } from './config.js'
import { MatterConfigValidator } from './configValidator.js'

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
      internal: mockLogger,
    },
  }
})

// Mock MatterConfigValidator
vi.mock('./configValidator.js', () => ({
  MatterConfigValidator: {
    validate: vi.fn(),
    validateAllChildMatterConfigs: vi.fn(),
  },
}))

describe('matterConfigCollector', () => {
  let logErrorSpy: any
  let mockConfig: HomebridgeConfig

  beforeEach(() => {
    vi.clearAllMocks()
    logErrorSpy = vi.mocked(Logger).internal.error

    // Create a basic mock config
    mockConfig = {
      bridge: {
        name: 'Test Bridge',
        username: 'AA:BB:CC:DD:EE:FF',
        pin: '031-45-154',
      },
      platforms: [],
      accessories: [],
    } as HomebridgeConfig
  })

  describe('hasMatterConfig', () => {
    it('returns false when no bridge has Matter configured', () => {
      expect(MatterConfigCollector.hasMatterConfig(mockConfig)).toBe(false)
    })

    it('returns true when the main bridge has Matter configured', () => {
      const config = { ...mockConfig, bridge: { ...mockConfig.bridge, matter: { port: 5540 } } } as HomebridgeConfig
      expect(MatterConfigCollector.hasMatterConfig(config)).toBe(true)
    })

    it('returns false when the only Matter config is explicitly disabled', () => {
      const config = { ...mockConfig, bridge: { ...mockConfig.bridge, matter: { port: 5540, enabled: false } } } as HomebridgeConfig
      expect(MatterConfigCollector.hasMatterConfig(config)).toBe(false)
    })

    it('returns true when a child bridge has Matter enabled even if the main bridge disabled it', () => {
      const config = {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, matter: { port: 5540, enabled: false } },
        platforms: [{ platform: 'X', _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5541 } } }],
      } as unknown as HomebridgeConfig
      expect(MatterConfigCollector.hasMatterConfig(config)).toBe(true)
    })
  })

  describe('validateMatterPortsPool', () => {
    it('should accept valid matterPorts configuration', () => {
      mockConfig.matterPorts = { start: 5530, end: 5541 }

      MatterConfigCollector.validateMatterPortsPool(mockConfig)

      expect(mockConfig.matterPorts).toEqual({ start: 5530, end: 5541 })
      expect(logErrorSpy).not.toHaveBeenCalled()
    })

    it('should accept matterPorts where start equals end', () => {
      mockConfig.matterPorts = { start: 5540, end: 5540 }

      MatterConfigCollector.validateMatterPortsPool(mockConfig)

      expect(mockConfig.matterPorts).toEqual({ start: 5540, end: 5540 })
      expect(logErrorSpy).not.toHaveBeenCalled()
    })

    it('should reject matterPorts where start > end', () => {
      mockConfig.matterPorts = { start: 5550, end: 5540 }

      MatterConfigCollector.validateMatterPortsPool(mockConfig)

      expect(mockConfig.matterPorts).toBeUndefined()
      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Matter port pool configuration'),
      )
    })

    it('should reject matterPorts with missing start property', () => {
      mockConfig.matterPorts = { end: 5541 } as any

      MatterConfigCollector.validateMatterPortsPool(mockConfig)

      expect(mockConfig.matterPorts).toBeUndefined()
      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing \'start\' and \'end\' properties'),
      )
    })

    it('should reject matterPorts with missing end property', () => {
      mockConfig.matterPorts = { start: 5530 } as any

      MatterConfigCollector.validateMatterPortsPool(mockConfig)

      expect(mockConfig.matterPorts).toBeUndefined()
      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing \'start\' and \'end\' properties'),
      )
    })

    it('should do nothing if matterPorts is undefined', () => {
      mockConfig.matterPorts = undefined

      MatterConfigCollector.validateMatterPortsPool(mockConfig)

      expect(mockConfig.matterPorts).toBeUndefined()
      expect(logErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('validateMatterConfig', () => {
    beforeEach(() => {
      // Set up validator mocks to return valid by default
      vi.mocked(MatterConfigValidator.validate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      })
      vi.mocked(MatterConfigValidator.validateAllChildMatterConfigs).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      })
    })

    it('should skip validation if no Matter config exists', async () => {
      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(MatterConfigValidator.validate).not.toHaveBeenCalled()
      expect(MatterConfigValidator.validateAllChildMatterConfigs).not.toHaveBeenCalled()
    })

    it('should validate main bridge Matter config if present', async () => {
      mockConfig.bridge.matter = { port: 5540 }

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(MatterConfigValidator.validate).toHaveBeenCalledWith(mockConfig.bridge.matter)
    })

    it('should remove invalid main bridge Matter config', async () => {
      mockConfig.bridge.matter = { port: 5540 }
      vi.mocked(MatterConfigValidator.validate).mockReturnValue({
        isValid: false,
        errors: ['Invalid port'],
        warnings: [],
      })

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(mockConfig.bridge.matter).toBeUndefined()
      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Main bridge Matter configuration is invalid'),
      )
    })

    it('should validate child bridge Matter configs', async () => {
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5541 } },
        } as any,
      ]

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(MatterConfigValidator.validateAllChildMatterConfigs).toHaveBeenCalledWith(
        mockConfig.platforms,
        mockConfig.accessories,
        expect.any(Set),
      )
    })

    it('should log error if child bridge configs are invalid', async () => {
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 999 } },
        } as any,
      ]
      vi.mocked(MatterConfigValidator.validateAllChildMatterConfigs).mockReturnValue({
        isValid: false,
        errors: ['Port too low'],
        warnings: [],
      })

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Some child bridge Matter configurations were invalid'),
      )
    })

    it('should log each specific child bridge Matter error, not just the generic summary', async () => {
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5541 } },
        } as any,
      ]
      vi.mocked(MatterConfigValidator.validateAllChildMatterConfigs).mockReturnValue({
        isValid: false,
        errors: ['Duplicate Matter port 5541 detected on platform "TestPlatform". Removing this Matter configuration so the rest of the bridge can start.'],
        warnings: [],
      })

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate Matter port 5541 detected on platform "TestPlatform"'),
      )
    })

    it('should log child bridge Matter warnings even when the configs are valid', async () => {
      const logWarnSpy = vi.mocked(Logger).internal.warn
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5541 } },
        } as any,
      ]
      vi.mocked(MatterConfigValidator.validateAllChildMatterConfigs).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: ['Matter port 5541 on platform "TestPlatform" is close to the HAP port.'],
      })

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(logWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('close to the HAP port'),
      )
    })
  })
})
