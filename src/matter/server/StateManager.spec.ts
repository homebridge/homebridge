import type { InternalMatterAccessory } from '../types.js'

import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StateManager } from './StateManager.js'

vi.mock('../../logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }
  return { Logger: { withPrefix: vi.fn(() => mockLogger) } }
})

function createMockEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    set: vi.fn(async () => {}),
    act: vi.fn(async (fn: any) => fn({ get: vi.fn(() => ({ setMeasurement: vi.fn() })) })),
    state: {},
    behaviors: { supported: {} },
    ...overrides,
  }
}

function createManager(endpoint: any) {
  const accessories = new Map<string, InternalMatterAccessory>()
  accessories.set('uuid-1', {
    UUID: 'uuid-1',
    displayName: 'Metered Outlet',
    deviceType: {} as any,
    clusters: {},
    endpoint,
  } as any)
  return new StateManager(accessories, new EventEmitter(), () => false)
}

describe('stateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('updateAccessoryState', () => {
    it('uses a plain endpoint.set for ordinary clusters', async () => {
      const endpoint = createMockEndpoint()
      const manager = createManager(endpoint)

      await manager.updateAccessoryState('uuid-1', 'onOff', { onOff: true })

      expect(endpoint.set).toHaveBeenCalledWith({ onOff: { onOff: true } })
      expect(endpoint.act).not.toHaveBeenCalled()
    })

    it('routes energy readings through setMeasurement so the Matter events fire', async () => {
      const setMeasurement = vi.fn()
      const behaviorClass = { name: 'EEMServer' }
      const endpoint = createMockEndpoint({
        behaviors: { supported: { electricalEnergyMeasurement: behaviorClass } },
        act: vi.fn(async (fn: any) => fn({ get: vi.fn(() => ({ setMeasurement })) })),
      })
      const manager = createManager(endpoint)

      await manager.updateAccessoryState('uuid-1', 'electricalEnergyMeasurement', {
        cumulativeEnergyImported: { energy: 123_000 },
        periodicEnergyExported: { energy: 456 },
      })

      expect(setMeasurement).toHaveBeenCalledWith({
        cumulativeEnergy: { imported: { energy: 123_000 } },
        periodicEnergy: { exported: { energy: 456 } },
      })
      // Nothing left over for the plain set path
      expect(endpoint.set).not.toHaveBeenCalled()
    })

    it('sends non-reading energy attributes and null clears through the plain set path', async () => {
      const setMeasurement = vi.fn()
      const behaviorClass = { name: 'EEMServer' }
      const endpoint = createMockEndpoint({
        behaviors: { supported: { electricalEnergyMeasurement: behaviorClass } },
        act: vi.fn(async (fn: any) => fn({ get: vi.fn(() => ({ setMeasurement })) })),
      })
      const manager = createManager(endpoint)

      await manager.updateAccessoryState('uuid-1', 'electricalEnergyMeasurement', {
        cumulativeEnergyImported: null,
        accuracy: { measurementType: 14 },
      })

      expect(endpoint.set).toHaveBeenCalledWith({
        electricalEnergyMeasurement: {
          cumulativeEnergyImported: null,
          accuracy: { measurementType: 14 },
        },
      })
      expect(setMeasurement).not.toHaveBeenCalled()
    })

    it('falls back to a plain set when the endpoint has no energy behavior', async () => {
      const endpoint = createMockEndpoint()
      const manager = createManager(endpoint)

      await manager.updateAccessoryState('uuid-1', 'electricalEnergyMeasurement', {
        cumulativeEnergyImported: { energy: 1 },
      })

      expect(endpoint.set).toHaveBeenCalledWith({
        electricalEnergyMeasurement: { cumulativeEnergyImported: { energy: 1 } },
      })
    })
  })

  describe('getAccessoryState', () => {
    it('converts bigint attribute values to numbers for JSON-safe transport', () => {
      const endpoint = createMockEndpoint({
        state: {
          electricalPowerMeasurement: {
            activePower: 5_000_000n,
            accuracy: [{ minMeasuredValue: -100n, maxMeasuredValue: 100n }],
          },
        },
      })
      const manager = createManager(endpoint)

      const result = manager.getAccessoryState('uuid-1', 'electricalPowerMeasurement')

      expect(result).toEqual({
        activePower: 5_000_000,
        accuracy: [{ minMeasuredValue: -100, maxMeasuredValue: 100 }],
      })
      expect(() => JSON.stringify(result)).not.toThrow()
    })

    it('passes non-plain objects (byte strings) through untouched', () => {
      const bytes = new Uint8Array([1, 2, 3])
      const endpoint = createMockEndpoint({
        state: { someCluster: { rawValue: bytes, nested: { count: 5n } } },
      })
      const manager = createManager(endpoint)

      const result = manager.getAccessoryState('uuid-1', 'someCluster')

      expect(result!.rawValue).toBe(bytes)
      expect((result!.nested as any).count).toBe(5)
    })
  })
})
