/**
 * Helper functions for MatterServer.registerAccessory()
 * Extracted from the monolithic 521-line function for better maintainability
 */

import type { EndpointType } from '@matter/main'
import type { LevelControl } from '@matter/main/clusters/level-control'
import type { Behavior } from '@matter/node'

import type { MatterAccessory } from './types.js'

import { Logger } from '../logger.js'
import {
  HomebridgeRvcCleanModeServer,
  HomebridgeServiceAreaServer,
  HomebridgeWindowCoveringServer,
} from './behaviors/index.js'
// Direct matter.js .with() API used instead of typeHelpers wrappers
import { clusters, devices, MatterDeviceError } from './types.js'

/**
 * Type representing a behavior class (constructor)
 */
type BehaviorType = Behavior.Type

const log = Logger.withPrefix('Matter/Server')

/**
 * Cluster IDs from Matter specification
 * Using Matter.js Cluster references instead of magic numbers
 */
export const CLUSTER_IDS = {
  AIR_QUALITY: clusters.AirQuality.Cluster.id,
  CARBON_MONOXIDE_CONCENTRATION: clusters.CarbonMonoxideConcentrationMeasurement.Cluster.id,
  COLOR_CONTROL: clusters.ColorControl.Cluster.id,
  DOOR_LOCK: clusters.DoorLock.Cluster.id,
  LEVEL_CONTROL: clusters.LevelControl.Cluster.id,
  NITROGEN_DIOXIDE_CONCENTRATION: clusters.NitrogenDioxideConcentrationMeasurement.Cluster.id,
  ON_OFF: clusters.OnOff.Cluster.id,
  OZONE_CONCENTRATION: clusters.OzoneConcentrationMeasurement.Cluster.id,
  PM10_CONCENTRATION: clusters.Pm10ConcentrationMeasurement.Cluster.id,
  PM25_CONCENTRATION: clusters.Pm25ConcentrationMeasurement.Cluster.id,
  THERMOSTAT: clusters.Thermostat.Cluster.id,
  WINDOW_COVERING: clusters.WindowCovering.Cluster.id,
} as const

/**
 * Behavior info extracted from device type
 */
interface BehaviorInfo {
  id: string
  cluster?: {
    id: number
    supportedFeatures?: Record<string, boolean>
  }
}

/**
 * Validates required fields on a Matter accessory
 * @throws MatterDeviceError if validation fails
 */
export function validateAccessoryRequiredFields(accessory: MatterAccessory): void {
  if (!accessory.deviceType) {
    throw new MatterDeviceError(
      `Matter accessory "${accessory.displayName || 'unknown'}" is missing required field 'deviceType'. `
      + 'Example: deviceType: api.matter!.deviceTypes.OnOffLight\n'
      + 'Available device types: OnOffLight, DimmableLight, GenericSwitch, TemperatureSensor, etc.\n'
      + 'See the Matter types documentation for the full list.',
    )
  }

  if (!accessory.UUID) {
    throw new MatterDeviceError(
      'Matter accessory is missing required field \'UUID\'.\n'
      + 'Generate a unique UUID for your accessory:\n'
      + '  const UUID = api.hap.uuid.generate(\'my-unique-id\')',
    )
  }

  if (!accessory.displayName) {
    throw new MatterDeviceError(
      `Matter accessory (${accessory.UUID}) is missing required field 'displayName'.\n`
      + 'Example: displayName: \'Living Room Light\'',
    )
  }

  if (!accessory.serialNumber) {
    throw new MatterDeviceError(
      `Matter accessory "${accessory.displayName}" is missing required field 'serialNumber'.\n`
      + 'Example: serialNumber: \'ABC123\' or serialNumber: accessory.UUID',
    )
  }

  if (!accessory.manufacturer) {
    throw new MatterDeviceError(
      `Matter accessory "${accessory.displayName}" is missing required field 'manufacturer'.\n`
      + 'Example: manufacturer: \'Homebridge\' or manufacturer: \'My Plugin Name\'',
    )
  }

  if (!accessory.model) {
    throw new MatterDeviceError(
      `Matter accessory "${accessory.displayName}" is missing required field 'model'.\n`
      + 'Example: model: \'v1.0\' or model: \'Smart Light\'',
    )
  }

  // Clusters are required unless parts are provided (for composed devices)
  if (!accessory.parts || accessory.parts.length === 0) {
    if (!accessory.clusters || typeof accessory.clusters !== 'object') {
      throw new MatterDeviceError(
        `Matter accessory "${accessory.displayName}" is missing or has invalid 'clusters' field.\n`
        + 'Clusters define the functionality of your device. Example:\n'
        + '  clusters: {\n'
        + '    onOff: { onOff: false },\n'
        + '    levelControl: { currentLevel: 0, minLevel: 0, maxLevel: 254 }\n'
        + '  }\n'
        + 'Alternatively, use "parts" array for composed devices with multiple endpoints.',
      )
    }
  }

  // Validate parts if provided
  if (accessory.parts && accessory.parts.length > 0) {
    for (const part of accessory.parts) {
      if (!part.id) {
        throw new MatterDeviceError(
          `Matter accessory "${accessory.displayName}" has a part missing required field 'id'`,
        )
      }
      if (!part.deviceType) {
        throw new MatterDeviceError(
          `Matter accessory "${accessory.displayName}" part "${part.id}" is missing required field 'deviceType'`,
        )
      }
      if (!part.clusters || typeof part.clusters !== 'object') {
        throw new MatterDeviceError(
          `Matter accessory "${accessory.displayName}" part "${part.id}" is missing or has invalid 'clusters' field`,
        )
      }
    }
  }
}

/**
 * Convert device type behaviors to array
 * Handles array, Set, object, or iterable formats
 */
function convertBehaviorsToArray(behaviors: unknown): BehaviorInfo[] {
  if (Array.isArray(behaviors)) {
    return behaviors as BehaviorInfo[]
  }

  if (typeof behaviors === 'object' && behaviors !== null) {
    const values = Object.values(behaviors)
    if (values.length > 0) {
      return values as BehaviorInfo[]
    }
  }

  try {
    return [...behaviors as Iterable<BehaviorInfo>]
  } catch {
    return []
  }
}

/**
 * Find a specific behavior by cluster ID or name
 */
function findBehaviorByCluster(behaviors: BehaviorInfo[], clusterIdOrName: number | string): BehaviorInfo | undefined {
  return behaviors.find((behavior) => {
    if (typeof clusterIdOrName === 'number') {
      return behavior.cluster?.id === clusterIdOrName
    }
    return behavior.id === clusterIdOrName
  })
}

/**
 * Generic feature detection from device type behaviors
 * Extracts supported features from a device type's cluster definition
 *
 * @param deviceType - The Matter device type
 * @param clusterIdOrName - Cluster ID (number) or name (string)
 * @param featureExtractor - Function to extract feature names from supportedFeatures
 * @returns Array of detected features or null if cluster not found
 */
export function detectBehaviorFeatures(
  deviceType: EndpointType,
  clusterIdOrName: number | string,
  featureExtractor: (supportedFeatures: Record<string, boolean>) => string[],
): string[] | null {
  const deviceTypeDef = deviceType as { behaviors?: unknown }
  const existingBehaviors = deviceTypeDef.behaviors

  if (!existingBehaviors) {
    return null
  }

  const behaviorsArray = convertBehaviorsToArray(existingBehaviors)
  const behavior = findBehaviorByCluster(behaviorsArray, clusterIdOrName)

  if (!behavior?.cluster?.supportedFeatures) {
    return null
  }

  return featureExtractor(behavior.cluster.supportedFeatures)
}

/**
 * Extract ColorControl features from supportedFeatures
 */
export function extractColorControlFeatures(supportedFeatures: Record<string, boolean>): string[] {
  const features: string[] = []

  if (supportedFeatures.hueSaturation) {
    features.push('HueSaturation')
  }
  if (supportedFeatures.xy) {
    features.push('Xy')
  }
  if (supportedFeatures.colorTemperature) {
    features.push('ColorTemperature')
  }

  return features
}

/**
 * Extract Thermostat features from supportedFeatures
 */
export function extractThermostatFeatures(supportedFeatures: Record<string, boolean>): string[] {
  const features: string[] = []

  if (supportedFeatures.heating) {
    features.push('Heating')
  }
  if (supportedFeatures.cooling) {
    features.push('Cooling')
  }
  if (supportedFeatures.occupancy) {
    features.push('Occupancy')
  }
  if (supportedFeatures.autoMode) {
    features.push('AutoMode')
  }

  return features
}

/**
 * Extract LevelControl features from supportedFeatures.
 *
 * Used to read features off a device type's declared LevelControl requirement
 * (e.g. DimmableLightDevice's `LevelControlServer.with("Lighting","OnOff")`).
 * When the device type doesn't declare LevelControl at all (e.g. PumpDevice,
 * which has LevelControl only in its `optional` requirements and not in
 * `SupportedBehaviors`), the caller should apply an empty feature set via
 * `.with()` so the Lighting feature inherited from matter.js's internal
 * `LevelControlBase = LevelControlBehavior.with(OnOff, Lighting)` is stripped
 * — otherwise the Pump endpoint inherits the `[LT]` branch of the spec
 * (minLevel constraint 1-254, initializeLighting warnings) that only applies
 * to lighting devices.
 */
export function extractLevelControlFeatures(
  supportedFeatures: Record<string, boolean>,
): LevelControl.Features[] {
  const features: LevelControl.Features[] = []

  if (supportedFeatures.onOff) {
    features.push('OnOff')
  }
  if (supportedFeatures.lighting) {
    features.push('Lighting')
  }
  if (supportedFeatures.frequency) {
    features.push('Frequency')
  }

  return features
}

/**
 * Determine ColorControl features based on handlers
 * Only includes features that have corresponding handler methods
 */
export function determineColorControlFeaturesFromHandlers(
  handlers: Record<string, unknown>,
): string[] {
  const features: string[] = []

  if ('moveToHueAndSaturationLogic' in handlers) {
    features.push('HueSaturation')
  }

  if ('moveToColorLogic' in handlers) {
    features.push('Xy')
  }

  if ('moveToColorTemperatureLogic' in handlers) {
    features.push('ColorTemperature')
  }

  return features
}

/**
 * Detect WindowCovering features from accessory attributes
 * Auto-detects Lift and Tilt capabilities based on cluster attributes
 *
 * @param accessory - Matter accessory to inspect
 * @returns Array of detected feature names
 */
export function detectWindowCoveringFeatures(accessory: MatterAccessory): string[] {
  const features: string[] = []
  const wcCluster = accessory.clusters?.windowCovering as Record<string, unknown> | undefined

  if (!wcCluster) {
    return features
  }

  // Detect lift capability
  const hasLiftAttrs = 'targetPositionLiftPercent100ths' in wcCluster
    || 'currentPositionLiftPercent100ths' in wcCluster
  const configStatus = wcCluster.configStatus as { liftPositionAware?: boolean, tiltPositionAware?: boolean } | undefined
  const hasConfigLift = configStatus?.liftPositionAware === true

  // Detect tilt capability
  const hasTiltAttrs = 'targetPositionTiltPercent100ths' in wcCluster
    || 'currentPositionTiltPercent100ths' in wcCluster
  const hasConfigTilt = configStatus?.tiltPositionAware === true

  log.debug(
    `[${accessory.displayName}] WindowCovering detection: `
    + `hasLiftAttrs=${hasLiftAttrs}, hasConfigLift=${hasConfigLift}, `
    + `hasTiltAttrs=${hasTiltAttrs}, hasConfigTilt=${hasConfigTilt}`,
  )

  if (hasLiftAttrs) {
    features.push('Lift')
    if (hasConfigLift) {
      features.push('PositionAwareLift')
    }
  }

  if (hasTiltAttrs) {
    features.push('Tilt')
    if (hasConfigTilt) {
      features.push('PositionAwareTilt')
    }
  }

  return features
}

/**
 * Detect ServiceArea features from cluster attributes
 */
export function detectServiceAreaFeatures(
  serviceAreaCluster: Record<string, unknown> | undefined,
): string[] {
  const features: string[] = []

  if (!serviceAreaCluster) {
    return features
  }

  if ('supportedMaps' in serviceAreaCluster) {
    features.push('Maps')
  }

  if ('progress' in serviceAreaCluster) {
    features.push('ProgressReporting')
  }

  return features
}

/**
 * Apply WindowCovering features to device type
 */
export function applyWindowCoveringFeatures(
  deviceType: EndpointType,
  accessory: MatterAccessory,
  features: string[],
): EndpointType {
  if (features.length === 0) {
    log.warn(`⚠️  No WindowCovering features detected for ${accessory.displayName}!`)
    return deviceType
  }

  log.info(`Auto-detected WindowCovering features for ${accessory.displayName}: ${features.join(', ')}`)

  // Add WindowCoveringServer with features to the device type
  const windowCoveringWithFeatures = (HomebridgeWindowCoveringServer as any).with(...features)
  const modifiedDeviceType = (deviceType as any).with(windowCoveringWithFeatures)

  const hasTiltFeatures = features.includes('Tilt')
  if (hasTiltFeatures && accessory.clusters) {
    const wcCluster = accessory.clusters.windowCovering as Record<string, unknown>
    wcCluster.type = 8 // TiltBlindLift
    log.debug('Set WindowCovering type to 8 (TiltBlindLift) for tilt-capable device')
  }

  if (!accessory.context) {
    accessory.context = {}
  }
  (accessory.context as Record<string, unknown>)._skipWindowCoveringBehavior = true

  return modifiedDeviceType
}

/**
 * Build custom behaviors for RoboticVacuumCleaner devices
 */
export function buildRvcCustomBehaviors(
  accessory: MatterAccessory,
  serviceAreaFeatures: string[] | null,
): BehaviorType[] {
  const customBehaviors: BehaviorType[] = []
  const { RvcCleanModeServer, ServiceAreaServer } = devices.RoboticVacuumCleanerRequirements

  if (accessory.clusters?.rvcCleanMode) {
    if (accessory.handlers?.rvcCleanMode) {
      customBehaviors.push(HomebridgeRvcCleanModeServer)
      log.info('Adding custom RvcCleanMode behavior with handlers')
    } else {
      customBehaviors.push(RvcCleanModeServer)
      log.info('Adding base RvcCleanMode server')
    }
  }

  if (accessory.clusters?.serviceArea) {
    let behaviorClass: BehaviorType = accessory.handlers?.serviceArea
      ? HomebridgeServiceAreaServer
      : ServiceAreaServer

    if (serviceAreaFeatures && serviceAreaFeatures.length > 0) {
      behaviorClass = (behaviorClass as any).with(...serviceAreaFeatures)
      log.info(`ServiceArea ${accessory.handlers?.serviceArea ? 'custom behavior' : 'base server'} will have features: ${serviceAreaFeatures.join(', ')}`)
    }

    customBehaviors.push(behaviorClass)
  }

  return customBehaviors
}

/**
 * Apply detected features to a behavior class
 */
export function applyFeaturesToBehavior(
  behaviorClass: BehaviorType,
  features: string[] | null,
  clusterName: string,
): BehaviorType {
  if (!features || features.length === 0) {
    return behaviorClass
  }

  const modifiedBehavior = (behaviorClass as any).with(...features)
  log.info(`${clusterName} custom behavior will preserve features: ${features.join(', ')}`)
  return modifiedBehavior
}
