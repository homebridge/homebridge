import type { InternalMatterAccessory } from '../types.js'

import { describe, expect, it } from 'vitest'

import { AccessoryQuery } from './AccessoryQuery.js'

/**
 * The clusters payload the UI receives is the PLUGIN-declared state, which
 * cannot say which features a cluster ended up with - a thermostat with and
 * without AutoMode declares the same setpoints. These tests pin the featureMap
 * enrichment that closes that gap, and the fallbacks around it.
 */

function makeAccessory(overrides: Partial<InternalMatterAccessory> = {}): InternalMatterAccessory {
  return {
    UUID: 'uuid-1',
    displayName: 'Thermostat',
    deviceType: { name: 'ThermostatDevice' },
    serialNumber: 's',
    manufacturer: 'm',
    model: 'x',
    clusters: {
      thermostat: { occupiedHeatingSetpoint: 2000, occupiedCoolingSetpoint: 2400 },
    },
    registered: true,
    ...overrides,
  } as unknown as InternalMatterAccessory
}

function collect(accessory: InternalMatterAccessory) {
  const query = new AccessoryQuery(new Map([[accessory.UUID, accessory]]), () => null)
  const [entry] = query.collectAccessories('user', 'child', 'Bridge')
  return entry.clusters as Record<string, Record<string, unknown>>
}

describe('featureMap enrichment for the UI payload', () => {
  it('adds the live endpoint featureMap to each cluster', () => {
    const accessory = makeAccessory({
      endpoint: {
        state: {
          thermostat: { featureMap: { heating: true, cooling: true, autoMode: false } },
        },
      },
    } as unknown as Partial<InternalMatterAccessory>)

    const clusters = collect(accessory)

    expect(clusters.thermostat.featureMap).toEqual({ heating: true, cooling: true, autoMode: false })
    // The declared state is still there, untouched
    expect(clusters.thermostat.occupiedHeatingSetpoint).toBe(2000)
  })

  it('serves the declared state as-is when there is no live endpoint yet', () => {
    const clusters = collect(makeAccessory({ endpoint: undefined }))

    expect(clusters.thermostat.featureMap).toBeUndefined()
    expect(clusters.thermostat.occupiedHeatingSetpoint).toBe(2000)
  })

  it('leaves a cluster alone when the endpoint has no state for it', () => {
    const accessory = makeAccessory({
      endpoint: { state: {} },
    } as unknown as Partial<InternalMatterAccessory>)

    const clusters = collect(accessory)

    expect(clusters.thermostat.featureMap).toBeUndefined()
  })

  it('survives a behavior whose state read throws mid-initialisation', () => {
    const state: Record<string, unknown> = {}
    Object.defineProperty(state, 'thermostat', {
      enumerable: true,
      get() {
        throw new Error('behaviors not initialized')
      },
    })
    const accessory = makeAccessory({ endpoint: { state } } as unknown as Partial<InternalMatterAccessory>)

    const clusters = collect(accessory)

    expect(clusters.thermostat.occupiedHeatingSetpoint).toBe(2000)
    expect(clusters.thermostat.featureMap).toBeUndefined()
  })
})
