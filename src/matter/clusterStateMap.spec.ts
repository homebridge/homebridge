import type { ClusterStateMap } from './clusterStateMap.js'
import type {
  ClosureControlState,
  ColorControlState,
  MediaPlaybackState,
  PumpConfigurationAndControlState,
  RvcOperationalState,
  RvcOperationalStateState,
  SmokeCoAlarmState,
  ThermostatState,
} from './clusterTypes.js'
import type { MatterAccessory } from './types.js'

import { describe, expect, expectTypeOf, it } from 'vitest'

/**
 * Compile-time checks of the state types a plugin sees. They are checked by
 * `tsc -p tsconfig.typecheck.json`; the runtime assertions only make each a
 * real test.
 */
describe('clusterStateMap', () => {
  it('has state types for smoke alarms, closures, media players and pumps, for a plugin to use by name', () => {
    expectTypeOf<SmokeCoAlarmState>().toHaveProperty('smokeState')
    expectTypeOf<PumpConfigurationAndControlState>().toHaveProperty('effectiveOperationMode')
    // each attribute is optional: a smoke alarm only declares the ones of its feature
    const smoke: SmokeCoAlarmState = { smokeState: 0, batteryAlert: 0 }
    const pump: PumpConfigurationAndControlState = { effectiveOperationMode: 0 }
    const closure: ClosureControlState = {
      mainState: 0,
      currentErrorList: [],
      overallCurrentState: { position: 0, secureState: true },
      overallTargetState: { position: 0 },
    }
    const player: MediaPlaybackState = { currentState: 2 }
    expect([
      smoke.smokeState,
      pump.effectiveOperationMode,
      closure.mainState,
      player.currentState,
    ]).toEqual([0, 0, 0, 2])
  })

  // Typing a cluster in the map is a breaking change for a plugin that builds
  // its state as a plain record first, as the example smoke alarm does.
  it('still takes a plain record for a cluster that is not in the map', () => {
    const smokeCoAlarm: Record<string, unknown> = { batteryAlert: 0 }
    smokeCoAlarm.smokeState = 0
    const clusters: MatterAccessory['clusters'] = { smokeCoAlarm }
    expect(clusters?.smokeCoAlarm).toBe(smokeCoAlarm)
  })

  it('has the color control attributes matter.js has', () => {
    expectTypeOf<ColorControlState>().toHaveProperty('remainingTime')
    expectTypeOf<ColorControlState>().toHaveProperty('colorCapabilities')
    expectTypeOf<ColorControlState>().toHaveProperty('startUpColorTemperatureMireds')
    const state: ColorControlState = {
      startUpColorTemperatureMireds: null,
      remainingTime: 0,
      colorCapabilities: { xy: true },
    }
    expect(state.remainingTime).toBe(0)
  })

  it('has the thermostat calibration, which the thermostat behavior reads', () => {
    expectTypeOf<ThermostatState>().toHaveProperty('localTemperatureCalibration')
    const state: ThermostatState = { localTemperatureCalibration: -5 }
    expect(state.localTemperatureCalibration).toBe(-5)
  })

  it('keeps the old name of the vacuum operational state type', () => {
    expectTypeOf<RvcOperationalState>().toEqualTypeOf<RvcOperationalStateState>()
    expectTypeOf<ClusterStateMap['rvcOperationalState']>().toEqualTypeOf<RvcOperationalStateState>()
    expect(true).toBe(true)
  })
})
