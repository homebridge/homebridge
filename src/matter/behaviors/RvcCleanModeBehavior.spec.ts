import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { RvcRunModeBehavior } from '@matter/main/behaviors/rvc-run-mode'
import { ModeBase, RvcRunMode } from '@matter/main/clusters'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import { HomebridgeRvcCleanModeServer } from './RvcCleanModeBehavior.js'

describe('homebridgeRvcCleanModeServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeRvcCleanModeServer
  let mockEndpoint: any
  let mockAgent: any
  let runModeState: any
  let features: { directModeChange?: boolean }
  const testEndpointId = 'test-endpoint-123'

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
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
    behavior = Object.create(HomebridgeRvcCleanModeServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Run mode: 0 = Idle (tagged Idle), 1 = Cleaning (tagged Cleaning) - starts idle
    runModeState = {
      currentMode: 0,
      supportedModes: [
        {
          label: 'Idle',
          mode: 0,
          modeTags: [
            { value: RvcRunMode.ModeTag.Idle },
          ],
        },
        {
          label: 'Cleaning',
          mode: 1,
          modeTags: [
            { value: RvcRunMode.ModeTag.Cleaning },
          ],
        },
      ],
    }
    mockAgent = {
      maybeGet: vi.fn((type: unknown) => type === RvcRunModeBehavior
        ? { state: runModeState }
        : undefined),
    }
    Object.defineProperty(behavior, 'agent', {
      get: () => mockAgent,
      configurable: true,
    })
    features = {}
    Object.defineProperty(behavior, 'features', {
      get: () => features,
      configurable: true,
    })

    // Modes 0-3 are supported, the device starts in mode 0
    const state = {
      currentMode: 0,
      supportedModes: [0, 1, 2, 3].map(mode => ({ label: `Mode ${mode}`, mode, modeTags: [] })),
    }
    Object.defineProperty(behavior, 'state', {
      get: () => state,
      configurable: true,
    })

    // Mock super method
    vi.spyOn(Object.getPrototypeOf(HomebridgeRvcCleanModeServer.prototype), 'changeToMode').mockReturnValue(undefined)
  })

  describe('changeToMode', () => {
    it('should execute handler with request', async () => {
      const request = { newMode: 0 } // Vacuum mode

      await behavior.changeToMode(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcCleanMode',
        'changeToMode',
        request,
      )
    })

    it('should handle different cleaning mode values', async () => {
      const modes = [0, 1, 2] // Vacuum, Mop, VacuumAndMop

      for (const mode of modes) {
        const request = { newMode: mode }
        await behavior.changeToMode(request)

        expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
          testEndpointId,
          'rvcCleanMode',
          'changeToMode',
          request,
        )

        vi.clearAllMocks()
      }
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { newMode: 0 }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.changeToMode(request)).rejects.toThrow('Failed to change clean mode: Handler failed')
    })

    it('should refuse a mode the device does not list, without calling the handler', async () => {
      const result = await behavior.changeToMode({ newMode: 7 })

      expect(result.status).toBe(ModeBase.ModeChangeStatus.UnsupportedMode)
      expect(mockRegistry.executeHandler).not.toHaveBeenCalled()
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    describe('without DirectModeChange', () => {
      it('should reject a change with InvalidInMode while the run mode is not idle', async () => {
        runModeState.currentMode = 1 // Cleaning

        const result = await behavior.changeToMode({ newMode: 1 })

        expect(result.status).toBe(ModeBase.ModeChangeStatus.InvalidInMode)
        expect(mockRegistry.executeHandler).not.toHaveBeenCalled()
        expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
      })

      it('should allow a change while the run mode is idle', async () => {
        const request = { newMode: 1 }

        await behavior.changeToMode(request)

        expect(mockRegistry.executeHandler).toHaveBeenCalledWith(testEndpointId, 'rvcCleanMode', 'changeToMode', request)
      })

      it('should allow a change when the endpoint has no run mode cluster', async () => {
        mockAgent.maybeGet.mockReturnValue(undefined)

        await behavior.changeToMode({ newMode: 1 })

        expect(mockRegistry.executeHandler).toHaveBeenCalled()
      })
    })

    describe('with DirectModeChange', () => {
      it('should allow a change while the run mode is not idle', async () => {
        features.directModeChange = true
        runModeState.currentMode = 1 // Cleaning
        const request = { newMode: 1 }

        await behavior.changeToMode(request)

        expect(mockRegistry.executeHandler).toHaveBeenCalledWith(testEndpointId, 'rvcCleanMode', 'changeToMode', request)
      })
    })
  })
})
