import type { EndpointType } from '@matter/main'

import type { MatterAccessory } from '../types.js'

import { FanRequirements } from '@matter/main/devices/fan'
import { describe, expect, it } from 'vitest'

import { HomebridgeFanControlServer } from '../behaviors/FanControlBehavior.js'
import { devices } from '../types.js'
import { AccessoryManager } from './AccessoryManager.js'

/**
 * Real matter.js device types, run through the real preparation step.
 *
 * The main AccessoryManager spec mocks matter.js and the helpers so it can
 * check which branch ran. These check what actually ends up on the endpoint:
 * the features a cluster carries once Homebridge has finished with it.
 */

function enabledFeatures(deviceType: EndpointType, clusterName: string): string[] {
  const behavior = (deviceType as { behaviors?: Record<string, { features?: Record<string, boolean> }> }).behaviors?.[clusterName]
  return Object.entries(behavior?.features ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort()
}

async function prepare(accessory: Partial<MatterAccessory>): Promise<EndpointType> {
  const full = {
    UUID: 'test-uuid',
    displayName: 'Test',
    serialNumber: 'serial',
    manufacturer: 'maker',
    model: 'model',
    clusters: {},
    ...accessory,
  } as MatterAccessory
  const { deviceType } = await (new AccessoryManager() as any).prepareDeviceType(full)
  return deviceType
}

/**
 * Homebridge swaps a cluster's base behavior for its own handler-calling one
 * whenever handlers are supplied - and a cache restore supplies an empty stub
 * for every cached cluster. The swap used to rebuild the cluster without any
 * features, so whatever the plugin chose was dropped.
 */
describe('features a plugin chose survive the handler swap', () => {
  it('keeps a fan\'s Auto mode', async () => {
    const deviceType = await prepare({
      deviceType: devices.FanDevice.with(FanRequirements.FanControlServer.with('Auto')),
      clusters: { fanControl: { fanMode: 0, fanModeSequence: 2, percentSetting: 0, percentCurrent: 0 } },
      handlers: { fanControl: {} },
    })

    expect(enabledFeatures(deviceType, 'fanControl')).toContain('auto')
  })

  it('still swaps in the handler-calling behavior', async () => {
    const deviceType = await prepare({
      deviceType: devices.FanDevice.with(FanRequirements.FanControlServer.with('Auto')),
      clusters: { fanControl: { fanMode: 0, fanModeSequence: 2, percentSetting: 0, percentCurrent: 0 } },
      handlers: { fanControl: {} },
    })

    // matter.js renames a behavior it re-composes, so check the class itself
    const fanControl = (deviceType as { behaviors: Record<string, unknown> }).behaviors.fanControl as typeof HomebridgeFanControlServer
    const isOrExtends = fanControl === HomebridgeFanControlServer || fanControl.prototype instanceof HomebridgeFanControlServer
    expect(isOrExtends).toBe(true)
  })
})

/**
 * Lights and outlets declare Lighting on OnOff, and the swap has always built
 * OnOff without it. Carrying it across would change every paired light, so it
 * is held back on purpose until that is decided separately.
 */
describe('features the carry-across leaves alone', () => {
  it('leaves a light\'s OnOff as it was', async () => {
    const deviceType = await prepare({
      deviceType: devices.OnOffLightDevice,
      clusters: { onOff: { onOff: false } },
      handlers: { onOff: {} },
    })

    expect(enabledFeatures(deviceType, 'onOff')).toEqual([])
  })
})

/**
 * Auto, and every fan mode sequence that offers it, needs FanControl's Auto
 * feature, which the base Fan type does not carry. A fan declaring an Auto
 * sequence failed to register (homebridge-matter#8).
 */
describe('a fan that declares an Auto sequence', () => {
  const fan = (fanModeSequence: number) => ({ fanMode: 0, fanModeSequence, percentSetting: 0, percentCurrent: 0 })

  it.each([2, 3, 4])('gets Auto for sequence %s', async (sequence) => {
    const deviceType = await prepare({ deviceType: devices.FanDevice, clusters: { fanControl: fan(sequence) }, handlers: { fanControl: {} } })

    expect(enabledFeatures(deviceType, 'fanControl')).toContain('auto')
  })

  it.each([0, 1, 5])('does not get Auto for sequence %s', async (sequence) => {
    const deviceType = await prepare({ deviceType: devices.FanDevice, clusters: { fanControl: fan(sequence) } })

    expect(enabledFeatures(deviceType, 'fanControl')).not.toContain('auto')
  })

  it('keeps the other features the plugin chose', async () => {
    const deviceType = await prepare({
      deviceType: devices.FanDevice.with(FanRequirements.FanControlServer.with('MultiSpeed')),
      clusters: { fanControl: { ...fan(2), speedMax: 3, speedSetting: 0, speedCurrent: 0 } },
    })

    expect(enabledFeatures(deviceType, 'fanControl')).toEqual(['auto', 'multiSpeed'])
  })
})
