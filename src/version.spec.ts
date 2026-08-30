import { resolve } from 'node:path'

import { readJsonSync } from 'fs-extra'
import { describe, expect, it, vi } from 'vitest'

import getVersion, { getRequiredNodeVersion } from './version.js'

const realPackageJson = readJsonSync(resolve(__dirname, '../package.json'))

describe('version', () => {
  describe('getVersion', () => {
    it('should read correct version from package.json', () => {
      const version = getVersion()
      expect(version).toBe(realPackageJson.version)
    })
  })

  describe('getRequiredNodeVersion', () => {
    it('should read correct node version from package.json', () => {
      const version = getRequiredNodeVersion()
      expect(version).toBe(realPackageJson.engines.node)
    })
  })

  it('should read package metadata once per module load', async () => {
    const readFileSync = vi.fn(() => JSON.stringify({
      version: '1.2.3',
      engines: { node: '^24' },
    }))
    vi.resetModules()
    vi.doMock('node:fs', () => ({ readFileSync }))

    try {
      const versionModule = await import('./version.js')

      expect(versionModule.default()).toBe('1.2.3')
      expect(versionModule.default()).toBe('1.2.3')
      expect(versionModule.getRequiredNodeVersion()).toBe('^24')
      expect(versionModule.getRequiredNodeVersion()).toBe('^24')
      expect(readFileSync).toHaveBeenCalledTimes(1)
    } finally {
      vi.doUnmock('node:fs')
      vi.resetModules()
    }
  })
})
