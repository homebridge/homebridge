import { describe, expect, it } from 'vitest'

import { Plugin } from './plugin.js'

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
