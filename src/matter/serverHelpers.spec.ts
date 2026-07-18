import { describe, expect, it } from 'vitest'

import {
  applyElectricalMeasurementClusters,
  applyElectricalMeasurementDefaults,
  applyFeaturesToBehavior,
  applySmokeCoAlarmFeatures,
  applyWindowCoveringFeatures,
  CLUSTER_IDS,
  detectBehaviorFeatures,
  detectElectricalMeasurementClusters,
  detectServiceAreaFeatures,
  detectSmokeCoAlarmFeatures,
  detectWindowCoveringFeatures,
  determineColorControlFeaturesFromHandlers,
  extractColorControlFeatures,
  extractLevelControlFeatures,
  extractThermostatFeatures,
  validateAccessoryRequiredFields,
} from './serverHelpers.js'
import { devices, MatterDeviceError } from './types.js'

describe('serverHelpers', () => {
  describe('cLUSTER_IDS', () => {
    it('should export cluster ID constants', () => {
      expect(CLUSTER_IDS.COLOR_CONTROL).toBeDefined()
      expect(CLUSTER_IDS.THERMOSTAT).toBeDefined()
      expect(CLUSTER_IDS.WINDOW_COVERING).toBeDefined()
      expect(CLUSTER_IDS.DOOR_LOCK).toBeDefined()
      expect(CLUSTER_IDS.ON_OFF).toBeDefined()
      expect(CLUSTER_IDS.LEVEL_CONTROL).toBeDefined()
    })
  })

  describe('validateAccessoryRequiredFields', () => {
    it('should pass validation for valid accessory', () => {
      const validAccessory = {
        deviceType: { name: 'OnOffLight' },
        UUID: 'test-uuid',
        displayName: 'Test Light',
        serialNumber: 'ABC123',
        manufacturer: 'Homebridge',
        model: 'v1.0',
        clusters: {
          onOff: { onOff: false },
        },
      } as any

      expect(() => validateAccessoryRequiredFields(validAccessory)).not.toThrow()
    })

    it('should throw error when deviceType is missing', () => {
      const accessory = {
        UUID: 'test-uuid',
        displayName: 'Test Light',
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(MatterDeviceError)
      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/deviceType/)
    })

    it('should throw error when uuid is missing', () => {
      const accessory = {
        deviceType: { name: 'OnOffLight' },
        displayName: 'Test Light',
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(MatterDeviceError)
      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/uuid/)
    })

    it('should throw error when displayName is missing', () => {
      const accessory = {
        deviceType: { name: 'OnOffLight' },
        UUID: 'test-uuid',
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(MatterDeviceError)
      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/displayName/)
    })

    it('should throw error when serialNumber is missing', () => {
      const accessory = {
        deviceType: { name: 'OnOffLight' },
        UUID: 'test-uuid',
        displayName: 'Test Light',
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(MatterDeviceError)
      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/serialNumber/)
    })

    it('should throw error when manufacturer is missing', () => {
      const accessory = {
        deviceType: { name: 'OnOffLight' },
        UUID: 'test-uuid',
        displayName: 'Test Light',
        serialNumber: 'ABC123',
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(MatterDeviceError)
      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/manufacturer/)
    })

    it('should throw error when model is missing', () => {
      const accessory = {
        deviceType: { name: 'OnOffLight' },
        UUID: 'test-uuid',
        displayName: 'Test Light',
        serialNumber: 'ABC123',
        manufacturer: 'Homebridge',
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(MatterDeviceError)
      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/model/)
    })

    it('should throw error when clusters is missing for non-composed devices', () => {
      const accessory = {
        deviceType: { name: 'OnOffLight' },
        UUID: 'test-uuid',
        displayName: 'Test Light',
        serialNumber: 'ABC123',
        manufacturer: 'Homebridge',
        model: 'v1.0',
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(MatterDeviceError)
      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/clusters/)
    })

    it('should allow missing clusters when parts are provided', () => {
      const accessory = {
        deviceType: { name: 'ComposedDevice' },
        UUID: 'test-uuid',
        displayName: 'Test Device',
        serialNumber: 'ABC123',
        manufacturer: 'Homebridge',
        model: 'v1.0',
        parts: [
          {
            id: 'part1',
            deviceType: { name: 'OnOffLight' },
            clusters: { onOff: { onOff: false } },
          },
        ],
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).not.toThrow()
    })

    it('should throw error when part is missing id', () => {
      const accessory = {
        deviceType: { name: 'ComposedDevice' },
        UUID: 'test-uuid',
        displayName: 'Test Device',
        serialNumber: 'ABC123',
        manufacturer: 'Homebridge',
        model: 'v1.0',
        parts: [
          {
            deviceType: { name: 'OnOffLight' },
            clusters: { onOff: { onOff: false } },
          },
        ],
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/part missing required field 'id'/)
    })

    it('should throw error when part is missing deviceType', () => {
      const accessory = {
        deviceType: { name: 'ComposedDevice' },
        UUID: 'test-uuid',
        displayName: 'Test Device',
        serialNumber: 'ABC123',
        manufacturer: 'Homebridge',
        model: 'v1.0',
        parts: [
          {
            id: 'part1',
            clusters: { onOff: { onOff: false } },
          },
        ],
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/part "part1" is missing required field 'deviceType'/)
    })

    it('should throw error when part is missing clusters', () => {
      const accessory = {
        deviceType: { name: 'ComposedDevice' },
        UUID: 'test-uuid',
        displayName: 'Test Device',
        serialNumber: 'ABC123',
        manufacturer: 'Homebridge',
        model: 'v1.0',
        parts: [
          {
            id: 'part1',
            deviceType: { name: 'OnOffLight' },
          },
        ],
      } as any

      expect(() => validateAccessoryRequiredFields(accessory)).toThrow(/part "part1" is missing or has invalid 'clusters' field/)
    })
  })

  describe('extractColorControlFeatures', () => {
    it('should extract HueSaturation feature', () => {
      const features = extractColorControlFeatures({ hueSaturation: true })
      expect(features).toContain('HueSaturation')
    })

    it('should extract Xy feature', () => {
      const features = extractColorControlFeatures({ xy: true })
      expect(features).toContain('Xy')
    })

    it('should extract ColorTemperature feature', () => {
      const features = extractColorControlFeatures({ colorTemperature: true })
      expect(features).toContain('ColorTemperature')
    })

    it('should extract multiple features', () => {
      const features = extractColorControlFeatures({
        hueSaturation: true,
        xy: true,
        colorTemperature: true,
      })
      expect(features).toEqual(['HueSaturation', 'Xy', 'ColorTemperature'])
    })

    it('should return empty array when no features are enabled', () => {
      const features = extractColorControlFeatures({})
      expect(features).toEqual([])
    })
  })

  describe('extractThermostatFeatures', () => {
    it('should extract Heating feature', () => {
      const features = extractThermostatFeatures({ heating: true })
      expect(features).toContain('Heating')
    })

    it('should extract Cooling feature', () => {
      const features = extractThermostatFeatures({ cooling: true })
      expect(features).toContain('Cooling')
    })

    it('should extract Occupancy feature', () => {
      const features = extractThermostatFeatures({ occupancy: true })
      expect(features).toContain('Occupancy')
    })

    it('should extract AutoMode feature', () => {
      const features = extractThermostatFeatures({ autoMode: true })
      expect(features).toContain('AutoMode')
    })

    it('should extract multiple features', () => {
      const features = extractThermostatFeatures({
        heating: true,
        cooling: true,
        occupancy: true,
        autoMode: true,
      })
      expect(features).toEqual(['Heating', 'Cooling', 'Occupancy', 'AutoMode'])
    })

    it('should return empty array when no features are enabled', () => {
      const features = extractThermostatFeatures({})
      expect(features).toEqual([])
    })
  })

  describe('extractLevelControlFeatures', () => {
    it('should extract OnOff feature', () => {
      const features = extractLevelControlFeatures({ onOff: true })
      expect(features).toContain('OnOff')
    })

    it('should extract Lighting feature', () => {
      const features = extractLevelControlFeatures({ lighting: true })
      expect(features).toContain('Lighting')
    })

    it('should extract Frequency feature', () => {
      const features = extractLevelControlFeatures({ frequency: true })
      expect(features).toContain('Frequency')
    })

    it('should extract multiple features in declaration order', () => {
      const features = extractLevelControlFeatures({ onOff: true, lighting: true, frequency: true })
      expect(features).toEqual(['OnOff', 'Lighting', 'Frequency'])
    })

    it('should return empty array when no features are declared (non-lighting device case)', () => {
      const features = extractLevelControlFeatures({})
      expect(features).toEqual([])
    })

    it('should omit Lighting when device type explicitly opts out', () => {
      const features = extractLevelControlFeatures({ onOff: true, lighting: false })
      expect(features).toEqual(['OnOff'])
    })
  })

  describe('determineColorControlFeaturesFromHandlers', () => {
    it('should detect HueSaturation from handler method', () => {
      const handlers = {
        moveToHueAndSaturationLogic: () => {},
      }
      const features = determineColorControlFeaturesFromHandlers(handlers)
      expect(features).toContain('HueSaturation')
    })

    it('should detect Xy from handler method', () => {
      const handlers = {
        moveToColorLogic: () => {},
      }
      const features = determineColorControlFeaturesFromHandlers(handlers)
      expect(features).toContain('Xy')
    })

    it('should detect ColorTemperature from handler method', () => {
      const handlers = {
        moveToColorTemperatureLogic: () => {},
      }
      const features = determineColorControlFeaturesFromHandlers(handlers)
      expect(features).toContain('ColorTemperature')
    })

    it('should detect multiple features from multiple handlers', () => {
      const handlers = {
        moveToHueAndSaturationLogic: () => {},
        moveToColorLogic: () => {},
        moveToColorTemperatureLogic: () => {},
      }
      const features = determineColorControlFeaturesFromHandlers(handlers)
      expect(features).toEqual(['HueSaturation', 'Xy', 'ColorTemperature'])
    })

    it('should return empty array when no relevant handlers exist', () => {
      const handlers = {
        someOtherHandler: () => {},
      }
      const features = determineColorControlFeaturesFromHandlers(handlers)
      expect(features).toEqual([])
    })
  })

  describe('detectWindowCoveringFeatures', () => {
    it('should detect Lift capability from target attributes', () => {
      const accessory = {
        displayName: 'Test Blind',
        clusters: {
          windowCovering: {
            targetPositionLiftPercent100ths: 0,
          },
        },
      } as any

      const features = detectWindowCoveringFeatures(accessory)
      expect(features).toContain('Lift')
    })

    it('should detect Lift capability from current attributes', () => {
      const accessory = {
        displayName: 'Test Blind',
        clusters: {
          windowCovering: {
            currentPositionLiftPercent100ths: 0,
          },
        },
      } as any

      const features = detectWindowCoveringFeatures(accessory)
      expect(features).toContain('Lift')
    })

    it('should detect PositionAwareLift from configStatus', () => {
      const accessory = {
        displayName: 'Test Blind',
        clusters: {
          windowCovering: {
            targetPositionLiftPercent100ths: 0,
            configStatus: {
              liftPositionAware: true,
            },
          },
        },
      } as any

      const features = detectWindowCoveringFeatures(accessory)
      expect(features).toContain('Lift')
      expect(features).toContain('PositionAwareLift')
    })

    it('should detect Tilt capability', () => {
      const accessory = {
        displayName: 'Test Blind',
        clusters: {
          windowCovering: {
            targetPositionTiltPercent100ths: 0,
          },
        },
      } as any

      const features = detectWindowCoveringFeatures(accessory)
      expect(features).toContain('Tilt')
    })

    it('should detect PositionAwareTilt from configStatus', () => {
      const accessory = {
        displayName: 'Test Blind',
        clusters: {
          windowCovering: {
            targetPositionTiltPercent100ths: 0,
            configStatus: {
              tiltPositionAware: true,
            },
          },
        },
      } as any

      const features = detectWindowCoveringFeatures(accessory)
      expect(features).toContain('Tilt')
      expect(features).toContain('PositionAwareTilt')
    })

    it('should detect both Lift and Tilt features', () => {
      const accessory = {
        displayName: 'Test Blind',
        clusters: {
          windowCovering: {
            targetPositionLiftPercent100ths: 0,
            targetPositionTiltPercent100ths: 0,
          },
        },
      } as any

      const features = detectWindowCoveringFeatures(accessory)
      expect(features).toContain('Lift')
      expect(features).toContain('Tilt')
    })

    it('should return empty array when no WindowCovering cluster', () => {
      const accessory = {
        displayName: 'Test Device',
        clusters: {},
      } as any

      const features = detectWindowCoveringFeatures(accessory)
      expect(features).toEqual([])
    })
  })

  describe('detectServiceAreaFeatures', () => {
    it('should detect Maps feature', () => {
      const cluster = {
        supportedMaps: [],
      }

      const features = detectServiceAreaFeatures(cluster)
      expect(features).toContain('Maps')
    })

    it('should detect ProgressReporting feature', () => {
      const cluster = {
        progress: [],
      }

      const features = detectServiceAreaFeatures(cluster)
      expect(features).toContain('ProgressReporting')
    })

    it('should detect multiple features', () => {
      const cluster = {
        supportedMaps: [],
        progress: [],
      }

      const features = detectServiceAreaFeatures(cluster)
      expect(features).toEqual(['Maps', 'ProgressReporting'])
    })

    it('should return empty array when cluster is undefined', () => {
      const features = detectServiceAreaFeatures(undefined)
      expect(features).toEqual([])
    })

    it('should return empty array when no features present', () => {
      const cluster = {}

      const features = detectServiceAreaFeatures(cluster)
      expect(features).toEqual([])
    })
  })

  describe('applyWindowCoveringFeatures', () => {
    it('should return device type when no features detected', () => {
      const mockLogger = {
        warn: () => {},
      }
      const originalConsoleWarn = console.warn
      console.warn = mockLogger.warn

      const deviceType = { name: 'WindowCovering' } as any
      const accessory = { displayName: 'Test Blind' } as any

      const result = applyWindowCoveringFeatures(deviceType, accessory, [])

      expect(result).toBe(deviceType)

      console.warn = originalConsoleWarn
    })

    it('should set window covering type to TiltBlindLift when tilt features exist', () => {
      const deviceType = {
        name: 'WindowCovering',
        with: () => deviceType,
      } as any

      const accessory = {
        displayName: 'Test Blind',
        clusters: {
          windowCovering: {
            type: 0,
          },
        },
      } as any

      applyWindowCoveringFeatures(deviceType, accessory, ['Lift', 'Tilt'])

      expect(accessory.clusters.windowCovering.type).toBe(8) // TiltBlindLift
    })

    it('should set _skipWindowCoveringBehavior context flag', () => {
      const deviceType = {
        name: 'WindowCovering',
        with: () => deviceType,
      } as any

      const accessory = {
        displayName: 'Test Blind',
      } as any

      applyWindowCoveringFeatures(deviceType, accessory, ['Lift'])

      expect(accessory.context).toBeDefined()
      expect((accessory.context as any)._skipWindowCoveringBehavior).toBe(true)
    })
  })

  describe('detectSmokeCoAlarmFeatures', () => {
    it('should detect SmokeAlarm from smokeState attribute', () => {
      const accessory = {
        displayName: 'Smoke Detector',
        clusters: { smokeCoAlarm: { smokeState: 0, expressedState: 0 } },
      } as any

      expect(detectSmokeCoAlarmFeatures(accessory)).toEqual(['SmokeAlarm'])
    })

    it('should detect CoAlarm from coState attribute', () => {
      const accessory = {
        displayName: 'CO Detector',
        clusters: { smokeCoAlarm: { coState: 0, expressedState: 0 } },
      } as any

      expect(detectSmokeCoAlarmFeatures(accessory)).toEqual(['CoAlarm'])
    })

    it('should detect both features from combined smoke/CO accessory', () => {
      const accessory = {
        displayName: 'Combo Detector',
        clusters: { smokeCoAlarm: { smokeState: 0, coState: 0, expressedState: 0 } },
      } as any

      expect(detectSmokeCoAlarmFeatures(accessory)).toEqual(['SmokeAlarm', 'CoAlarm'])
    })

    it('should fall back to SmokeAlarm when neither state attribute is declared', () => {
      const accessory = {
        displayName: 'Bare Detector',
        clusters: { smokeCoAlarm: { expressedState: 0 } },
      } as any

      expect(detectSmokeCoAlarmFeatures(accessory)).toEqual(['SmokeAlarm'])
    })
  })

  describe('applySmokeCoAlarmFeatures', () => {
    it('should add the SmokeCoAlarm cluster with the given features to the real device type', () => {
      const accessory = { displayName: 'Smoke Detector' } as any

      const result = applySmokeCoAlarmFeatures(devices.SmokeCoAlarmDevice, accessory, ['SmokeAlarm']) as any

      expect(result.behaviors.smokeCoAlarm).toBeDefined()
      expect(result.behaviors.smokeCoAlarm.features.smokeAlarm).toBe(true)
      expect(result.behaviors.smokeCoAlarm.features.coAlarm).toBe(false)
    })
  })

  describe('detectElectricalMeasurementClusters', () => {
    it('should detect nothing when no electrical clusters are declared', () => {
      const accessory = { displayName: 'Plain Outlet', clusters: { onOff: { onOff: false } } } as any

      expect(detectElectricalMeasurementClusters(accessory)).toEqual({
        hasPowerMeasurement: false,
        energyFeatures: [],
      })
    })

    it('should detect power measurement from electricalPowerMeasurement state', () => {
      const accessory = {
        displayName: 'Metered Outlet',
        clusters: { electricalPowerMeasurement: { activePower: 5_000_000 } },
      } as any

      expect(detectElectricalMeasurementClusters(accessory)).toEqual({
        hasPowerMeasurement: true,
        energyFeatures: [],
      })
    })

    it('should derive imported cumulative energy features from the declared attribute', () => {
      const accessory = {
        displayName: 'Metered Outlet',
        clusters: { electricalEnergyMeasurement: { cumulativeEnergyImported: { energy: 1000 } } },
      } as any

      expect(detectElectricalMeasurementClusters(accessory).energyFeatures)
        .toEqual(['ImportedEnergy', 'CumulativeEnergy'])
    })

    it('should derive exported periodic energy features from the declared attribute', () => {
      const accessory = {
        displayName: 'Solar Meter',
        clusters: { electricalEnergyMeasurement: { periodicEnergyExported: { energy: 1000 } } },
      } as any

      expect(detectElectricalMeasurementClusters(accessory).energyFeatures)
        .toEqual(['ExportedEnergy', 'PeriodicEnergy'])
    })

    it('should fall back to imported cumulative when the cluster is declared without energy attributes', () => {
      const accessory = {
        displayName: 'Bare Meter',
        clusters: { electricalEnergyMeasurement: {} },
      } as any

      expect(detectElectricalMeasurementClusters(accessory).energyFeatures)
        .toEqual(['ImportedEnergy', 'CumulativeEnergy'])
    })
  })

  describe('applyElectricalMeasurementDefaults', () => {
    it('should fill the mandatory power measurement attributes', () => {
      const accessory = {
        displayName: 'Metered Outlet',
        clusters: { electricalPowerMeasurement: { activePower: 5_000_000, voltage: 230_000 } },
      } as any

      applyElectricalMeasurementDefaults(accessory, detectElectricalMeasurementClusters(accessory))

      const epm = accessory.clusters.electricalPowerMeasurement
      expect(epm.powerMode).toBe(2) // AC
      expect(epm.accuracy).toHaveLength(2) // activePower + voltage
      expect(epm.accuracy[0].measurementType).toBe(5) // ActivePower
      expect(epm.accuracy[1].measurementType).toBe(1) // Voltage
      expect(epm.numberOfMeasurementTypes).toBe(2)
    })

    it('should default activePower to null when not declared', () => {
      const accessory = {
        displayName: 'Metered Outlet',
        clusters: { electricalPowerMeasurement: { voltage: 230_000 } },
      } as any

      applyElectricalMeasurementDefaults(accessory, detectElectricalMeasurementClusters(accessory))

      expect(accessory.clusters.electricalPowerMeasurement.activePower).toBeNull()
    })

    it('should respect plugin-provided values', () => {
      const pluginAccuracy = [{ measurementType: 5, measured: false, minMeasuredValue: 0, maxMeasuredValue: 1, accuracyRanges: [{ rangeMin: 0, rangeMax: 1, fixedMax: 1 }] }]
      const accessory = {
        displayName: 'Custom Meter',
        clusters: { electricalPowerMeasurement: { activePower: 0, powerMode: 1, accuracy: pluginAccuracy, numberOfMeasurementTypes: 1 } },
      } as any

      applyElectricalMeasurementDefaults(accessory, detectElectricalMeasurementClusters(accessory))

      const epm = accessory.clusters.electricalPowerMeasurement
      expect(epm.powerMode).toBe(1)
      expect(epm.accuracy).toBe(pluginAccuracy)
      expect(epm.numberOfMeasurementTypes).toBe(1)
    })

    it('should synthesize the mandatory energy accuracy struct', () => {
      const accessory = {
        displayName: 'Metered Outlet',
        clusters: { electricalEnergyMeasurement: { cumulativeEnergyImported: { energy: 1000 } } },
      } as any

      applyElectricalMeasurementDefaults(accessory, detectElectricalMeasurementClusters(accessory))

      const eem = accessory.clusters.electricalEnergyMeasurement
      expect(eem.accuracy).toBeDefined()
      expect(eem.accuracy.measurementType).toBe(14) // ElectricalEnergy
      expect(eem.accuracy.accuracyRanges).toHaveLength(1)
    })
  })

  describe('applyElectricalMeasurementClusters', () => {
    it('should add power topology, power and energy servers to a real outlet device type', () => {
      const accessory = { displayName: 'Metered Outlet' } as any
      const detection = { hasPowerMeasurement: true, energyFeatures: ['ImportedEnergy', 'CumulativeEnergy'] }

      const result = applyElectricalMeasurementClusters(devices.OnOffPlugInUnitDevice, accessory, detection) as any

      expect(result.behaviors.powerTopology).toBeDefined()
      expect(result.behaviors.powerTopology.features.treeTopology).toBe(true)
      expect(result.behaviors.electricalPowerMeasurement).toBeDefined()
      expect(result.behaviors.electricalEnergyMeasurement).toBeDefined()
      expect(result.behaviors.electricalEnergyMeasurement.features.importedEnergy).toBe(true)
      expect(result.behaviors.electricalEnergyMeasurement.features.cumulativeEnergy).toBe(true)
      expect(result.behaviors.electricalEnergyMeasurement.features.exportedEnergy).toBe(false)
    })

    it('should return the device type unchanged when nothing was detected', () => {
      const accessory = { displayName: 'Plain Outlet' } as any
      const detection = { hasPowerMeasurement: false, energyFeatures: [] }

      const result = applyElectricalMeasurementClusters(devices.OnOffPlugInUnitDevice, accessory, detection)

      expect(result).toBe(devices.OnOffPlugInUnitDevice)
    })

    it('should not re-add behaviors the device type already carries', () => {
      const accessory = { displayName: 'Composed Meter' } as any
      const detection = { hasPowerMeasurement: true, energyFeatures: [] }

      const once = applyElectricalMeasurementClusters(devices.OnOffPlugInUnitDevice, accessory, detection) as any
      const twice = applyElectricalMeasurementClusters(once, accessory, detection) as any

      expect(twice).toBe(once)
    })
  })

  describe('applyFeaturesToBehavior', () => {
    it('should return original behavior when features is null', () => {
      const mockBehavior = { id: 'test' } as any
      const result = applyFeaturesToBehavior(mockBehavior, null, 'TestCluster')

      expect(result).toBe(mockBehavior)
    })

    it('should return original behavior when features is empty', () => {
      const mockBehavior = { id: 'test' } as any
      const result = applyFeaturesToBehavior(mockBehavior, [], 'TestCluster')

      expect(result).toBe(mockBehavior)
    })

    it('should apply features to behavior when features provided', () => {
      const extendedBehavior = { id: 'extended' } as any
      const mockBehavior = {
        id: 'test',
        with: () => extendedBehavior,
      } as any

      const result = applyFeaturesToBehavior(mockBehavior, ['Feature1', 'Feature2'], 'TestCluster')

      expect(result).toBe(extendedBehavior)
    })
  })

  describe('detectBehaviorFeatures', () => {
    it('should return null when device type has no behaviors', () => {
      const deviceType = {} as any
      const result = detectBehaviorFeatures(deviceType, 'colorControl', () => [])

      expect(result).toBeNull()
    })

    it('should return null when cluster not found in behaviors', () => {
      const deviceType = {
        behaviors: [
          { id: 'otherCluster', cluster: { id: 999 } },
        ],
      } as any

      const result = detectBehaviorFeatures(deviceType, 'colorControl', () => [])

      expect(result).toBeNull()
    })

    it('should return null when cluster has no supportedFeatures', () => {
      const deviceType = {
        behaviors: [
          { id: 'colorControl', cluster: { id: 768 } },
        ],
      } as any

      const result = detectBehaviorFeatures(deviceType, 'colorControl', () => [])

      expect(result).toBeNull()
    })

    it('should extract features using provided extractor', () => {
      const deviceType = {
        behaviors: [
          {
            id: 'colorControl',
            cluster: {
              id: 768,
              supportedFeatures: {
                hueSaturation: true,
                xy: true,
              },
            },
          },
        ],
      } as any

      const extractor = (supportedFeatures: Record<string, boolean>) => {
        const features: string[] = []
        if (supportedFeatures.hueSaturation) {
          features.push('HueSaturation')
        }
        if (supportedFeatures.xy) {
          features.push('Xy')
        }
        return features
      }

      const result = detectBehaviorFeatures(deviceType, 'colorControl', extractor)

      expect(result).toEqual(['HueSaturation', 'Xy'])
    })
  })
})
