import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { RvcOperationalState } from '@matter/main/clusters/rvc-operational-state'
import { Status, StatusResponseError } from '@matter/main/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import { HomebridgeRvcOperationalStateServer } from './RvcOperationalStateBehavior.js'

describe('homebridgeRvcOperationalStateServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeRvcOperationalStateServer
  let mockEndpoint: any
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
    behavior = Object.create(HomebridgeRvcOperationalStateServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })
    Object.defineProperty(behavior, 'state', {
      get: () => ({ operationalState: 0 }),
      configurable: true,
    })
  })

  describe('pause', () => {
    it('should execute handler for pause command', async () => {
      await behavior.pause()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcOperationalState',
        'pause',
      )
    })
  })

  describe('resume', () => {
    it('should execute handler for resume command', async () => {
      await behavior.resume()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcOperationalState',
        'resume',
      )
    })
  })

  describe('goHome', () => {
    it('should execute handler for goHome command', async () => {
      await behavior.goHome()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcOperationalState',
        'goHome',
      )
    })
  })

  // The three commands used to be three copies of the same method and are now one
  // shared helper. Only the happy path was covered, so the error handling - the
  // half that keeps a failing handler from taking the endpoint offline - could
  // have changed behaviour during that collapse with nothing to catch it.
  describe('handler failure', () => {
    it('should return NoError when the handler succeeds', async () => {
      const response = await behavior.pause()

      expect(response.commandResponseState.errorStateId).toBe(RvcOperationalState.ErrorState.NoError)
    })

    it('should propagate a Matter protocol error from the handler unchanged', async () => {
      const protocolError = new StatusResponseError('Busy right now', Status.Busy)
      ;(mockRegistry.executeHandler as any).mockRejectedValue(protocolError)

      // rethrown as-is, so the controller gets the status the plugin chose
      await expect(behavior.resume()).rejects.toBe(protocolError)
    })

    it.each([
      ['pause', 'Failed to pause: sensor jammed'],
      ['resume', 'Failed to resume: sensor jammed'],
      ['goHome', 'Failed to go home: sensor jammed'],
    ])('should wrap a plain handler error for %s', async (command, expectedMessage) => {
      ;(mockRegistry.executeHandler as any).mockRejectedValue(new Error('sensor jammed'))

      // the per-command wording is the one thing the collapse had to keep, and
      // "goHome" has to read as "go home"
      await expect((behavior as any)[command]()).rejects.toThrow(expectedMessage)
    })

    it('should stringify a non-Error rejection rather than crashing the endpoint', async () => {
      ;(mockRegistry.executeHandler as any).mockRejectedValue('just a string')

      await expect(behavior.goHome()).rejects.toThrow('Failed to go home: just a string')
    })
  })
})
