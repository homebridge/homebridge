/**
 * Cluster Behavior Map
 *
 * Single authoritative mapping from cluster names to custom Homebridge behavior classes.
 * Consolidates the duplicate maps that existed in server.ts and serverHelpers.ts.
 */

import type { Behavior } from '@matter/node'

import {
  HomebridgeAirQualityServer,
  HomebridgeCarbonMonoxideConcentrationMeasurementServer,
  HomebridgeColorControlServer,
  HomebridgeDoorLockServer,
  HomebridgeFanControlServer,
  HomebridgeIdentifyServer,
  HomebridgeLevelControlServer,
  HomebridgeNitrogenDioxideConcentrationMeasurementServer,
  HomebridgeOnOffServer,
  HomebridgeOzoneConcentrationMeasurementServer,
  HomebridgePm10ConcentrationMeasurementServer,
  HomebridgePm25ConcentrationMeasurementServer,
  HomebridgeRvcCleanModeServer,
  HomebridgeRvcOperationalStateServer,
  HomebridgeRvcRunModeServer,
  HomebridgeServiceAreaServer,
  HomebridgeThermostatServer,
  HomebridgeValveConfigurationAndControlServer,
  HomebridgeWindowCoveringServer,
} from '../behaviors/index.js'

type BehaviorType = Behavior.Type

/**
 * Maps cluster names to custom Homebridge behavior classes.
 *
 * The "core" map contains only clusters with user-triggered commands that need
 * custom behaviors (used by server.ts for the CLUSTER_BEHAVIOR_MAP).
 *
 * The "full" map adds sensor/measurement clusters that don't have user commands
 * but still need custom behaviors for state management.
 */
export const CORE_CLUSTER_BEHAVIOR_MAP: Record<string, BehaviorType> = {
  // Core controls
  onOff: HomebridgeOnOffServer,
  levelControl: HomebridgeLevelControlServer,
  colorControl: HomebridgeColorControlServer,

  // Coverings & locks
  windowCovering: HomebridgeWindowCoveringServer,
  doorLock: HomebridgeDoorLockServer,

  // Climate control
  fanControl: HomebridgeFanControlServer,
  thermostat: HomebridgeThermostatServer,

  // Robotic vacuum cleaners
  rvcOperationalState: HomebridgeRvcOperationalStateServer,
  rvcRunMode: HomebridgeRvcRunModeServer,
  rvcCleanMode: HomebridgeRvcCleanModeServer,
  serviceArea: HomebridgeServiceAreaServer,

  // Identification
  identify: HomebridgeIdentifyServer,

  // Valve
  valveConfigurationAndControl: HomebridgeValveConfigurationAndControlServer,
} as const

/**
 * Full cluster behavior map including sensor/measurement behaviors.
 * Used by serverHelpers.ts for behavior resolution.
 */
export const FULL_CLUSTER_BEHAVIOR_MAP: Record<string, BehaviorType> = {
  ...CORE_CLUSTER_BEHAVIOR_MAP,

  // Air quality & concentration measurement sensors
  airQuality: HomebridgeAirQualityServer,
  carbonMonoxideConcentrationMeasurement: HomebridgeCarbonMonoxideConcentrationMeasurementServer,
  nitrogenDioxideConcentrationMeasurement: HomebridgeNitrogenDioxideConcentrationMeasurementServer,
  ozoneConcentrationMeasurement: HomebridgeOzoneConcentrationMeasurementServer,
  pm10ConcentrationMeasurement: HomebridgePm10ConcentrationMeasurementServer,
  pm25ConcentrationMeasurement: HomebridgePm25ConcentrationMeasurementServer,
} as const
