import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { HomebridgeLevelControlServer } from './LevelControlBehavior.js'
import { RegistryManager } from './RegistryManager.js'

describe('homebridgeLevelControlServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeLevelControlServer
  let mockEndpoint: any
  const testEndpointId = 'test-endpoint-123'

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      getHandler: vi.fn().mockReturnValue(async () => {}),
      syncStateToCache: vi.fn(),
    } as any

    // Create mock endpoint
    mockEndpoint = {
      id: testEndpointId,
    }

    // Register the endpoint with RegistryManager
    const registryManager = new RegistryManager()
    setRegistryManager(mockEndpoint, registryManager)
    registryManager.registerEndpoint(testEndpointId, mockRegistry)

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeLevelControlServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })
    // A level control without the on/off coupling, so no command is ignored
    // for a device that is off (realNode.spec.ts covers that on a real light)
    Object.defineProperty(behavior, 'state', {
      value: { options: {} },
    })
    Object.defineProperty(behavior, 'features', {
      value: { onOff: false },
    })

    // Mock super methods to prevent actual execution
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'moveToLevel').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'move').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'step').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'stop').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'moveToLevelWithOnOff').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'moveWithOnOff').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'stepWithOnOff').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'stopWithOnOff').mockReturnValue(undefined)
  })

  describe('moveToLevel', () => {
    it('should execute handler with request', async () => {
      const request = {
        level: 128,
        transitionTime: 0,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.moveToLevel(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'moveToLevel',
        request,
      )
    })

    it('leaves the cache to the level-changed reaction, which reports the level matter.js stored', async () => {
      const request = {
        level: 200,
        transitionTime: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.moveToLevel(request)
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()

      ;(behavior as any).syncLevelToCache(254)
      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        { currentLevel: 254 },
      )
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = {
        level: 100,
        transitionTime: 0,
        optionsMask: {},
        optionsOverride: {},
      }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.moveToLevel(request)).rejects.toThrow('Handler failed')
    })
  })

  describe('move', () => {
    it('should execute handler with request', async () => {
      const request = {
        moveMode: 0,
        rate: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.move(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'move',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = {
        moveMode: 0,
        rate: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.move(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = {
        moveMode: 0,
        rate: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.move(request)).rejects.toThrow('Handler failed')
    })
  })

  describe('step', () => {
    it('should execute handler with request', async () => {
      const request = {
        stepMode: 0,
        stepSize: 20,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.step(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'step',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = {
        stepMode: 0,
        stepSize: 20,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.step(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = {
        stepMode: 0,
        stepSize: 20,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.step(request)).rejects.toThrow('Handler failed')
    })
  })

  describe('stop', () => {
    it('should execute handler with request', async () => {
      const request = { optionsMask: {}, optionsOverride: {} }

      await behavior.stop(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'stop',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = { optionsMask: {}, optionsOverride: {} }

      await behavior.stop(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { optionsMask: {}, optionsOverride: {} }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.stop(request)).rejects.toThrow('Handler failed')
    })
  })

  describe('moveToLevelWithOnOff', () => {
    beforeEach(() => {
      // Add endpoint.set mock for onOff cluster updates
      mockEndpoint.set = vi.fn().mockResolvedValue(undefined)
    })

    it('should execute handler with request', async () => {
      const request = {
        level: 150,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.moveToLevelWithOnOff(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'moveToLevelWithOnOff',
        request,
      )
    })

    /**
     * ⚠️ #3993. This used to write the OnOff cluster itself, through
     * `endpoint.set()`. That opens a second transaction, and the one running
     * the command already holds the lock on `onOff.state` - so matter.js threw
     * "Cannot lock <endpoint>.onOff.state synchronously" and the command
     * failed AFTER the plugin's handler had already moved the real device.
     *
     * The coupling is matter.js's job and `super.moveToLevelWithOnOff()`
     * already does it, inside this command's transaction.
     */
    it.each([
      ['on', 150],
      ['off', 0],
    ])('does not write the onOff cluster itself when a level command turns a light %s', async (_, level) => {
      const request = {
        level,
        transitionTime: 0,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.moveToLevelWithOnOff(request)

      expect(mockEndpoint.set).not.toHaveBeenCalled()
    })

    it('writes no cache itself, leaving onOff and the level to the reactions of their clusters', async () => {
      const request = {
        level: 180,
        transitionTime: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.moveToLevelWithOnOff(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = {
        level: 100,
        transitionTime: 0,
        optionsMask: {},
        optionsOverride: {},
      }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.moveToLevelWithOnOff(request)).rejects.toThrow('Handler failed')
    })
  })

  describe('moveWithOnOff', () => {
    it('should execute handler with request', async () => {
      const request = {
        moveMode: 0,
        rate: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.moveWithOnOff(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'moveWithOnOff',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = {
        moveMode: 0,
        rate: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.moveWithOnOff(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = {
        moveMode: 0,
        rate: 10,
        optionsMask: {},
        optionsOverride: {},
      }

      await expect(behavior.moveWithOnOff(request)).rejects.toThrow('Handler failed')
    })
  })

  describe('stepWithOnOff', () => {
    it('should execute handler with request', async () => {
      const request = {
        stepMode: 0,
        stepSize: 20,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.stepWithOnOff(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'stepWithOnOff',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = {
        stepMode: 0,
        stepSize: 20,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.stepWithOnOff(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = {
        stepMode: 0,
        stepSize: 20,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      }

      await expect(behavior.stepWithOnOff(request)).rejects.toThrow('Handler failed')
    })
  })

  describe('stopWithOnOff', () => {
    it('should execute handler with request', async () => {
      const request = {
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.stopWithOnOff(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'levelControl',
        'stopWithOnOff',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = {
        optionsMask: {},
        optionsOverride: {},
      }

      await behavior.stopWithOnOff(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = {
        optionsMask: {},
        optionsOverride: {},
      }

      await expect(behavior.stopWithOnOff(request)).rejects.toThrow('Handler failed')
    })
  })

  /**
   * Plugins rarely register the WithOnOff names - the docs and examples only
   * show moveToLevelWithOnOff. A missing handler must not turn a command that
   * matter.js used to carry out into a failure for every such plugin.
   */
  describe('a plugin without the with on/off handlers', () => {
    const requests = {
      moveWithOnOff: {
        moveMode: 0,
        rate: 10,
        optionsMask: {},
        optionsOverride: {},
      },
      stepWithOnOff: {
        stepMode: 0,
        stepSize: 20,
        transitionTime: 5,
        optionsMask: {},
        optionsOverride: {},
      },
      stopWithOnOff: { optionsMask: {}, optionsOverride: {} },
    } as const

    it.each([
      ['moveWithOnOff', 'move'],
      ['stepWithOnOff', 'step'],
      ['stopWithOnOff', 'stop'],
    ] as const)('sends %s to the plain %s handler', async (command, plain) => {
      mockRegistry.getHandler = vi.fn((_id: string, _cluster: string, name: string) => name === plain
        ? async () => {}
        : undefined) as any

      await (behavior as any)[command](requests[command])

      expect(mockRegistry.executeHandler).toHaveBeenCalledTimes(1)
      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(testEndpointId, 'levelControl', plain, requests[command])
    })

    it.each(['moveWithOnOff', 'stepWithOnOff', 'stopWithOnOff'] as const)('lets matter.js carry out %s when there is no handler at all', async (command) => {
      mockRegistry.getHandler = vi.fn().mockReturnValue(undefined)
      const parent = Object.getPrototypeOf(HomebridgeLevelControlServer.prototype)

      await expect((behavior as any)[command](requests[command])).resolves.toBeUndefined()

      expect(mockRegistry.executeHandler).not.toHaveBeenCalled()
      expect(parent[command]).toHaveBeenCalledWith(requests[command])
    })
  })
})
