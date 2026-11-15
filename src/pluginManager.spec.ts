import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
      // Smoke through a fresh module import so we can intercept execFileSync.
      vi.resetModules()
      const execMock = vi.fn(() => '/usr/local\n')
      // The bare vi.fn() infers a zero-arg call signature, so mock.calls is
      // typed as empty tuples. Cast to the (file, arguments, options) shape we actually
      // invoke execFileSync with so the assertions below can inspect its environment.
      type ExecFileSyncCall = [file: string, args: string[], options: { env: Record<string, string | undefined> }]
      vi.doMock('node:child_process', () => ({ execFileSync: execMock }))

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

        expect(execMock).toHaveBeenCalledWith('npm', ['-g', 'prefix'], expect.objectContaining({ encoding: 'utf8' }))
        expect((manager as any).searchPaths.has('/usr/local/lib/node_modules')).toBe(true)
        const env = (execMock.mock.calls as unknown as ExecFileSyncCall[])[0][2].env

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
          const env2 = (execMock.mock.calls as unknown as ExecFileSyncCall[])[0][2].env
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

  describe('addNpmPrefixToSearchPaths when npm can not be run', () => {
    // A service that runs node by its full path may have no npm on its PATH.
    // Until v2.5.0 this lookup could not fail; since then it stopped start-up.
    it('carries on with the other search paths', async () => {
      vi.resetModules()
      vi.doMock('node:child_process', () => ({
        execFileSync: vi.fn(() => {
          throw Object.assign(new Error('spawnSync npm ENOENT'), { code: 'ENOENT' })
        }),
      }))

      try {
        const { PluginManager: FreshPM } = await import('./pluginManager.js')
        const { HomebridgeAPI: FreshAPI } = await import('./api.js')
        const manager = new FreshPM(new FreshAPI())
        const before = [...(manager as any).searchPaths]

        expect(() => (manager as any).addNpmPrefixToSearchPaths()).not.toThrow()

        expect([...(manager as any).searchPaths]).toEqual(before)
      } finally {
        vi.doUnmock('node:child_process')
        vi.resetModules()
      }
    })
  })

  describe('plugin discovery', () => {
    it('discovers direct, scoped, and linked plugin directories using directory entries', () => {
      const searchPath = mkdtempSync(join(tmpdir(), 'homebridge-plugin-discovery-'))
      const linkedPluginTarget = mkdtempSync(join(tmpdir(), 'homebridge-linked-plugin-'))

      try {
        mkdirSync(join(searchPath, 'homebridge-direct'))
        mkdirSync(join(searchPath, '@example'))
        mkdirSync(join(searchPath, '@example', 'homebridge-scoped'))
        mkdirSync(join(searchPath, 'not-a-plugin'))
        writeFileSync(join(searchPath, 'homebridge-file'), '')
        symlinkSync(linkedPluginTarget, join(searchPath, 'homebridge-linked'), 'dir')

        const manager = new PluginManager(new HomebridgeAPI(), {
          customPluginPath: searchPath,
          strictPluginResolution: true,
        })
        const loadPlugin = vi.spyOn(manager, 'loadPlugin').mockReturnValue({} as any)

        ;(manager as any).loadInstalledPlugins()

        expect(loadPlugin.mock.calls.map(([pluginPath]) => pluginPath)).toEqual([
          join(searchPath, 'homebridge-direct'),
          join(searchPath, 'homebridge-linked'),
          join(searchPath, '@example', 'homebridge-scoped'),
        ])
      } finally {
        rmSync(searchPath, { force: true, recursive: true })
        rmSync(linkedPluginTarget, { force: true, recursive: true })
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

  describe('a plugin whose initializer fails', () => {
    function failingPlugin(identifier: string, initialize: (api: HomebridgeAPI) => void | Promise<void>) {
      return {
        getPluginIdentifier: () => identifier,
        registerPlatform: vi.fn(),
        registerAccessory: vi.fn(),
        disabled: false,
        initialize,
      } as any
    }

    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      errorSpy = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      errorSpy.mockRestore()
    })

    it('is not found any more by the short name of what it registered before it failed', async () => {
      const manager = new PluginManager(new HomebridgeAPI())
      const plugin = failingPlugin('homebridge-halfinit', async (api) => {
        api.registerPlatform('wrong-plugin-name', 'HalfPlat', class {} as any)
        api.registerAccessory('HalfAcc', class {} as any)
        throw new Error('boom')
      })
      ;(manager as any).plugins.set('homebridge-halfinit', plugin)

      await manager.initializePlugin(plugin, 'homebridge-halfinit')

      expect(errorSpy).toHaveBeenCalledWith('ERROR INITIALIZING PLUGIN homebridge-halfinit:')
      expect(manager.hasPluginRegistered('homebridge-halfinit')).toBe(false)
      expect(manager.hasPluginRegistered('wrong-plugin-name')).toBe(false)
      expect(() => manager.getPluginForPlatform('HalfPlat')).toThrow('No plugin was found for the platform "HalfPlat"')
      expect(() => manager.getPluginForAccessory('HalfAcc')).toThrow('No plugin was found for the accessory "HalfAcc"')
      expect(() => manager.getPluginForPlatform('homebridge-halfinit.HalfPlat')).toThrow('was not registered')
      expect(() => manager.getPluginForPlatform('wrong-plugin-name.HalfPlat')).toThrow('was not registered')
    })

    it('leaves a working plugin that registered the same name in place', async () => {
      const manager = new PluginManager(new HomebridgeAPI())
      const good = failingPlugin('homebridge-good', (api) => {
        api.registerPlatform('SharedPlat', class {} as any)
      })
      const bad = failingPlugin('homebridge-bad', (api) => {
        api.registerPlatform('SharedPlat', class {} as any)
        throw new Error('boom')
      })
      ;(manager as any).plugins.set('homebridge-good', good)
      ;(manager as any).plugins.set('homebridge-bad', bad)

      await manager.initializePlugin(good, 'homebridge-good')
      await manager.initializePlugin(bad, 'homebridge-bad')

      expect(manager.getPluginForPlatform('SharedPlat')).toBe(good)
      expect(manager.getPluginForPlatform('homebridge-good.SharedPlat')).toBe(good)
    })
  })

  describe('accessory and platform identifiers', () => {
    // [identifier as written in config.json, plugin part, accessory or platform name]
    const forms: Array<[string, string, string]> = [
      ['example', 'example', 'example'],
      ['homebridge-example-plugin.example', 'homebridge-example-plugin', 'example'],
      ['@organisation/homebridge-example.example', '@organisation/homebridge-example', 'example'],
      // a scope may hold dots: only a dot after the `/` ends the plugin part
      ['@my.scope/homebridge-x.Plat', '@my.scope/homebridge-x', 'Plat'],
      ['@my.scope.two/homebridge-x.Plat', '@my.scope.two/homebridge-x', 'Plat'],
      // everything after the first dot of the plugin part is the name
      ['homebridge-x.My.Platform', 'homebridge-x', 'My.Platform'],
      ['@organisation/homebridge-x.My.Platform', '@organisation/homebridge-x', 'My.Platform'],
    ]

    it.each(forms)('reads the accessory name of %s', (identifier, _plugin, name) => {
      expect(PluginManager.getAccessoryName(identifier)).toBe(name)
    })

    it.each(forms)('reads the platform name of %s', (identifier, _plugin, name) => {
      expect(PluginManager.getPlatformName(identifier)).toBe(name)
    })

    it.each(forms)('reads the plugin identifier of %s', (identifier, plugin) => {
      expect(PluginManager.getPluginIdentifier(identifier)).toBe(plugin)
    })

    it('finds a platform and an accessory of a plugin whose scope holds a dot', async () => {
      const api = new HomebridgeAPI()
      const manager = new PluginManager(api)
      const plugin = {
        getPluginIdentifier: () => '@my.scope/homebridge-x',
        registerPlatform: vi.fn(),
        registerAccessory: vi.fn(),
        initialize: (api: HomebridgeAPI) => {
          api.registerPlatform('Plat', class {} as any)
          api.registerAccessory('Acc', class {} as any)
        },
      } as any
      ;(manager as any).plugins.set('@my.scope/homebridge-x', plugin)
      await manager.initializePlugin(plugin, '@my.scope/homebridge-x')

      expect(manager.getPluginForPlatform('@my.scope/homebridge-x.Plat')).toBe(plugin)
      expect(manager.getPluginForAccessory('@my.scope/homebridge-x.Acc')).toBe(plugin)
      expect(manager.getPluginForPlatform('Plat')).toBe(plugin)
      expect(manager.getPluginForAccessory('Acc')).toBe(plugin)
    })
  })
})
