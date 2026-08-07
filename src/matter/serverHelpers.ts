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
  CLOSURE_CONTROL: clusters.ClosureControl.Cluster.id,
  COLOR_CONTROL: clusters.ColorControl.Cluster.id,
  DOOR_LOCK: clusters.DoorLock.Cluster.id,
  KEYPAD_INPUT: clusters.KeypadInput.Cluster.id,
  LEVEL_CONTROL: clusters.LevelControl.Cluster.id,
  MEDIA_PLAYBACK: clusters.MediaPlayback.Cluster.id,
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
  /**
   * Features of a composed behavior, as recorded by matter.js's `.with(...)`.
   * This is where the feature flags actually live for the clusters inspected
   * here; `cluster.supportedFeatures` stays undefined for them.
   */
  features?: Record<string, boolean>
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
        + '    levelControl: { currentLevel: 1, minLevel: 1, maxLevel: 254 }\n'
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

  // matter.js records a composed behavior's features on the behavior itself.
  // `cluster.supportedFeatures` is only populated for clusters that declare it,
  // which none of the ones we inspect here do — so relying on it alone meant
  // this always returned null and every caller fell back to its "no features"
  // path. Read the behavior's own features when the cluster does not carry them.
  const supportedFeatures = behavior?.cluster?.supportedFeatures ?? behavior?.features

  if (!supportedFeatures) {
    return null
  }

  return featureExtractor(supportedFeatures)
}

/**
 * Extract whatever features a behavior already declares, whatever the cluster.
 *
 * matter.js records a composed behavior's features as camelCase booleans and
 * `.with(...)` takes the PascalCase names, so carrying a feature set across is
 * just a capitalise - the same mapping the per-cluster extractors below do by
 * hand (`hueSaturation` to `HueSaturation`, `xy` to `Xy`).
 *
 * Used for clusters whose features we have no reason to reason about. We only
 * need them preserved when a Homebridge behavior replaces the base one, and a
 * hand-written list would silently drop any feature matter.js adds later.
 */
export function extractDeclaredFeatures(supportedFeatures: Record<string, boolean>): string[] {
  return Object.entries(supportedFeatures)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1))
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
 * Detect SmokeCoAlarm features from accessory attributes.
 * The Matter spec requires at least one of SmokeAlarm/CoAlarm, so an accessory
 * that declares neither state attribute falls back to SmokeAlarm — matching the
 * friendly device type name "SmokeSensor".
 */
export function detectSmokeCoAlarmFeatures(accessory: MatterAccessory): string[] {
  const scaCluster = accessory.clusters?.smokeCoAlarm as Record<string, unknown> | undefined
  const features: string[] = []

  if (scaCluster && 'smokeState' in scaCluster) {
    features.push('SmokeAlarm')
  }
  if (scaCluster && 'coState' in scaCluster) {
    features.push('CoAlarm')
  }
  if (features.length === 0) {
    features.push('SmokeAlarm')
  }

  return features
}

/**
 * Apply SmokeCoAlarm features to device type.
 * SmokeCoAlarm is not part of the base SmokeCoAlarmDevice — matter.js requires
 * the features to be chosen — so without this the endpoint would be created
 * without the cluster and the accessory's smokeCoAlarm state silently dropped.
 */
export function applySmokeCoAlarmFeatures(
  deviceType: EndpointType,
  accessory: MatterAccessory,
  features: string[],
): EndpointType {
  log.info(`Auto-detected SmokeCoAlarm features for ${accessory.displayName}: ${features.join(', ')}`)

  const smokeCoAlarmWithFeatures = (devices.SmokeCoAlarmRequirements.SmokeCoAlarmServer as any).with(...features)
  return (deviceType as any).with(smokeCoAlarmWithFeatures)
}

/**
 * Raise a LevelControl floor of 0 to 1 when the Lighting feature is active.
 *
 * The Lighting feature reserves level 0 for "off", so the spec constrains
 * MinLevel to 1-254 and matter.js rejects 0 outright. Homebridge's own guidance
 * has suggested `minLevel: 0`, so accessories in the wild carry it. Lift those
 * to 1 with a warning rather than refusing to register the accessory.
 */
export function applyLevelControlLightingFloor(
  accessory: MatterAccessory,
  levelControlFeatures: string[] | null,
): void {
  if (!levelControlFeatures?.includes('Lighting')) {
    return
  }

  const levelControl = accessory.clusters?.levelControl as Record<string, unknown> | undefined
  if (!levelControl) {
    return
  }

  for (const attribute of ['minLevel', 'currentLevel'] as const) {
    const value = levelControl[attribute]
    if (typeof value === 'number' && value < 1) {
      log.warn(
        `${accessory.displayName} declares levelControl.${attribute} of ${value}, but the Lighting `
        + 'feature reserves level 0 - using 1 instead.',
      )
      levelControl[attribute] = 1
    }
  }
}

/**
 * Detect Thermostat features from accessory attributes.
 *
 * A thermostat that only heats should not advertise cooling, so the features
 * follow the setpoints the accessory actually declares. The Matter spec requires
 * at least one of Heating/Cooling, so an accessory declaring neither falls back
 * to Heating. AutoMode is only meaningful when the device can do both, and
 * Occupancy only when the unoccupied setpoints are present.
 */
export function detectThermostatFeatures(accessory: MatterAccessory): string[] {
  const thermostatCluster = accessory.clusters?.thermostat as Record<string, unknown> | undefined
  const has = (attribute: string): boolean => thermostatCluster !== undefined && attribute in thermostatCluster
  const features: string[] = []

  if (has('occupiedHeatingSetpoint') || has('unoccupiedHeatingSetpoint')) {
    features.push('Heating')
  }
  if (has('occupiedCoolingSetpoint') || has('unoccupiedCoolingSetpoint')) {
    features.push('Cooling')
  }
  if (features.length === 0) {
    features.push('Heating')
  }
  if (features.includes('Heating') && features.includes('Cooling')) {
    features.push('AutoMode')
  }
  if (has('unoccupiedHeatingSetpoint') || has('unoccupiedCoolingSetpoint')) {
    features.push('Occupancy')
  }

  return features
}

/**
 * The spec's absolute setpoint bounds, in 0.01°C. matter.js falls back to these
 * when an accessory declares no abs*SetpointLimit of its own.
 */
const THERMOSTAT_ABS_LIMITS = {
  Heat: { min: 700, max: 3000 },
  Cool: { min: 1600, max: 3200 },
} as const

/**
 * Check that an AutoMode thermostat's setpoint LIMITS can satisfy its deadband.
 *
 * ⚠️ The deadband applies to the limits, not only to the setpoints. matter.js
 * requires both of these, in 0.01°C:
 *   maxCoolSetpointLimit - maxHeatSetpointLimit >= deadband
 *   minCoolSetpointLimit - minHeatSetpointLimit >= deadband
 *
 * `minSetpointDeadBand` is declared in 0.1°C, so it is multiplied by 10 first.
 *
 * This is easy to get wrong and the symptom is badly disconnected from the
 * cause: the endpoint is created happily, then EVERY later setpoint update
 * fails with "Thermostat setpoints could not be reconciled within the
 * configured limits". matter.js 0.17.6 only validated the attribute being
 * written, so an impossible configuration went unnoticed until 0.17.7 began
 * validating the whole cluster. Warning here points at the real problem.
 *
 * Returns a message describing the problem, or undefined when the limits are
 * satisfiable.
 */
export function checkThermostatSetpointLimits(
  accessory: MatterAccessory,
  features: string[],
): string | undefined {
  if (!features.includes('AutoMode')) {
    return undefined
  }

  const cluster = accessory.clusters?.thermostat as Record<string, number | undefined> | undefined
  if (!cluster) {
    return undefined
  }

  // matter.js treats an undeclared deadband as 2.0°C, and replaces anything
  // above the legal 0..127 with the same value.
  const declared = cluster.minSetpointDeadBand
  const deadBand = (declared === undefined || declared > 127 ? 20 : declared) * 10

  // An unset user limit does NOT fall back to the spec default - it falls back
  // to the accessory's own absolute limit for that mode, and only then to the
  // spec default. matter.js does exactly this (`#userLimit` reads
  // `min|maxXSetpointLimit ?? absMin|absMaxXSetpointLimit`), so a thermostat
  // that widens only its absolute range would otherwise be measured against
  // bounds it never declared - and warned about, or cleared, wrongly.
  const limit = (scope: 'Heat' | 'Cool', bound: 'min' | 'max'): number =>
    cluster[`${bound}${scope}SetpointLimit`]
    ?? cluster[`abs${bound === 'min' ? 'Min' : 'Max'}${scope}SetpointLimit`]
    ?? THERMOSTAT_ABS_LIMITS[scope][bound]

  const problems: string[] = []
  for (const bound of ['max', 'min'] as const) {
    const cool = limit('Cool', bound)
    const heat = limit('Heat', bound)
    if (cool - heat < deadBand) {
      problems.push(
        `${bound}CoolSetpointLimit (${cool}) - ${bound}HeatSetpointLimit (${heat}) = ${cool - heat}, `
        + `which is less than the ${deadBand} deadband`,
      )
    }
  }

  if (problems.length === 0) {
    return undefined
  }

  return `${accessory.displayName} declares a thermostat with Auto mode whose setpoint limits cannot satisfy its `
    + `minSetpointDeadBand of ${deadBand / 10} (${deadBand} in setpoint units): ${problems.join('; ')}. `
    + 'Every setpoint update will be rejected until this is corrected - either lower minSetpointDeadBand, '
    + 'or widen the gap between the heating and cooling limits.'
}

/**
 * Apply Thermostat features to device type.
 * Thermostat is not part of the base ThermostatDevice — matter.js requires the
 * features to be chosen — so without this the endpoint would be created without
 * the cluster and the accessory's thermostat state silently dropped.
 */
export function applyThermostatFeatures(
  deviceType: EndpointType,
  accessory: MatterAccessory,
  features: string[],
): EndpointType {
  log.info(`Auto-detected Thermostat features for ${accessory.displayName}: ${features.join(', ')}`)

  const limitProblem = checkThermostatSetpointLimits(accessory, features)
  if (limitProblem) {
    log.warn(limitProblem)
  }

  const thermostatWithFeatures = (devices.ThermostatRequirements.ThermostatServer as any).with(...features)
  return (deviceType as any).with(thermostatWithFeatures)
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

/**
 * Matter MeasurementType enum values (Matter spec, MeasurementTypeEnum) used
 * when synthesizing accuracy entries. Defined locally to avoid importing the
 * full @matter/main/types barrel.
 */
const MEASUREMENT_TYPE = {
  Voltage: 1,
  ActiveCurrent: 2,
  ActivePower: 5,
  ElectricalEnergy: 14,
} as const

/**
 * The subset of an accessory (or composed-device part) the electrical
 * measurement helpers need - lets the same detection run for both.
 */
export interface ElectricalMeasurementHost {
  clusters?: MatterAccessory['clusters']
  displayName?: string
}

/**
 * Result of detecting electrical measurement clusters on an accessory
 */
export interface ElectricalMeasurementDetection {
  /** Accessory declares electricalPowerMeasurement cluster state */
  hasPowerMeasurement: boolean
  /**
   * ElectricalEnergyMeasurement features derived from the declared attributes
   * (empty when the cluster is not declared)
   */
  energyFeatures: string[]
}

/**
 * Detect electrical measurement clusters from the accessory's declared state.
 *
 * ElectricalEnergyMeasurement is feature-gated in matter.js (Imported/Exported
 * x Cumulative/Periodic), so the features are chosen from which energy
 * attributes the accessory declares.
 */
export function detectElectricalMeasurementClusters(accessory: ElectricalMeasurementHost): ElectricalMeasurementDetection {
  const epmCluster = accessory.clusters?.electricalPowerMeasurement as Record<string, unknown> | undefined
  const eemCluster = accessory.clusters?.electricalEnergyMeasurement as Record<string, unknown> | undefined

  const energyFeatures: string[] = []
  if (eemCluster) {
    if ('cumulativeEnergyImported' in eemCluster || 'periodicEnergyImported' in eemCluster) {
      energyFeatures.push('ImportedEnergy')
    }
    if ('cumulativeEnergyExported' in eemCluster || 'periodicEnergyExported' in eemCluster) {
      energyFeatures.push('ExportedEnergy')
    }
    if ('cumulativeEnergyImported' in eemCluster || 'cumulativeEnergyExported' in eemCluster) {
      energyFeatures.push('CumulativeEnergy')
    }
    if ('periodicEnergyImported' in eemCluster || 'periodicEnergyExported' in eemCluster) {
      energyFeatures.push('PeriodicEnergy')
    }
    if (energyFeatures.length === 0) {
      // Cluster declared but no recognizable energy attribute yet - assume the
      // most common shape (a meter reporting total imported energy).
      energyFeatures.push('ImportedEnergy', 'CumulativeEnergy')
    }
  }

  return {
    hasPowerMeasurement: epmCluster !== undefined,
    energyFeatures,
  }
}

/**
 * Build one synthesized MeasurementAccuracyStruct. The bounds are generous
 * defaults - accuracy is informational metadata for controllers, and plugins
 * can declare their own `accuracy` to override the synthesized list.
 */
function makeAccuracyEntry(measurementType: number, min: number, max: number, fixedMax: number): Record<string, unknown> {
  return {
    measurementType,
    measured: true,
    minMeasuredValue: min,
    maxMeasuredValue: max,
    accuracyRanges: [{ rangeMin: min, rangeMax: max, fixedMax }],
  }
}

/**
 * Fill in the mandatory ElectricalPowerMeasurement / ElectricalEnergyMeasurement
 * attributes (powerMode, numberOfMeasurementTypes, accuracy) that plugins should
 * not have to write themselves. Mutates the accessory's declared cluster state
 * so the values flow into the endpoint options and the state cache together.
 */
export function applyElectricalMeasurementDefaults(
  accessory: ElectricalMeasurementHost,
  detection: ElectricalMeasurementDetection,
): void {
  if (detection.hasPowerMeasurement) {
    const epm = accessory.clusters!.electricalPowerMeasurement as Record<string, unknown>

    // 2 = AC (PowerModeEnum). Mains-powered metering is by far the common case.
    epm.powerMode = epm.powerMode ?? 2
    // ActivePower is mandatory (nullable) - null means "no measurement yet".
    if (!('activePower' in epm)) {
      epm.activePower = null
    }

    if (!epm.accuracy) {
      const accuracy: Record<string, unknown>[] = [
        // +/-100 kW range, +/-1 W accuracy
        makeAccuracyEntry(MEASUREMENT_TYPE.ActivePower, -100_000_000, 100_000_000, 1000),
      ]
      if ('voltage' in epm) {
        // 0-500 V range, +/-1 V accuracy
        accuracy.push(makeAccuracyEntry(MEASUREMENT_TYPE.Voltage, 0, 500_000, 1000))
      }
      if ('activeCurrent' in epm) {
        // +/-500 A range, +/-0.1 A accuracy
        accuracy.push(makeAccuracyEntry(MEASUREMENT_TYPE.ActiveCurrent, -500_000, 500_000, 100))
      }
      epm.accuracy = accuracy
    }

    epm.numberOfMeasurementTypes = epm.numberOfMeasurementTypes
      ?? (epm.accuracy as unknown[]).length
  }

  if (detection.energyFeatures.length > 0) {
    const eem = accessory.clusters!.electricalEnergyMeasurement as Record<string, unknown>

    if (!eem.accuracy) {
      // 0 - 1e15 mWh (a billion kWh), +/-1 Wh accuracy
      eem.accuracy = makeAccuracyEntry(MEASUREMENT_TYPE.ElectricalEnergy, 0, 1_000_000_000_000_000, 1000)
    }
  }
}

/**
 * Apply the electrical measurement behaviors to a device type.
 *
 * PowerTopology is mandatory on the ElectricalSensor device type and is
 * feature-gated in matter.js; TreeTopology fits a bridged endpoint that
 * measures itself. The EEM server keeps matter.js's setMeasurement() helper,
 * which also emits the CumulativeEnergyMeasured / PeriodicEnergyMeasured
 * events required by the spec.
 */
export function applyElectricalMeasurementClusters(
  deviceType: EndpointType,
  accessory: ElectricalMeasurementHost,
  detection: ElectricalMeasurementDetection,
): EndpointType {
  if (!detection.hasPowerMeasurement && detection.energyFeatures.length === 0) {
    return deviceType
  }

  const requirements = devices.ElectricalSensorRequirements
  const behaviors: BehaviorType[] = []
  const existing = (deviceType as { behaviors?: Record<string, unknown> }).behaviors ?? {}

  if (!existing.powerTopology) {
    behaviors.push((requirements.PowerTopologyServer as any).with('TreeTopology'))
  }
  if (detection.hasPowerMeasurement && !existing.electricalPowerMeasurement) {
    // The EPM cluster's feature conformance requires at least one of
    // DirectCurrent/AlternatingCurrent. Follow the accessory's powerMode
    // (already resolved by applyElectricalMeasurementDefaults: plugin value
    // or the AC default): 1 = DC, everything else measures mains.
    const powerMode = (accessory.clusters?.electricalPowerMeasurement as Record<string, unknown> | undefined)?.powerMode
    const currentFeature = powerMode === 1 ? 'DirectCurrent' : 'AlternatingCurrent'
    behaviors.push((requirements.ElectricalPowerMeasurementServer as any).with(currentFeature))
  }
  if (detection.energyFeatures.length > 0 && !existing.electricalEnergyMeasurement) {
    behaviors.push((requirements.ElectricalEnergyMeasurementServer as any).with(...detection.energyFeatures))
  }

  if (behaviors.length === 0) {
    return deviceType
  }

  const detected = [
    detection.hasPowerMeasurement ? 'power' : undefined,
    detection.energyFeatures.length > 0 ? `energy (${detection.energyFeatures.join(', ')})` : undefined,
  ].filter(Boolean).join(' + ')
  log.info(`Auto-detected electrical measurement for ${accessory.displayName}: ${detected}`)

  return (deviceType as any).with(...behaviors)
}
