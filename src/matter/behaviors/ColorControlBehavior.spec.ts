import type { Mock } from 'vitest'

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { ColorControl } from '@matter/main/clusters'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeColorControlServer } from './ColorControlBehavior.js'
import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'

describe('homebridgeColorControlServer', () => {
  describe('behavior structure', () => {
    it('should extend ColorControlServer', () => {
      expect(HomebridgeColorControlServer.prototype).toBeDefined()
    })

    it('should have color control logic methods', () => {
      // Check the *Logic methods that we actually override
      expect(typeof HomebridgeColorControlServer.prototype.moveToHueLogic).toBe('function')
      expect(typeof HomebridgeColorControlServer.prototype.moveToSaturationLogic).toBe('function')
      expect(typeof HomebridgeColorControlServer.prototype.moveToHueAndSaturationLogic).toBe('function')
      expect(typeof HomebridgeColorControlServer.prototype.moveToColorLogic).toBe('function')
      expect(typeof HomebridgeColorControlServer.prototype.moveToColorTemperatureLogic).toBe('function')
      expect(typeof HomebridgeColorControlServer.prototype.stopAllColorMovement).toBe('function')
    })
  })

  describe('optional handlers', () => {
    const testEndpointId = 'test-color-endpoint'
    const superProto = Object.getPrototypeOf(HomebridgeColorControlServer.prototype)
    let registeredHandlers: Record<string, Mock<(args?: unknown) => unknown>>
    let mockRegistry: BehaviorRegistry
    let behavior: HomebridgeColorControlServer

    beforeEach(() => {
      vi.restoreAllMocks()
      registeredHandlers = {}

      mockRegistry = {
        getHandler: vi.fn((_endpointId: string, _cluster: string, command: string) => registeredHandlers[command]),
        executeHandler: vi.fn(async (_endpointId: string, _cluster: string, command: string, args?: unknown) => {
          const handler = registeredHandlers[command]
          if (!handler) {
            throw new Error(`No handler registered for ${testEndpointId}.colorControl.${command}`)
          }
          await handler(args)
          return true
        }),
        syncStateToCache: vi.fn(),
      } as any

      const mockEndpoint = { id: testEndpointId }
      const registryManager = new RegistryManager()
      setRegistryManager(mockEndpoint, registryManager)
      registryManager.registerEndpoint(testEndpointId, mockRegistry)

      behavior = Object.create(HomebridgeColorControlServer.prototype)
      Object.defineProperty(behavior, 'endpoint', {
        get: () => mockEndpoint,
        configurable: true,
      })
      Object.defineProperty(behavior, 'state', {
        get: () => ({}),
        configurable: true,
      })

      // Mirror what matter.js does internally, without its state machine
      vi.spyOn(superProto, 'moveToHueAndSaturationLogic').mockImplementation(async function (this: any, hue: any, saturation: any, transitionTime: any) {
        await this.moveToHueLogic(hue, ColorControl.Direction.Shortest, transitionTime, false)
        await this.moveToSaturationLogic(saturation, transitionTime)
      })
      vi.spyOn(superProto, 'moveToHueLogic').mockResolvedValue(undefined)
      vi.spyOn(superProto, 'moveToSaturationLogic').mockResolvedValue(undefined)
      vi.spyOn(superProto, 'moveToColorTemperatureLogic').mockResolvedValue(undefined)
      vi.spyOn(superProto, 'stopAllColorMovement').mockResolvedValue(undefined)
    })

    it('should run moveToHueAndSaturation when only the combined handler is registered', async () => {
      registeredHandlers.moveToHueAndSaturationLogic = vi.fn()

      await expect(behavior.moveToHueAndSaturationLogic(100, 200, 0)).resolves.toBeUndefined()

      expect(registeredHandlers.moveToHueAndSaturationLogic).toHaveBeenCalledWith({ hue: 100, saturation: 200, transitionTime: 0 })
      expect(superProto.moveToHueLogic).toHaveBeenCalled()
      expect(superProto.moveToSaturationLogic).toHaveBeenCalled()
    })

    it('should still update Matter state when stopAllColorMovement has no handler', async () => {
      await expect(behavior.stopAllColorMovement()).resolves.toBeUndefined()

      expect(mockRegistry.executeHandler).not.toHaveBeenCalled()
      expect(superProto.stopAllColorMovement).toHaveBeenCalled()
    })

    it('should still call a registered handler and update Matter state', async () => {
      registeredHandlers.moveToColorTemperatureLogic = vi.fn()

      await behavior.moveToColorTemperatureLogic(300, 0)

      expect(registeredHandlers.moveToColorTemperatureLogic).toHaveBeenCalledWith({ colorTemperatureMireds: 300, transitionTime: 0 })
      expect(superProto.moveToColorTemperatureLogic).toHaveBeenCalledWith(300, 0)
    })

    it('should not update Matter state when a registered handler fails', async () => {
      registeredHandlers.moveToColorTemperatureLogic = vi.fn().mockRejectedValue(new Error('device offline'))

      await expect(behavior.moveToColorTemperatureLogic(300, 0)).rejects.toThrow('Failed to set color temperature: device offline')
      expect(superProto.moveToColorTemperatureLogic).not.toHaveBeenCalled()
    })
  })
})
