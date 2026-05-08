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
