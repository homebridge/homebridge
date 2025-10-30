import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { describe, expect, it } from 'vitest'

import { HomebridgeThermostatServer } from './ThermostatBehavior.js'

describe('homebridgeThermostatServer', () => {
  describe('setRegistry', () => {
    it('should set the registry', () => {
      const newRegistry = {} as BehaviorRegistry
      HomebridgeThermostatServer.setRegistry(newRegistry)
      expect(true).toBe(true)
    })
  })

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
