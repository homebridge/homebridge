import type { EndpointType } from '@matter/main'

import type { MatterAccessory } from '../types.js'

import { FanRequirements } from '@matter/main/devices/fan'
import { describe, expect, it } from 'vitest'

import { HomebridgeFanControlServer } from '../behaviors/FanControlBehavior.js'
import { devices, deviceTypes } from '../types.js'
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
 * Lights and outlets declare Lighting on OnOff, and a room air conditioner
 * DeadFrontBehavior - both required by their device types. The handler swap
 * used to drop them, so every light with handlers was built without Lighting.
 */
describe('the features OnOff is required to have', () => {
  it('keeps a light\'s Lighting', async () => {
    const deviceType = await prepare({
      deviceType: devices.OnOffLightDevice,
      clusters: { onOff: { onOff: false } },
      handlers: { onOff: {} },
    })

    expect(enabledFeatures(deviceType, 'onOff')).toEqual(['lighting'])
  })

  it('keeps an air conditioner\'s DeadFrontBehavior', async () => {
    const deviceType = await prepare({
      deviceType: deviceTypes.RoomAirConditioner,
      clusters: { onOff: { onOff: true }, thermostat: { occupiedHeatingSetpoint: 2000, occupiedCoolingSetpoint: 2400, systemMode: 3, controlSequenceOfOperation: 4 } },
      handlers: { onOff: {} },
    })

    expect(enabledFeatures(deviceType, 'onOff')).toEqual(['deadFrontBehavior'])
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

/**
 * The stock Room Air Conditioner composes its thermostat with Heating and
 * Cooling only, so one starting in Auto failed, and a cached Auto state could
 * not be restored (homebridge-matter#6). It gets AutoMode when it asks for it.
 */
describe('a room air conditioner that asks for Auto', () => {
  const setpoints = {
    occupiedHeatingSetpoint: 2000,
    occupiedCoolingSetpoint: 2400,
    minHeatSetpointLimit: 700,
    maxHeatSetpointLimit: 3000,
    minCoolSetpointLimit: 1600,
    maxCoolSetpointLimit: 3200,
    controlSequenceOfOperation: 4,
  }

  it('gets AutoMode when it starts in Auto', async () => {
    const deviceType = await prepare({ deviceType: deviceTypes.RoomAirConditioner, clusters: { onOff: { onOff: true }, thermostat: { ...setpoints, systemMode: 1 } } })

    expect(enabledFeatures(deviceType, 'thermostat')).toEqual(['autoMode', 'cooling', 'heating'])
  })

  it('gets AutoMode when it declares the Auto-only deadband', async () => {
    const deviceType = await prepare({ deviceType: deviceTypes.RoomAirConditioner, clusters: { onOff: { onOff: true }, thermostat: { ...setpoints, systemMode: 3, minSetpointDeadBand: 20 } } })

    expect(enabledFeatures(deviceType, 'thermostat')).toContain('autoMode')
  })

  it('stays as it was when it does not ask', async () => {
    const deviceType = await prepare({ deviceType: deviceTypes.RoomAirConditioner, clusters: { onOff: { onOff: true }, thermostat: { ...setpoints, systemMode: 3 } } })

    expect(enabledFeatures(deviceType, 'thermostat')).toEqual(['cooling', 'heating'])
  })

  it('leaves a plugin\'s own composition alone', async () => {
    const composed = devices.RoomAirConditionerDevice.with(devices.RoomAirConditionerRequirements.ThermostatServer.with('Cooling'))
    const deviceType = await prepare({ deviceType: composed, clusters: { onOff: { onOff: true }, thermostat: { occupiedCoolingSetpoint: 2400, controlSequenceOfOperation: 0, systemMode: 3, minSetpointDeadBand: 20 } } })

    expect(enabledFeatures(deviceType, 'thermostat')).toEqual(['cooling'])
  })
})

/**
 * A plain AirQuality cluster only allows Unknown, Good and Poor; the other
 * four levels each need a feature, and matter.js refused them
 * (homebridge-matter#7). The stock type now carries all four.
 */
describe('an air quality sensor', () => {
  it('offers every level', async () => {
    const deviceType = await prepare({ deviceType: deviceTypes.AirQualitySensor, clusters: { airQuality: { airQuality: 2 } } })

    expect(enabledFeatures(deviceType, 'airQuality')).toEqual(['extremelyPoor', 'fair', 'moderate', 'veryPoor'])
  })
})
