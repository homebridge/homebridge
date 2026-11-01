import type { InternalMatterAccessory, MatterAccessory } from '../types.js'
import type { AccessoryManagerDeps } from './AccessoryManager.js'

import { EventEmitter } from 'node:events'

import { Endpoint, Environment, ServerNode } from '@matter/main'
import { AggregatorEndpoint } from '@matter/main/endpoints'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../logger.js'
import { BehaviorRegistry, RegistryManager } from '../behaviors/index.js'
import { clusters, deviceTypes } from '../types.js'
import { AccessoryManager } from './AccessoryManager.js'
import { StateManager } from './StateManager.js'

/**
 * The optional measurement clusters, registered on a real matter.js node.
 *
 * A device type carries only its mandatory clusters, and matter.js quietly
 * ignores endpoint state for a cluster the endpoint does not have. So an air
 * quality sensor's PM2.5 reading registered without an error and was never
 * exposed. Checking the device type is not enough to catch that - these read
 * back what the endpoint actually ended up with.
 */

const PM25 = {
  measuredValue: 12,
  minMeasuredValue: 0,
  maxMeasuredValue: 1000,
  measurementUnit: 4, // µg/m³
  measurementMedium: 0, // air
}

let node: ServerNode
let accessories: Map<string, InternalMatterAccessory>
let deps: AccessoryManagerDeps
let nodeCount = 0

beforeEach(async () => {
  Environment.default.vars.set('storage.driver', 'memory')
  node = await ServerNode.create({
    id: `measurements-${nodeCount++}`,
    network: { port: 0 },
  } as any)
  const aggregator = new Endpoint(AggregatorEndpoint, { id: 'aggregator' })
  await node.add(aggregator)
  accessories = new Map()
  deps = {
    config: {} as AccessoryManagerDeps['config'],
    accessories,
    behaviorRegistry: new BehaviorRegistry(accessories as any),
    registryManager: new RegistryManager(),
    accessoryCache: null,
    getServerNode: () => node,
    getAggregator: () => aggregator as any,
    getIsRunning: () => false,
    getMonitoringEnabled: () => false,
    isCommissioned: () => false,
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await node.close()
})

async function register(accessory: Partial<MatterAccessory>): Promise<Endpoint> {
  const full = {
    UUID: 'measurements-uuid',
    displayName: 'Air Monitor',
    serialNumber: 'serial',
    manufacturer: 'maker',
    model: 'model',
    deviceType: deviceTypes.AirQualitySensor,
    ...accessory,
    // The air quality sensor's one mandatory reading
    clusters: accessory.deviceType
      ? accessory.clusters
      : {
          airQuality: { airQuality: 1 },
          ...accessory.clusters,
        },
  } as MatterAccessory
  await new AccessoryManager().registerAccessory('homebridge-test', 'Test', full, deps)
  return accessories.get(full.UUID)!.endpoint as Endpoint
}

function state(endpoint: Endpoint): Record<string, any> {
  return endpoint.state as Record<string, any>
}

describe('an air quality sensor\'s concentration readings', () => {
  it('exposes a declared PM2.5 reading', async () => {
    const endpoint = await register({
      clusters: {
        pm25ConcentrationMeasurement: { ...PM25 },
      },
    })

    expect(state(endpoint).descriptor.serverList).toContain(clusters.Pm25ConcentrationMeasurement.Cluster.id)
    expect(state(endpoint).pm25ConcentrationMeasurement).toMatchObject(PM25)
    expect(state(endpoint).pm25ConcentrationMeasurement.featureMap).toMatchObject({
      numericMeasurement: true,
      levelIndication: false,
    })
  })

  it('takes later readings from the plugin', async () => {
    const endpoint = await register({
      clusters: {
        pm25ConcentrationMeasurement: { ...PM25 },
      },
    })

    await new StateManager(accessories, new EventEmitter(), () => false)
      .updateAccessoryState('measurements-uuid', 'pm25ConcentrationMeasurement', { measuredValue: 15.5 })

    expect(state(endpoint).pm25ConcentrationMeasurement.measuredValue).toBe(15.5)
  })

  it('exposes each of PM10, ozone, NO2 and CO', async () => {
    const ppm = {
      measuredValue: 0.05,
      minMeasuredValue: 0,
      maxMeasuredValue: 1,
      measurementUnit: 0,
      measurementMedium: 0,
    }
    const endpoint = await register({
      clusters: {
        pm10ConcentrationMeasurement: { ...PM25, measuredValue: 25 },
        ozoneConcentrationMeasurement: { ...ppm },
        nitrogenDioxideConcentrationMeasurement: { ...ppm, measuredValue: 0.02 },
        carbonMonoxideConcentrationMeasurement: { ...ppm, measuredValue: 3, maxMeasuredValue: 100 },
      },
    })

    expect(state(endpoint).pm10ConcentrationMeasurement.measuredValue).toBe(25)
    expect(state(endpoint).ozoneConcentrationMeasurement.measuredValue).toBe(0.05)
    expect(state(endpoint).nitrogenDioxideConcentrationMeasurement.measuredValue).toBe(0.02)
    expect(state(endpoint).carbonMonoxideConcentrationMeasurement.measuredValue).toBe(3)
  })

  it('exposes a level reading, up to Critical', async () => {
    const endpoint = await register({
      clusters: {
        pm25ConcentrationMeasurement: { levelValue: 4, measurementMedium: 0 },
      },
    })

    expect(state(endpoint).pm25ConcentrationMeasurement.levelValue).toBe(4)
    expect(state(endpoint).pm25ConcentrationMeasurement.featureMap).toMatchObject({
      numericMeasurement: false,
      levelIndication: true,
      mediumLevel: true,
      criticalLevel: true,
    })
  })

  it('turns on peak and average measurement when they are declared', async () => {
    const endpoint = await register({
      clusters: {
        pm25ConcentrationMeasurement: { ...PM25, peakMeasuredValue: 40, averageMeasuredValue: 10 },
      },
    })

    expect(state(endpoint).pm25ConcentrationMeasurement.featureMap).toMatchObject({
      peakMeasurement: true,
      averageMeasurement: true,
    })
    expect(state(endpoint).pm25ConcentrationMeasurement.peakMeasuredValue).toBe(40)
  })

  // The documented example left measurementMedium out, and matter.js requires it
  it('takes the medium to be air when it is not declared', async () => {
    const endpoint = await register({
      clusters: {
        pm25ConcentrationMeasurement: { measuredValue: 12, measurementUnit: 4 },
      },
    })

    expect(state(endpoint).pm25ConcentrationMeasurement.measurementMedium).toBe(0)
    expect(state(endpoint).pm25ConcentrationMeasurement.measuredValue).toBe(12)
  })

  // There is no safe unit to assume - ppm and µg/m³ differ by orders of
  // magnitude - and a cluster without one fails registration. Before, the
  // cluster was dropped and the accessory worked, so it must keep working.
  it('leaves out a reading with no unit, and keeps the rest of the accessory', async () => {
    const warn = vi.spyOn(Logger.withPrefix('Matter/Server'), 'warn')
    const endpoint = await register({
      clusters: {
        pm25ConcentrationMeasurement: { measuredValue: 12, measurementMedium: 0 },
      },
    })

    expect(state(endpoint).pm25ConcentrationMeasurement).toBeUndefined()
    expect(state(endpoint).airQuality.airQuality).toBe(1)
    expect(warn.mock.calls.some(call => String(call[0]).includes('measurementUnit'))).toBe(true)
  })
})

describe('the other optional measurements', () => {
  it('exposes an air quality sensor\'s temperature and humidity', async () => {
    const endpoint = await register({
      clusters: {
        temperatureMeasurement: { measuredValue: 2100, minMeasuredValue: -5000, maxMeasuredValue: 10000 },
        relativeHumidityMeasurement: { measuredValue: 5500, minMeasuredValue: 0, maxMeasuredValue: 10000 },
      },
    })

    expect(state(endpoint).temperatureMeasurement.measuredValue).toBe(2100)
    expect(state(endpoint).relativeHumidityMeasurement.measuredValue).toBe(5500)
  })

  it('exposes a smoke alarm\'s CO concentration', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.SmokeSensor,
      clusters: {
        smokeCoAlarm: { smokeState: 0, coState: 0 },
        carbonMonoxideConcentrationMeasurement: { measuredValue: 3, measurementUnit: 0, measurementMedium: 0 },
      },
    })

    expect(state(endpoint).carbonMonoxideConcentrationMeasurement.measuredValue).toBe(3)
  })

  it('exposes a room air conditioner\'s humidity', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.RoomAirConditioner,
      clusters: {
        onOff: { onOff: true },
        thermostat: {
          localTemperature: 2000,
          occupiedHeatingSetpoint: 2000,
          occupiedCoolingSetpoint: 2400,
          systemMode: 3,
          controlSequenceOfOperation: 4,
        },
        relativeHumidityMeasurement: { measuredValue: 4000 },
      },
    })

    expect(state(endpoint).relativeHumidityMeasurement.measuredValue).toBe(4000)
  })

  // Only what the device type allows: a contact sensor lists no PM2.5 cluster
  it('adds nothing the device type does not list', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.ContactSensor,
      clusters: {
        booleanState: { stateValue: true },
        pm25ConcentrationMeasurement: { ...PM25 },
      },
    })

    expect(state(endpoint).pm25ConcentrationMeasurement).toBeUndefined()
    expect(state(endpoint).booleanState.stateValue).toBe(true)
  })

  // A thermostat reads humidity from a separate sensor - Matter lists it as a
  // client there, not a cluster the thermostat itself serves
  it('leaves out a cluster the device type only reads from elsewhere', async () => {
    const endpoint = await register({
      deviceType: deviceTypes.Thermostat,
      clusters: {
        thermostat: {
          localTemperature: 2000,
          occupiedHeatingSetpoint: 2000,
          systemMode: 4,
          controlSequenceOfOperation: 2,
        },
        relativeHumidityMeasurement: { measuredValue: 4000 },
      },
    })

    expect(state(endpoint).relativeHumidityMeasurement).toBeUndefined()
    expect(state(endpoint).thermostat.localTemperature).toBe(2000)
  })
})
