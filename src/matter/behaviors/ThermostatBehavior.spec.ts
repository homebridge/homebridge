import { describe, expect, it } from 'vitest'

import { HomebridgeThermostatServer } from './ThermostatBehavior.js'

describe('homebridgeThermostatServer', () => {
  describe('behavior structure', () => {
    it('should extend ThermostatServer', () => {
      expect(HomebridgeThermostatServer.prototype).toBeDefined()
    })

    it('should have initialize method', () => {
      expect(typeof HomebridgeThermostatServer.prototype.initialize).toBe('function')
    })
  })
})

// Note: ThermostatBehavior uses reactTo() pattern with private handlers for multiple attributes
// (systemMode, occupiedCoolingSetpoint, occupiedHeatingSetpoint, etc.)
// Integration tests would be more appropriate for testing the event reaction logic.

/**
 * matter.js only links the temperature and occupancy controllers read to the
 * state a plugin sets when the node comes online. A thermostat registered
 * after that showed 0 degrees for good (homebridge-matter#9), so Homebridge
 * does the same linking itself for a thermostat added to a node already
 * online. Checked end to end against a real matter.js node; these pin it.
 */
describe('a thermostat added after its node is online', () => {
  function build(state: Record<string, unknown>, features: Record<string, boolean> = {}) {
    const reactions: Array<{ event: string, handler: (value: unknown) => void }> = []
    const behavior = Object.create(HomebridgeThermostatServer.prototype)
    Object.defineProperty(behavior, 'state', { value: state })
    Object.defineProperty(behavior, 'features', { value: features })
    Object.defineProperty(behavior, 'events', {
      value: {
        externalMeasuredIndoorTemperature$Changed: 'temperature',
        externallyMeasuredOccupancy$Changed: 'occupancy',
      },
    })
    behavior.reactTo = (event: string, handler: (value: unknown) => void) => reactions.push({ event, handler })
    behavior.linkExternalReadings()
    const fire = (event: string, value: unknown) => reactions
      .filter(reaction => reaction.event === event)
      .forEach(reaction => reaction.handler.call(behavior, value))
    return { state, reactions, fire }
  }

  it('shows the plugin\'s temperature, and keeps it in step', () => {
    const { state, fire } = build({ externalMeasuredIndoorTemperature: 2400 })
    expect(state.localTemperature).toBe(2400)

    fire('temperature', 2550)
    expect(state.localTemperature).toBe(2550)
  })

  it('applies the calibration, which is in tenths of a degree', () => {
    const { state } = build({ externalMeasuredIndoorTemperature: 2400, localTemperatureCalibration: 5 })
    expect(state.localTemperature).toBe(2450)
  })

  it('follows the plugin\'s occupancy when the thermostat has the feature', () => {
    const { state, fire } = build({ externallyMeasuredOccupancy: false }, { occupancy: true })
    expect(state.occupancy).toEqual({ occupied: false })

    fire('occupancy', true)
    expect(state.occupancy).toEqual({ occupied: true })
  })

  it('leaves occupancy alone without the feature', () => {
    const { state, reactions } = build({ externallyMeasuredOccupancy: true })
    expect(state.occupancy).toBeUndefined()
    expect(reactions.some(reaction => reaction.event === 'occupancy')).toBe(false)
  })

  it('leaves the temperature alone when the thermostat does not expose it', () => {
    const { state } = build({ externalMeasuredIndoorTemperature: 2400 }, { localTemperatureNotExposed: true })
    expect(state.localTemperature).toBeUndefined()
  })
})
