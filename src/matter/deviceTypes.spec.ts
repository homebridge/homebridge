/**
 * Tests for the friendly `deviceTypes` map exposed to plugins.
 *
 * matter.js leaves some mandatory clusters out of the base device types
 * because the developer must first choose the cluster's supported features
 * (e.g. OccupancySensing needs a detector type, Switch needs latching vs
 * momentary). If we forget to add such a cluster with `.with()`, the endpoint
 * is created without it and any cluster state a plugin supplies is silently
 * dropped. These tests assert every friendly device type actually carries the
 * cluster behaviors a plugin expects to use with it.
 */

import type { Behavior } from '@matter/node'

import { describe, expect, it } from 'vitest'

import { deviceTypes } from './types.js'

/** Read the supported behavior classes off a device type. */
function supportedBehaviors(deviceType: unknown): Record<string, Behavior.Type> {
  return (deviceType as { behaviors: Record<string, Behavior.Type> }).behaviors
}

/** Read the enabled feature flags off a behavior class. */
function enabledFeatures(behavior: Behavior.Type): Record<string, boolean> {
  return (behavior as unknown as { features: Record<string, boolean> }).features
}

describe('deviceTypes mandatory clusters', () => {
  // [friendly name, cluster behavior ids that must be present]
  //
  // Not listed:
  // - WindowCovering: its cluster is added at registration time with
  //   auto-detected Lift/Tilt features (see applyWindowCoveringFeatures)
  // - OnOffSwitch: per the Matter spec the OnOff cluster on a light switch is
  //   a client cluster (it controls other devices), so the server type only
  //   carries Identify
  // - BridgedNode: composed-device container with no cluster of its own
  const cases: Array<[keyof typeof deviceTypes, string[]]> = [
    ['OnOffLight', ['onOff']],
    ['DimmableLight', ['onOff', 'levelControl']],
    ['ColorTemperatureLight', ['onOff', 'levelControl', 'colorControl']],
    ['ExtendedColorLight', ['onOff', 'levelControl', 'colorControl']],
    ['OnOffOutlet', ['onOff']],
    ['DimmableOutlet', ['onOff', 'levelControl']],
    ['AirQualitySensor', ['airQuality']],
    ['TemperatureSensor', ['temperatureMeasurement']],
    ['HumiditySensor', ['relativeHumidityMeasurement']],
    ['LightSensor', ['illuminanceMeasurement']],
    ['MotionSensor', ['occupancySensing']],
    ['ContactSensor', ['booleanState']],
    ['LeakSensor', ['booleanState']],
    ['Thermostat', ['thermostat']],
    ['Fan', ['fanControl']],
    ['DoorLock', ['doorLock']],
    ['RoboticVacuumCleaner', ['rvcRunMode', 'rvcOperationalState']],
    ['WaterValve', ['valveConfigurationAndControl']],
  ]

  it.each(cases)('%s includes %j', (name, expectedBehaviors) => {
    const behaviors = supportedBehaviors(deviceTypes[name])
    for (const behaviorId of expectedBehaviors) {
      expect(behaviors[behaviorId], `expected ${name} to include the '${behaviorId}' cluster`).toBeDefined()
    }
  })
})

describe('motionSensor occupancySensing features', () => {
  it('enables the PassiveInfrared detector type and OccupancyEvent', () => {
    const behaviors = supportedBehaviors(deviceTypes.MotionSensor)
    const features = enabledFeatures(behaviors.occupancySensing)
    expect(features.passiveInfrared).toBe(true)
    expect(features.occupancyEvent).toBe(true)
  })
})
