import type { PathLike } from 'node:fs'

import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import getVersion, { getRequiredNodeVersion } from './version.js'

describe('version', () => {
  describe('getVersion', () => {
    it('should read correct version from package.json', () => {
      const expectedVersion = '1.1.28'
      const expectedPath = path.resolve(__dirname, '../package.json')

      const mock = vi.spyOn(fs, 'readFileSync')
      // mock only once, otherwise we break the whole test runner
      mock.mockImplementationOnce((path: PathLike | number, options?: { encoding?: string | null, flag?: string } | string | null) => {
        expect(path).toBe(expectedPath)
        expect(options).toBeDefined()
        expect(typeof options).toBe('object')
        const opt = options as { encoding: string }
        expect(opt.encoding).toBe('utf8')

        const fakeJson = {
          version: expectedVersion,
        }

        return JSON.stringify(fakeJson, null, 4) // pretty print
      })

      const version = getVersion()
      expect(version).toBe(expectedVersion)
    })
  })

  describe('getRequiredNodeVersion', () => {
    it('should read correct node version from package.json', () => {
      const expectedVersion = '>=10.17.0'
      const expectedPath = path.resolve(__dirname, '../package.json')

      const mock = vi.spyOn(fs, 'readFileSync')
      // mock only once, otherwise we break the whole test runner
      mock.mockImplementationOnce((path: PathLike | number, options?: { encoding?: string | null, flag?: string } | string | null) => {
        expect(path).toBe(expectedPath)
        expect(options).toBeDefined()
        expect(typeof options).toBe('object')
        const opt = options as { encoding: string }
        expect(opt.encoding).toBe('utf8')

        const fakeJson = {
          engines: {
            node: expectedVersion,
          },
        }

        return JSON.stringify(fakeJson, null, 4) // pretty print
      })

      const version = getRequiredNodeVersion()
      expect(version).toBe(expectedVersion)
    })
  })
})
