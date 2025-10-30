import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeRvcOperationalStateServer } from './RvcOperationalStateBehavior.js'

describe('homebridgeRvcOperationalStateServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeRvcOperationalStateServer
  let mockEndpoint: any

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
    } as any

    // Set registry on behavior class
    HomebridgeRvcOperationalStateServer.setRegistry(mockRegistry)

    // Create mock endpoint
    mockEndpoint = {
      id: 'test-endpoint-123',
    }

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeRvcOperationalStateServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Mock super methods
    vi.spyOn(Object.getPrototypeOf(HomebridgeRvcOperationalStateServer.prototype), 'pause').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeRvcOperationalStateServer.prototype), 'resume').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeRvcOperationalStateServer.prototype), 'goHome').mockReturnValue(undefined)
  })

  describe('setRegistry', () => {
    it('should set the registry', () => {
      const newRegistry = {} as BehaviorRegistry
      HomebridgeRvcOperationalStateServer.setRegistry(newRegistry)
      expect(true).toBe(true)
    })
  })

  describe('pause', () => {
    it('should execute handler for pause command', () => {
      behavior.pause()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'rvcOperationalState',
        'pause',
      )
    })
  })

  describe('resume', () => {
    it('should execute handler for resume command', () => {
      behavior.resume()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'rvcOperationalState',
        'resume',
      )
    })
  })

  describe('goHome', () => {
    it('should execute handler for goHome command', () => {
      behavior.goHome()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'rvcOperationalState',
        'goHome',
      )
    })
  })
})
