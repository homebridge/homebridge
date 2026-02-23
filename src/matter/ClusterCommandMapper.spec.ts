import { describe, expect, it } from 'vitest'

import { mapAttributesToCommand } from './ClusterCommandMapper.js'

describe('clusterCommandMapper', () => {
  describe('onOff cluster', () => {
    it('should map onOff=true to "on" command', () => {
      const result = mapAttributesToCommand('onOff', { onOff: true })
      expect(result).toEqual({ command: 'on' })
    })

    it('should map onOff=false to "off" command', () => {
      const result = mapAttributesToCommand('onOff', { onOff: false })
      expect(result).toEqual({ command: 'off' })
    })
  })

  describe('levelControl cluster', () => {
    it('should map currentLevel to "moveToLevelWithOnOff" command', () => {
      const result = mapAttributesToCommand('levelControl', { currentLevel: 128 })
      expect(result).toEqual({
        command: 'moveToLevelWithOnOff',
        args: { level: 128 },
      })
    })

    it('should map currentLevel=0 to "moveToLevelWithOnOff" command', () => {
      const result = mapAttributesToCommand('levelControl', { currentLevel: 0 })
      expect(result).toEqual({
        command: 'moveToLevelWithOnOff',
        args: { level: 0 },
      })
    })

    it('should map currentLevel=254 (max) to "moveToLevelWithOnOff" command', () => {
      const result = mapAttributesToCommand('levelControl', { currentLevel: 254 })
      expect(result).toEqual({
        command: 'moveToLevelWithOnOff',
        args: { level: 254 },
      })
    })

    it('should return null for unknown attributes', () => {
      const result = mapAttributesToCommand('levelControl', { unknownAttr: 100 })
      expect(result).toBeNull()
    })
  })

  describe('colorControl cluster', () => {
    describe('colorTemperatureMireds', () => {
      it('should map colorTemperatureMireds to "moveToColorTemperature" command with default transition', () => {
        const result = mapAttributesToCommand('colorControl', { colorTemperatureMireds: 250 })
        expect(result).toEqual({
          command: 'moveToColorTemperature',
          args: {
            colorTemperatureMireds: 250,
            transitionTime: 0,
            optionsMask: 1,
            optionsOverride: 1,
          },
        })
      })

      it('should use provided transitionTime when specified', () => {
        const result = mapAttributesToCommand('colorControl', {
          colorTemperatureMireds: 250,
          transitionTime: 10,
        })
        expect(result).toEqual({
          command: 'moveToColorTemperature',
          args: {
            colorTemperatureMireds: 250,
            transitionTime: 10,
            optionsMask: 1,
            optionsOverride: 1,
          },
        })
      })

      it('should include optionsMask and optionsOverride for ExecuteIfOff', () => {
        const result = mapAttributesToCommand('colorControl', { colorTemperatureMireds: 300 })
        expect(result?.args).toHaveProperty('optionsMask', 1)
        expect(result?.args).toHaveProperty('optionsOverride', 1)
      })
    })

    describe('colorX and colorY', () => {
      it('should map colorX and colorY to "moveToColor" command', () => {
        const result = mapAttributesToCommand('colorControl', {
          colorX: 0.3,
          colorY: 0.4,
        })
        expect(result).toEqual({
          command: 'moveToColor',
          args: {
            colorX: 0.3,
            colorY: 0.4,
            transitionTime: 0,
            optionsMask: 1,
            optionsOverride: 1,
          },
        })
      })

      it('should use provided transitionTime when specified', () => {
        const result = mapAttributesToCommand('colorControl', {
          colorX: 0.3,
          colorY: 0.4,
          transitionTime: 20,
        })
        expect(result).toEqual({
          command: 'moveToColor',
          args: {
            colorX: 0.3,
            colorY: 0.4,
            transitionTime: 20,
            optionsMask: 1,
            optionsOverride: 1,
          },
        })
      })

      it('should include optionsMask and optionsOverride for ExecuteIfOff', () => {
        const result = mapAttributesToCommand('colorControl', {
          colorX: 0.5,
          colorY: 0.5,
        })
        expect(result?.args).toHaveProperty('optionsMask', 1)
        expect(result?.args).toHaveProperty('optionsOverride', 1)
      })
    })

    describe('currentHue and currentSaturation', () => {
      it('should map hue and saturation to "moveToHueAndSaturation" command', () => {
        const result = mapAttributesToCommand('colorControl', {
          currentHue: 120,
          currentSaturation: 200,
        })
        expect(result).toEqual({
          command: 'moveToHueAndSaturation',
          args: {
            hue: 120,
            saturation: 200,
            transitionTime: 0,
            optionsMask: 1,
            optionsOverride: 1,
          },
        })
      })

      it('should default to 0 for missing hue or saturation', () => {
        const result = mapAttributesToCommand('colorControl', {
          currentHue: 100,
        })
        expect(result).toEqual({
          command: 'moveToHueAndSaturation',
          args: {
            hue: 100,
            saturation: 0,
            transitionTime: 0,
            optionsMask: 1,
            optionsOverride: 1,
          },
        })
      })

      it('should use provided transitionTime when specified', () => {
        const result = mapAttributesToCommand('colorControl', {
          currentHue: 120,
          currentSaturation: 200,
          transitionTime: 15,
        })
        expect(result).toEqual({
          command: 'moveToHueAndSaturation',
          args: {
            hue: 120,
            saturation: 200,
            transitionTime: 15,
            optionsMask: 1,
            optionsOverride: 1,
          },
        })
      })

      it('should include optionsMask and optionsOverride for ExecuteIfOff', () => {
        const result = mapAttributesToCommand('colorControl', {
          currentHue: 180,
          currentSaturation: 254,
        })
        expect(result?.args).toHaveProperty('optionsMask', 1)
        expect(result?.args).toHaveProperty('optionsOverride', 1)
      })
    })

    it('should return null for unknown color attributes', () => {
      const result = mapAttributesToCommand('colorControl', { unknownAttr: 100 })
      expect(result).toBeNull()
    })
  })

  describe('doorLock cluster', () => {
    it('should map lockState=1 (locked) to "lockDoor" command', () => {
      const result = mapAttributesToCommand('doorLock', { lockState: 1 })
      expect(result).toEqual({ command: 'lockDoor' })
    })

    it('should map lockState=2 (unlocked) to "unlockDoor" command', () => {
      const result = mapAttributesToCommand('doorLock', { lockState: 2 })
      expect(result).toEqual({ command: 'unlockDoor' })
    })

    it('should map _command attribute directly', () => {
      const result = mapAttributesToCommand('doorLock', { _command: 'lockDoor' })
      expect(result).toEqual({ command: 'lockDoor' })
    })
  })

  describe('windowCovering cluster', () => {
    it('should map targetPositionLiftPercent100ths to "goToLiftPercentage" command', () => {
      const result = mapAttributesToCommand('windowCovering', {
        targetPositionLiftPercent100ths: 5000,
      })
      expect(result).toEqual({
        command: 'goToLiftPercentage',
        args: { liftPercent100thsValue: 5000 },
      })
    })

    it('should map targetPositionTiltPercent100ths to "goToTiltPercentage" command', () => {
      const result = mapAttributesToCommand('windowCovering', {
        targetPositionTiltPercent100ths: 7500,
      })
      expect(result).toEqual({
        command: 'goToTiltPercentage',
        args: { tiltPercent100thsValue: 7500 },
      })
    })
  })

  describe('thermostat cluster', () => {
    it('should return null for occupiedHeatingSetpoint (triggers handler automatically)', () => {
      const result = mapAttributesToCommand('thermostat', {
        occupiedHeatingSetpoint: 2100,
      })
      expect(result).toBeNull()
    })

    it('should return null for occupiedCoolingSetpoint (triggers handler automatically)', () => {
      const result = mapAttributesToCommand('thermostat', {
        occupiedCoolingSetpoint: 2400,
      })
      expect(result).toBeNull()
    })

    it('should return null for systemMode (triggers handler automatically)', () => {
      const result = mapAttributesToCommand('thermostat', {
        systemMode: 3,
      })
      expect(result).toBeNull()
    })

    it('should map _command=setpointRaiseLower to "setpointRaiseLower" command', () => {
      const result = mapAttributesToCommand('thermostat', {
        _command: 'setpointRaiseLower',
        mode: 0,
        amount: 100,
      })
      expect(result).toEqual({
        command: 'setpointRaiseLower',
        args: {
          mode: 0,
          amount: 100,
        },
      })
    })
  })

  describe('fanControl cluster', () => {
    it('should return null for percentSetting (triggers handler automatically)', () => {
      const result = mapAttributesToCommand('fanControl', {
        percentSetting: 75,
      })
      expect(result).toBeNull()
    })

    it('should return null for fanMode (triggers handler automatically)', () => {
      const result = mapAttributesToCommand('fanControl', {
        fanMode: 1,
      })
      expect(result).toBeNull()
    })

    it('should return null for unknown attributes', () => {
      const result = mapAttributesToCommand('fanControl', { unknownAttr: 100 })
      expect(result).toBeNull()
    })
  })

  describe('rvcOperationalState cluster', () => {
    it('should map operationalState=2 (Paused) to "pause" command', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { operationalState: 2 })
      expect(result).toEqual({ command: 'pause' })
    })

    it('should map operationalState=1 (Running) to "resume" command', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { operationalState: 1 })
      expect(result).toEqual({ command: 'resume' })
    })

    it('should return null for operationalState=0 (Stopped) - state-only update', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { operationalState: 0 })
      expect(result).toBeNull()
    })

    it('should return null for dock states - state-only update', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { operationalState: 66 })
      expect(result).toBeNull()
    })

    it('should map _command=pause to "pause" command', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { _command: 'pause' })
      expect(result).toEqual({ command: 'pause' })
    })

    it('should map _command=resume to "resume" command', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { _command: 'resume' })
      expect(result).toEqual({ command: 'resume' })
    })

    it('should map _command=goHome to "goHome" command', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { _command: 'goHome' })
      expect(result).toEqual({ command: 'goHome' })
    })

    it('should return null for unsupported _command values', () => {
      const result = mapAttributesToCommand('rvcOperationalState', { _command: 'stop' })
      expect(result).toBeNull()
    })
  })

  describe('rvcRunMode cluster', () => {
    it('should map currentMode to "changeToMode" command', () => {
      const result = mapAttributesToCommand('rvcRunMode', { currentMode: 1 })
      expect(result).toEqual({
        command: 'changeToMode',
        args: { newMode: 1 },
      })
    })

    it('should map currentMode=0 (Idle) to "changeToMode" command', () => {
      const result = mapAttributesToCommand('rvcRunMode', { currentMode: 0 })
      expect(result).toEqual({
        command: 'changeToMode',
        args: { newMode: 0 },
      })
    })
  })

  describe('unknown cluster', () => {
    it('should throw error for unmapped clusters', () => {
      expect(() => mapAttributesToCommand('unknownCluster', { someAttr: 123 }))
        .toThrow('Command mapping not implemented for cluster: unknownCluster')
    })
  })

  describe('edge cases', () => {
    it('should handle empty attributes object', () => {
      const result = mapAttributesToCommand('onOff', {})
      expect(result).toBeNull()
    })

    it('should pass through null values in attributes', () => {
      const result = mapAttributesToCommand('levelControl', { currentLevel: null })
      expect(result).toEqual({
        command: 'moveToLevelWithOnOff',
        args: { level: null },
      })
    })

    it('should pass through undefined values in attributes', () => {
      const result = mapAttributesToCommand('levelControl', { currentLevel: undefined })
      expect(result).toEqual({
        command: 'moveToLevelWithOnOff',
        args: { level: undefined },
      })
    })
  })
})
