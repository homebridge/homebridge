import { describe, expect, it } from 'vitest'

import { Plugin } from './plugin.js'
import { PluginManager } from './pluginManager.js'

describe('plugin', () => {
  describe('plugin reload functionality', () => {
    it('should have reload method', () => {
      const mockPackageJSON = {
        name: 'homebridge-test-plugin',
        version: '1.0.0',
        main: './index.js',
        engines: {
          homebridge: '^1.0.0',
        },
      }

      const plugin = new Plugin('homebridge-test-plugin', '/mock/path', mockPackageJSON)
      expect(typeof plugin.reload).toBe('function')
    })

    it('should reject reloading plugin that hasn\'t been loaded', async () => {
      const mockPackageJSON = {
        name: 'homebridge-test-plugin',
        version: '1.0.0',
        main: './index.js',
        engines: {
          homebridge: '^1.0.0',
        },
      }

      const plugin = new Plugin('homebridge-test-plugin', '/mock/path', mockPackageJSON)

      await expect(plugin.reload())
        .rejects
        .toThrow('Cannot reload plugin that has not been loaded yet!')
    })
  })
})

describe('pluginManager reload', () => {
  it('should reject reloading non-existent plugin with correct message', async () => {
    const { HomebridgeAPI } = await import('./api.js')
    const api = new HomebridgeAPI()
    const pluginManager = new PluginManager(api)

    await expect(pluginManager.reloadPlugin('homebridge-nonexistent'))
      .rejects
      .toThrow('Plugin \'homebridge-nonexistent\' not found or not registered.')
  })
})

