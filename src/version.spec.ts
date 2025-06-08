import { resolve } from 'node:path'

import { readJsonSync } from 'fs-extra'
import { describe, expect, it } from 'vitest'

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
})
