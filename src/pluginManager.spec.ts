import { describe, expect, it } from 'vitest'

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
  })

  describe('pluginManager.extractPluginScope', () => {
    it('should extract undefined for normal plugin names', () => {
      expect(PluginManager.extractPluginScope('homebridge-dummy-plugin')).toBeUndefined()
    })

    it('should extract scope for scoped plugin names', () => {
      expect(PluginManager.extractPluginScope('@organisation/homebridge-dummy-plugin')).toBe('@organisation')
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
