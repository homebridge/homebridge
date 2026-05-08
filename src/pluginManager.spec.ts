import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI } from './api.js'
import { Logger } from './logger.js'
import { PluginManager } from './pluginManager.js'

describe('pluginManager', () => {
  describe('pluginManager.isQualifiedPluginIdentifier', () => {
    it('should match normal plugin names', () => {
      expect(PluginManager.isQualifiedPluginIdentifier('homebridge-dummy-plugin')).toBeTruthy()
    })

    it('should match scoped plugin names', () => {
      expect(PluginManager.isQualifiedPluginIdentifier('@organisation/homebridge-dummy-plugin')).toBeTruthy()
    })
  })

  describe('pluginManager.extractPluginName', () => {
    it('should extract normal plugin names', () => {
      expect(PluginManager.extractPluginName('homebridge-dummy-plugin')).toBe('homebridge-dummy-plugin')
    })

    it('should extract scoped plugin names', () => {
      expect(PluginManager.extractPluginName('@organisation/homebridge-dummy-plugin')).toBe('homebridge-dummy-plugin')
    })

    it('should throw for invalid identifiers', () => {
      expect(() => PluginManager.extractPluginName('invalid-name'))
        .toThrow('Cannot extract plugin name from invalid identifier: \'invalid-name\'')
    })
  })

  describe('pluginManager.extractPluginScope', () => {
    it('should extract undefined for normal plugin names', () => {
      expect(PluginManager.extractPluginScope('homebridge-dummy-plugin')).toBeUndefined()
    })

    it('should extract scope for scoped plugin names', () => {
      expect(PluginManager.extractPluginScope('@organisation/homebridge-dummy-plugin')).toBe('@organisation')
    })

    it('should throw for invalid identifiers', () => {
      expect(() => PluginManager.extractPluginScope('invalid-name'))
        .toThrow('Cannot extract plugin scope from invalid identifier: \'invalid-name\'')
    })
  })

  describe('options validation', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      // Logger.internal.warn is the surface the coercion warns through.
      // Spy on it so we can assert the user actually gets a heads-up
      // about a typo'd config — silently coercing to undefined would
      // give them "all plugins load" with zero feedback.
      warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('coerces non-array activePlugins to undefined and warns', () => {
      const api = new HomebridgeAPI()
      // A string here would otherwise let `includes(pluginIdentifier)` do a
      // substring match — `"homebridge-foobar".includes("homebridge-foo")`
      // is true, producing surprise allow-list hits.
      const manager = new PluginManager(api, {
        activePlugins: 'homebridge-foo' as any,
      })
      expect((manager as any).activePlugins).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('config.plugins must be an array'))
    })

    it('keeps activePlugins when it is a real array (no warning)', () => {
      const api = new HomebridgeAPI()
      const manager = new PluginManager(api, {
        activePlugins: ['homebridge-foo', 'homebridge-bar'],
      })
      expect((manager as any).activePlugins).toEqual(['homebridge-foo', 'homebridge-bar'])
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('mirrors the same defensive coercion and warning for disabledPlugins', () => {
      const api = new HomebridgeAPI()
      const manager = new PluginManager(api, {
        disabledPlugins: 'homebridge-foo' as any,
      })
      expect((manager as any).disabledPlugins).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('config.disabledPlugins must be an array'))
    })

    it('treats undefined as undefined silently (no warning)', () => {
      const api = new HomebridgeAPI()
      // The default code path: user didn't set the field at all. Coercion
      // must not warn here — otherwise every install would log on startup.
      const manager = new PluginManager(api, {})
      expect((manager as any).activePlugins).toBeUndefined()
      expect((manager as any).disabledPlugins).toBeUndefined()
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  describe('addNpmPrefixToSearchPaths env composition (POSIX)', () => {
    it('passes process.env first then overrides the silencing keys', async () => {
      // Smoke through a fresh module import so we can intercept execSync.
      vi.resetModules()
      const { Buffer } = await import('node:buffer')
      const execMock = vi.fn(() => Buffer.from('/usr/local/lib/node_modules', 'utf8'))
      // The bare vi.fn() infers a zero-arg call signature, so mock.calls is
      // typed as empty tuples. Cast to the (command, options) shape we actually
      // invoke execSync with so the assertions below can read calls[0][1].env.
      type ExecSyncCall = [command: string, options: { env: Record<string, string | undefined> }]
      vi.doMock('node:child_process', () => ({ execSync: execMock }))

      try {
        const { PluginManager: FreshPM } = await import('./pluginManager.js')
        const { HomebridgeAPI: FreshAPI } = await import('./api.js')

        const api = new FreshAPI()
        const manager = new FreshPM(api)

        // Skip on Windows — addNpmPrefixToSearchPaths uses APPDATA there
        // and never shells out.
        if (process.platform === 'win32') {
          return
        }
        ;(manager as any).addNpmPrefixToSearchPaths()

        expect(execMock).toHaveBeenCalled()
        const env = (execMock.mock.calls as unknown as ExecSyncCall[])[0][1].env

        // process.env values must come through, but the silencing keys must
        // win even when the user exported a noisy value.
        expect(env.npm_config_loglevel).toBe('silent')
        expect(env.npm_update_notifier).toBe('false')

        // Independently verify the override order by simulating a noisy
        // user-exported PATH-style key passing through and a noisy npm one
        // being trumped. We re-call with a process-env-like object containing
        // a conflicting npm_config_loglevel and assert the silencing wins.
        const originalEnv = process.env
        try {
          process.env = { ...originalEnv, npm_config_loglevel: 'info', PATH: '/custom/path' } as any
          execMock.mockClear()
          ;(manager as any).addNpmPrefixToSearchPaths()
          const env2 = (execMock.mock.calls as unknown as ExecSyncCall[])[0][1].env
          expect(env2.PATH).toBe('/custom/path') // user value preserved
          expect(env2.npm_config_loglevel).toBe('silent') // user value overridden
        } finally {
          process.env = originalEnv
        }
      } finally {
        vi.doUnmock('node:child_process')
        vi.resetModules()
      }
    })
  })

  describe('initializePlugin currentInitializingPlugin reset', () => {
    function buildPluginStub(initialize: (api: any) => void | Promise<void>) {
      return {
        getPluginIdentifier: () => 'homebridge-stub',
        initialize: vi.fn(initialize),
      } as any
    }

    it('clears currentInitializingPlugin after a successful initializer', async () => {
      const api = new HomebridgeAPI()
      const manager = new PluginManager(api)

      const plugin = buildPluginStub(() => {})
      await manager.initializePlugin(plugin, 'homebridge-stub')

      expect((manager as any).currentInitializingPlugin).toBeUndefined()
    })

    it('clears currentInitializingPlugin even when the initializer throws', async () => {
      const api = new HomebridgeAPI()
      const manager = new PluginManager(api)
      // Silence the manager's "ERROR INITIALIZING PLUGIN" log line.
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const plugin = buildPluginStub(() => {
        throw new Error('boom')
      })

      await manager.initializePlugin(plugin, 'homebridge-stub')

      // Without the finally{} reset, a stale reference here would let any
      // late async registration get attributed to a now-deleted plugin.
      expect((manager as any).currentInitializingPlugin).toBeUndefined()
    })
  })

  describe('...Name', () => {
    it('should extract accessory name correctly', () => {
      const accessoryId = 'homebridge-example-accessory.example'
      expect(PluginManager.getAccessoryName(accessoryId)).toBe('example')
    })

    it('should extract platform name correctly', () => {
      const accessoryId = 'homebridge-example-platform.example'
      expect(PluginManager.getPlatformName(accessoryId)).toBe('example')
    })

    it('should extract plugin name correctly', () => {
      const accessoryId = 'homebridge-example-plugin.example'
      expect(PluginManager.getPluginIdentifier(accessoryId)).toBe('homebridge-example-plugin')
    })
  })
})
