import type { EndpointType } from '@matter/main'

import type { InternalMatterAccessory } from './types.js'

import { FanRequirements } from '@matter/main/devices/fan'
import { describe, expect, it } from 'vitest'

import { MatterAccessoryCache } from './accessoryCache.js'
import { applyDeclaredClusterFeatures, declaredClusterFeatures } from './clusterFeatures.js'
import { devices, deviceTypes } from './types.js'

/**
 * The cache can only name a device type, so a restore used to start from the
 * base type in the registry and lose whatever the plugin had composed. The
 * cached state then no longer fitted the endpoint - an air conditioner cached
 * in Auto mode, restored without the AutoMode feature, was refused outright.
 * These run against real matter.js device types.
 */

function enabled(deviceType: EndpointType, clusterName: string): string[] {
  const behavior = (deviceType as { behaviors?: Record<string, { features?: Record<string, boolean> }> }).behaviors?.[clusterName]
  return Object.entries(behavior?.features ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name)
    .sort()
}

const fanWithAuto = devices.FanDevice.with(FanRequirements.FanControlServer.with('Auto'))

describe('reading a device type\'s cluster features', () => {
  it('names each cluster\'s features the way .with() takes them', () => {
    expect(declaredClusterFeatures(deviceTypes.RoomAirConditioner)).toEqual({
      onOff: ['DeadFrontBehavior'],
      thermostat: ['Cooling', 'Heating'],
    })
  })

  it('reads a feature a plugin composed', () => {
    expect(declaredClusterFeatures(fanWithAuto)?.fanControl).toEqual(['Auto'])
  })

  it('gives nothing when there is nothing to read', () => {
    expect(declaredClusterFeatures(undefined)).toBeUndefined()
    expect(declaredClusterFeatures({
      behaviors: {
        identify: { features: {} },
      },
    })).toBeUndefined()
  })
})

describe('putting the features back on a restored device type', () => {
  it('composes a cluster the base type carries with the saved features', () => {
    const restored = applyDeclaredClusterFeatures(devices.FanDevice, {
      fanControl: ['Auto'],
    })

    expect(enabled(restored, 'fanControl')).toEqual(['auto'])
  })

  it('adds a feature-gated cluster the base type leaves out', () => {
    const restored = applyDeclaredClusterFeatures(devices.ThermostatDevice, {
      thermostat: ['AutoMode', 'Cooling', 'Heating'],
    })

    expect(enabled(restored, 'thermostat')).toEqual(['autoMode', 'cooling', 'heating'])
  })

  it('leaves the type alone when nothing was saved', () => {
    expect(applyDeclaredClusterFeatures(devices.FanDevice, undefined)).toBe(devices.FanDevice)
  })

  it('skips a cluster it cannot compose rather than failing the restore', () => {
    const restored = applyDeclaredClusterFeatures(devices.FanDevice, {
      notACluster: ['Whatever'],
    })

    expect(restored).toBe(devices.FanDevice)
  })
})

describe('the cache records the features', () => {
  function serialize(deviceType: EndpointType, parts?: InternalMatterAccessory['parts']) {
    const cache = new MatterAccessoryCache('/tmp/not-written', 'bridge')
    return (cache as any).serializeAccessory({
      UUID: 'uuid',
      displayName: 'Fan',
      deviceType,
      serialNumber: 's',
      manufacturer: 'm',
      model: 'x',
      clusters: {},
      parts,
    } as InternalMatterAccessory)
  }

  it('saves what the plugin composed, so the restore can rebuild it', () => {
    const serialized = serialize(fanWithAuto)

    expect(serialized.deviceType.clusterFeatures.fanControl).toEqual(['Auto'])
    // and the round trip gives the same composition back
    const restored = applyDeclaredClusterFeatures(devices.FanDevice, serialized.deviceType.clusterFeatures)
    expect(declaredClusterFeatures(restored)).toEqual(declaredClusterFeatures(fanWithAuto))
  })

  it('saves a part\'s features too', () => {
    const serialized = serialize(devices.FanDevice, [
      { id: 'fan', deviceType: fanWithAuto, clusters: {} },
    ])

    expect(serialized.parts[0].deviceType.clusterFeatures.fanControl).toEqual(['Auto'])
  })
})
