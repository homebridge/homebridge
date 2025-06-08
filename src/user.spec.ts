import { basename } from 'node:path'

import { describe, expect, it } from 'vitest'

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

  describe('user.setStoragePath', () => {
    it('should fail to be overwritten after paths were already accessed', () => {
      expect(() => User.setStoragePath('otherDir')).toThrow(Error)
    })
  })
})
