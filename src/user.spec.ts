import { basename, join, resolve } from 'node:path'
import process from 'node:process'

import { describe, expect, it, vi } from 'vitest'

import { User } from './user.js'

describe('user', () => { // these tests are mainly here to ensure default locations won't get bricked in the future
  describe('user.storagePath', () => {
    it('should have valid default path', () => {
      expect(basename(User.storagePath())).toEqual('.homebridge')
    })
  })

  describe('user.cachedAccessoryPath', () => {
    it('should have valid default path', () => {
      expect(basename(User.cachedAccessoryPath())).toEqual('accessories')
    })
  })

  describe('user.persistPath', () => {
    it('should have valid default path', () => {
      expect(basename(User.persistPath())).toEqual('persist')
    })
  })

  describe('user.configPath', () => {
    it('should have valid default path', () => {
      expect(basename(User.configPath())).toEqual('config.json')
    })
  })

  describe('user.matterPath', () => {
    it('should have valid default path', () => {
      expect(basename(User.matterPath())).toEqual('matter')
    })
  })

  describe('user.setStoragePath', () => {
    // `User` keeps its state in static fields, so each of these tests takes a fresh copy of the module.
    // That way no test depends on what an earlier one did, and none changes the path for a later one.
    async function freshUser(): Promise<typeof User> {
      vi.resetModules()
      return (await import('./user.js')).User
    }

    it('should fail to be overwritten after paths were already accessed', async () => {
      const FreshUser = await freshUser()
      const before = FreshUser.storagePath()

      expect(() => FreshUser.setStoragePath('otherDir')).toThrow('Storage path was already accessed and cannot be changed anymore')
      expect(FreshUser.storagePath()).toBe(before)
    })

    it('should set the storage path, and every path under it, before the first access', async () => {
      const FreshUser = await freshUser()
      const storagePath = resolve('some', 'custom', 'storage')

      FreshUser.setStoragePath(storagePath)

      expect(FreshUser.storagePath()).toBe(storagePath)
      expect(FreshUser.configPath()).toBe(join(storagePath, 'config.json'))
      expect(FreshUser.persistPath()).toBe(join(storagePath, 'persist'))
      expect(FreshUser.matterPath()).toBe(join(storagePath, 'matter'))
      expect(FreshUser.cachedAccessoryPath()).toBe(join(storagePath, 'accessories'))
    })

    it('should join several path segments and make the result absolute', async () => {
      const FreshUser = await freshUser()

      FreshUser.setStoragePath('relative', 'nested', 'dir')

      expect(FreshUser.storagePath()).toBe(resolve(process.cwd(), 'relative', 'nested', 'dir'))
    })

    it('should let the path be set again as long as it was not accessed', async () => {
      const FreshUser = await freshUser()

      FreshUser.setStoragePath('first')
      FreshUser.setStoragePath('second')

      expect(basename(FreshUser.storagePath())).toBe('second')
    })
  })
})
