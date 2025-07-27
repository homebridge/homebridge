import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import getVersion, { getRequiredNodeVersion } from './version.js'

const realPackageJson = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

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
