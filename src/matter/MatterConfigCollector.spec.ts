import type { HomebridgeConfig } from '../bridgeService.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import {
  isMatterActive,
  isMatterConfigEnabled,
  MatterConfigCollector,
  shouldStartMatterServer,
  stripMatterExternalsOnlyForAccessory,
  validateMatterExternalsOnly,
} from './config.js'
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

  describe('collectConfiguredMatterPorts', () => {
    it('collects the main bridge and child bridge ports', () => {
      mockConfig.bridge.matter = { port: 5540 }
      mockConfig.platforms = [
        { platform: 'P', _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5541 } } } as any,
      ]
      mockConfig.accessories = [
        { accessory: 'A', name: 'A', _bridge: { username: 'AA:BB:CC:DD:EE:02', matter: { port: 5542 } } } as any,
      ]

      expect(MatterConfigCollector.collectConfiguredMatterPorts(mockConfig)).toEqual([5540, 5541, 5542])
    })

    it('still reserves the port of a disabled-in-place bridge (port-preserved contract) (#3944)', () => {
      // A disabled bridge keeps its configured port reserved so re-enabling it
      // later reuses the same port and the allocator never hands it out in the
      // meantime. This intentionally makes the port unavailable for auto-allocation.
      mockConfig.bridge.matter = { enabled: false, port: 5540 }

      expect(MatterConfigCollector.collectConfiguredMatterPorts(mockConfig)).toContain(5540)
    })

    it('returns an empty list when no ports are configured', () => {
      expect(MatterConfigCollector.collectConfiguredMatterPorts(mockConfig)).toEqual([])
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

    it('reserves the main bridge Matter port for the child validator when the main server will start', async () => {
      mockConfig.bridge.matter = { port: 5540 } // enabled by default
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5541 } },
        } as any,
      ]

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      const reserved = vi.mocked(MatterConfigValidator.validateAllChildMatterConfigs).mock.calls[0][2] as Set<number>
      expect(reserved.has(5540)).toBe(true)
    })

    it('does not reserve a disabled main bridge Matter port, so a child can reuse it', async () => {
      // Regression: a disabled main bridge never binds its port, so reserving
      // it wrongly stripped an enabled child that legitimately used the same port.
      mockConfig.bridge.matter = { port: 5540, enabled: false }
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5540 } },
        } as any,
      ]

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      const reserved = vi.mocked(MatterConfigValidator.validateAllChildMatterConfigs).mock.calls[0][2] as Set<number>
      expect(reserved.has(5540)).toBe(false)
    })

    it('does not reserve an externalsOnly main bridge Matter port', async () => {
      // externalsOnly main never starts its bridge server either, so its port
      // must not block a child from using the same number.
      mockConfig.bridge.matter = { port: 5540, enabled: false, externalsOnly: true } as any
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { port: 5541 } },
        } as any,
      ]

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      const reserved = vi.mocked(MatterConfigValidator.validateAllChildMatterConfigs).mock.calls[0][2] as Set<number>
      expect(reserved.has(5540)).toBe(false)
    })

    it('preserves a disabled main bridge Matter config instead of validating/stripping it', async () => {
      // disabled-in-place: even if the config would be "invalid", a disabled main
      // bridge must not be validated or stripped — it never starts a server.
      mockConfig.bridge.matter = { port: 5540, enabled: false }
      vi.mocked(MatterConfigValidator.validate).mockReturnValue({
        isValid: false,
        errors: ['Invalid port'],
        warnings: [],
      })
      // An active child makes hasMatterConfig true so validation actually runs.
      mockConfig.platforms = [
        {
          platform: 'TestPlatform',
          _bridge: { username: 'AA:BB:CC:DD:EE:09', matter: { port: 5550 } },
        } as any,
      ]

      await MatterConfigCollector.validateMatterConfig(mockConfig)

      expect(mockConfig.bridge.matter).toBeDefined() // preserved, not stripped
      expect(MatterConfigValidator.validate).not.toHaveBeenCalled() // disabled main not validated
    })

    describe('externalsOnly validation', () => {
      it('honours main bridge matter.externalsOnly: true set without enabled: false (warns + normalises, does not throw)', async () => {
        const warnSpy = vi.mocked(Logger).internal.warn
        mockConfig.bridge.matter = { externalsOnly: true } as any

        await expect(MatterConfigCollector.validateMatterConfig(mockConfig)).resolves.not.toThrow()

        expect((mockConfig.bridge.matter as any).enabled).toBe(false) // normalised to canonical form
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/externalsOnly.*without.*enabled: false/),
        )
      })

      it('honours main bridge matter with externalsOnly: true + enabled: true (warns + normalises enabled to false)', async () => {
        const warnSpy = vi.mocked(Logger).internal.warn
        mockConfig.bridge.matter = { enabled: true, externalsOnly: true } as any

        await expect(MatterConfigCollector.validateMatterConfig(mockConfig)).resolves.not.toThrow()

        expect((mockConfig.bridge.matter as any).enabled).toBe(false)
        expect(warnSpy).toHaveBeenCalled()
      })

      it('accepts main bridge matter.externalsOnly: true + enabled: false (canonical form, no warning)', async () => {
        const warnSpy = vi.mocked(Logger).internal.warn
        mockConfig.bridge.matter = { enabled: false, externalsOnly: true } as any

        await expect(MatterConfigCollector.validateMatterConfig(mockConfig)).resolves.not.toThrow()
        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringMatching(/externalsOnly.*without.*enabled: false/),
        )
      })

      it('honours a platform child bridge matter.externalsOnly: true without enabled: false (warns + normalises)', async () => {
        const warnSpy = vi.mocked(Logger).internal.warn
        mockConfig.platforms = [
          {
            platform: 'TestPlatform',
            _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { externalsOnly: true } },
          } as any,
        ]

        await expect(MatterConfigCollector.validateMatterConfig(mockConfig)).resolves.not.toThrow()

        expect((mockConfig.platforms[0]._bridge as any).matter.enabled).toBe(false)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/platform "TestPlatform" child bridge.*externalsOnly/),
        )
      })

      it('strips matter.externalsOnly on accessory child bridges with a warn log', async () => {
        const warnSpy = vi.mocked(Logger).internal.warn
        mockConfig.accessories = [
          {
            accessory: 'TestAccessory',
            name: 'Test',
            _bridge: { username: 'AA:BB:CC:DD:EE:02', matter: { enabled: false, externalsOnly: true } },
          } as any,
        ]

        await MatterConfigCollector.validateMatterConfig(mockConfig)

        expect((mockConfig.accessories[0]._bridge as any).matter.externalsOnly).toBeUndefined()
        expect((mockConfig.accessories[0]._bridge as any).matter.enabled).toBe(false)
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/externalsOnly.*not supported.*accessory/),
        )
      })
    })
  })

  describe('isMatterConfigEnabled', () => {
    it('returns false for undefined matter', () => {
      expect(isMatterConfigEnabled(undefined)).toBe(false)
    })

    it('returns true for an empty matter object (default enabled)', () => {
      expect(isMatterConfigEnabled({})).toBe(true)
    })

    it('returns true when enabled is explicitly true', () => {
      expect(isMatterConfigEnabled({ enabled: true })).toBe(true)
    })

    it('returns false when enabled is explicitly false', () => {
      expect(isMatterConfigEnabled({ enabled: false })).toBe(false)
    })

    it('returns false when in externalsOnly mode (enabled: false + externalsOnly: true)', () => {
      // isMatterConfigEnabled is the strict-sense check; externalsOnly mode counts as disabled here.
      expect(isMatterConfigEnabled({ enabled: false, externalsOnly: true })).toBe(false)
    })
  })

  describe('isMatterActive', () => {
    it('returns false for undefined matter', () => {
      expect(isMatterActive(undefined)).toBe(false)
    })

    it('returns true for an empty matter object (default enabled)', () => {
      expect(isMatterActive({})).toBe(true)
    })

    it('returns true when enabled is explicitly true', () => {
      expect(isMatterActive({ enabled: true })).toBe(true)
    })

    it('returns false when fully disabled (enabled: false, no externalsOnly)', () => {
      expect(isMatterActive({ enabled: false })).toBe(false)
    })

    it('returns true in externalsOnly mode (enabled: false + externalsOnly: true) — API surface still needed', () => {
      expect(isMatterActive({ enabled: false, externalsOnly: true })).toBe(true)
    })
  })

  describe('shouldStartMatterServer', () => {
    it('returns false for undefined matter', () => {
      expect(shouldStartMatterServer(undefined)).toBe(false)
    })

    it('returns true when enabled and not externalsOnly', () => {
      expect(shouldStartMatterServer({ enabled: true })).toBe(true)
    })

    it('returns true for an empty matter object (default enabled, not externalsOnly)', () => {
      expect(shouldStartMatterServer({})).toBe(true)
    })

    it('returns false when fully disabled', () => {
      expect(shouldStartMatterServer({ enabled: false })).toBe(false)
    })

    it('returns false in externalsOnly mode', () => {
      expect(shouldStartMatterServer({ enabled: false, externalsOnly: true })).toBe(false)
    })
  })

  describe('validateMatterExternalsOnly', () => {
    it('does not warn or mutate when externalsOnly is not set', () => {
      const warnSpy = vi.mocked(Logger).internal.warn
      const matter = { enabled: true, port: 5540 }
      expect(() => validateMatterExternalsOnly(matter, 'main bridge')).not.toThrow()
      expect(matter.enabled).toBe(true) // untouched
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn or mutate for canonical form (enabled: false + externalsOnly: true)', () => {
      const warnSpy = vi.mocked(Logger).internal.warn
      const matter = { enabled: false, externalsOnly: true }
      expect(() => validateMatterExternalsOnly(matter, 'main bridge')).not.toThrow()
      expect(matter.enabled).toBe(false)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('honours externalsOnly: true set without enabled: false (warns + sets enabled: false)', () => {
      const warnSpy = vi.mocked(Logger).internal.warn
      const matter: { externalsOnly: boolean, enabled?: boolean } = { externalsOnly: true }
      expect(() => validateMatterExternalsOnly(matter, 'main bridge')).not.toThrow()
      expect(matter.enabled).toBe(false) // normalised in place
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly.*without.*enabled: false/))
    })

    it('honours externalsOnly: true set with enabled: true (warns + flips enabled to false)', () => {
      const warnSpy = vi.mocked(Logger).internal.warn
      const matter = { enabled: true, externalsOnly: true }
      expect(() => validateMatterExternalsOnly(matter, 'main bridge')).not.toThrow()
      expect(matter.enabled).toBe(false)
      expect(warnSpy).toHaveBeenCalled()
    })

    it('includes the bridge label in the warning message', () => {
      const warnSpy = vi.mocked(Logger).internal.warn
      validateMatterExternalsOnly({ externalsOnly: true }, 'platform "foo" child bridge')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/platform "foo" child bridge/))
    })
  })

  describe('stripMatterExternalsOnlyForAccessory', () => {
    it('is a no-op when externalsOnly is not set', () => {
      const matter = { enabled: false }
      const warnSpy = vi.mocked(Logger).internal.warn

      stripMatterExternalsOnlyForAccessory(matter, 'accessory child')

      expect(matter).toEqual({ enabled: false })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('strips externalsOnly: true with a warn log', () => {
      const matter = { enabled: false, externalsOnly: true } as any
      const warnSpy = vi.mocked(Logger).internal.warn

      stripMatterExternalsOnlyForAccessory(matter, 'accessory "foo" child bridge')

      expect(matter.externalsOnly).toBeUndefined()
      expect(matter.enabled).toBe(false)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/externalsOnly.*not supported.*accessory/),
      )
    })

    it('leaves other matter fields untouched', () => {
      const matter = { enabled: true, externalsOnly: true, port: 5540, name: 'X' } as any

      stripMatterExternalsOnlyForAccessory(matter, 'accessory child')

      expect(matter.enabled).toBe(true)
      expect(matter.port).toBe(5540)
      expect(matter.name).toBe('X')
      expect(matter.externalsOnly).toBeUndefined()
    })
  })

  describe('hasMatterConfig with externalsOnly', () => {
    it('returns true when main bridge is in externalsOnly mode', () => {
      const config = {
        ...mockConfig,
        bridge: { ...mockConfig.bridge, matter: { enabled: false, externalsOnly: true } },
      } as HomebridgeConfig
      expect(MatterConfigCollector.hasMatterConfig(config)).toBe(true)
    })

    it('returns true when a platform child bridge is in externalsOnly mode', () => {
      const config = {
        ...mockConfig,
        platforms: [
          {
            platform: 'X',
            _bridge: { username: 'AA:BB:CC:DD:EE:01', matter: { enabled: false, externalsOnly: true } },
          },
        ],
      } as unknown as HomebridgeConfig
      expect(MatterConfigCollector.hasMatterConfig(config)).toBe(true)
    })
  })
})
