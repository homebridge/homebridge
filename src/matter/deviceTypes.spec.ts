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

import { CORE_CLUSTER_BEHAVIOR_MAP } from './server/BehaviorMap.js'
import { deviceRequirements, deviceTypes } from './types.js'

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
  // - SmokeSensor: its cluster is added at registration time with
  //   auto-detected SmokeAlarm/CoAlarm features (see applySmokeCoAlarmFeatures)
  // - Thermostat: its cluster is added at registration time with
  //   auto-detected Heating/Cooling features (see applyThermostatFeatures), so a
  //   heating-only thermostat is not forced to advertise cooling
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
    ['Fan', ['fanControl']],
    ['DoorLock', ['doorLock']],
    ['RoboticVacuumCleaner', ['rvcRunMode', 'rvcOperationalState']],
    ['WaterValve', ['valveConfigurationAndControl']],
    ['GenericSwitch', ['switch']],
    ['Pump', ['onOff', 'pumpConfigurationAndControl']],
    ['RoomAirConditioner', ['onOff', 'thermostat']],
    // Closures, for garage doors and gates
    ['Closure', ['closureControl']],
    // Media. MediaPlayer carries playback and source selection but NOT volume,
    // which lives on a separate Speaker endpoint composed alongside it
    ['MediaPlayer', ['mediaPlayback']],
    ['Speaker', ['onOff', 'levelControl']],
  ]

  it.each(cases)('%s includes %j', (name, expectedBehaviors) => {
    const behaviors = supportedBehaviors(deviceTypes[name])
    for (const behaviorId of expectedBehaviors) {
      expect(behaviors[behaviorId], `expected ${name} to include the '${behaviorId}' cluster`).toBeDefined()
    }
  })
})

describe('command clusters are routable to plugin handlers', () => {
  // Carrying the cluster is only half the job. If CORE_CLUSTER_BEHAVIOR_MAP has
  // no entry for it, the plugin's handlers are registered but nothing ever
  // invokes them - the endpoint advertises controls that silently do nothing.
  // That is what shipped for Closure and MediaPlayer, so guard it by name.
  const cases: Array<[keyof typeof deviceTypes, string[]]> = [
    ['Closure', ['closureControl']],
    ['MediaPlayer', ['mediaPlayback', 'keypadInput']],
    ['Speaker', ['onOff', 'levelControl']],
    ['WaterValve', ['valveConfigurationAndControl']],
    ['DoorLock', ['doorLock']],
  ]

  it.each(cases)('%s can route %j', (name, clusterNames) => {
    for (const clusterName of clusterNames) {
      expect(
        CORE_CLUSTER_BEHAVIOR_MAP[clusterName],
        `${name} advertises '${clusterName}' but no behavior routes its commands`,
      ).toBeDefined()
    }
  })
})

describe('closure and media default servers', () => {
  // matter.js implements none of these commands, so the base servers throw
  // NotImplementedError. The device types must compose ours instead, or a
  // plugin that supplies no handlers gets an endpoint that fails every command.
  it.each([
    ['Closure', 'closureControl', 'DefaultClosureControlServer'],
    ['MediaPlayer', 'mediaPlayback', 'DefaultMediaPlaybackServer'],
    ['MediaPlayer', 'keypadInput', 'DefaultKeypadInputServer'],
  ] as const)('%s uses our %s implementation', (name, clusterName, expectedBase) => {
    const behavior = supportedBehaviors(deviceTypes[name])[clusterName]

    // `.with(...)` produces an anonymous subclass, so walk up to the named one.
    let current: any = behavior
    const names: string[] = []
    while (current) {
      names.push(current.name)
      current = Object.getPrototypeOf(current)
    }

    expect(names).toContain(expectedBase)
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

describe('pump pumpConfigurationAndControl features', () => {
  it('enables the ConstantSpeed control mode', () => {
    const behaviors = supportedBehaviors(deviceTypes.Pump)
    const features = enabledFeatures(behaviors.pumpConfigurationAndControl)
    expect(features.constantSpeed).toBe(true)
  })
})

describe('roomAirConditioner thermostat features', () => {
  it('enables the Heating and Cooling features', () => {
    const behaviors = supportedBehaviors(deviceTypes.RoomAirConditioner)
    const features = enabledFeatures(behaviors.thermostat)
    expect(features.heating).toBe(true)
    expect(features.cooling).toBe(true)
  })
})

describe('genericSwitch switch features', () => {
  it('enables the momentary feature set that SwitchAPI documents', () => {
    const behaviors = supportedBehaviors(deviceTypes.GenericSwitch)
    const features = enabledFeatures(behaviors.switch)
    expect(features.momentarySwitch).toBe(true)
    expect(features.momentarySwitchRelease).toBe(true)
    expect(features.momentarySwitchLongPress).toBe(true)
    expect(features.momentarySwitchMultiPress).toBe(true)
    expect(features.latchingSwitch).toBe(false)
  })
})

describe('deviceRequirements', () => {
  // Homebridge chooses a feature set from the state an accessory declares, which
  // is right nearly always. When it is not - a thermostat that heats and cools
  // but has no auto mode - the plugin has to compose the cluster itself, and it
  // cannot do that without these. Reaching into `@matter/main` from a plugin is
  // not an acceptable substitute.
  it('exposes a requirements entry for every feature-gated device type', () => {
    for (const name of ['MotionSensor', 'SmokeSensor', 'ElectricalSensor', 'Thermostat', 'Closure', 'RoboticVacuumCleaner', 'WaterValve', 'GenericSwitch', 'Pump', 'RoomAirConditioner', 'WindowCovering'] as const) {
      expect(deviceRequirements[name], `deviceRequirements.${name}`).toBeDefined()
      expect(deviceTypes[name], `deviceTypes.${name}`).toBeDefined()
    }
  })

  // WindowCovering is feature-gated the same way, and its features are detected
  // from the declared lift/tilt attributes. A blind that reports a lift position
  // it cannot be commanded to had no way to say so without this.
  it('lets a window covering be composed with lift only', () => {
    const liftOnly = deviceTypes.WindowCovering.with(
      (deviceRequirements.WindowCovering.WindowCoveringServer as any).with('Lift', 'PositionAwareLift'),
    )
    const features = enabledFeatures(supportedBehaviors(liftOnly).windowCovering)
    expect(features.lift).toBe(true)
    expect(features.positionAwareLift).toBe(true)
    expect(features.tilt).toBe(false)
    // AccessoryManager's skip check reads behaviors.windowCovering
    expect(supportedBehaviors(liftOnly).windowCovering).toBeDefined()
  })

  // The case that prompted this: heat + cool WITHOUT auto is legal in the spec,
  // but the detected feature set always adds AutoMode when both setpoints exist.
  it('lets a thermostat be composed with heating and cooling but no auto mode', () => {
    const noAuto = deviceTypes.Thermostat.with(
      (deviceRequirements.Thermostat.ThermostatServer as any).with('Heating', 'Cooling'),
    )
    const features = enabledFeatures(supportedBehaviors(noAuto).thermostat)
    expect(features.heating).toBe(true)
    expect(features.cooling).toBe(true)
    expect(features.autoMode).toBe(false)
  })

  // AccessoryManager skips its own detection when the plugin already composed
  // the cluster - that check reads `behaviors.thermostat`, so it has to be set.
  it('produces a device type that AccessoryManager will leave alone', () => {
    const noAuto = deviceTypes.Thermostat.with(
      (deviceRequirements.Thermostat.ThermostatServer as any).with('Heating', 'Cooling'),
    )
    expect(supportedBehaviors(noAuto).thermostat).toBeDefined()
  })
})
