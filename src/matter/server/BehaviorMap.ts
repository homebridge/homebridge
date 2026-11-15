/**
 * Cluster Behavior Map
 *
 * Single authoritative mapping from cluster names to custom Homebridge behavior classes.
 * Consolidates the duplicate maps that existed in server.ts and serverHelpers.ts.
 */

import type { Behavior } from '@matter/main'

import {
  HomebridgeClosureControlServer,
  HomebridgeColorControlServer,
  HomebridgeDeviceEnergyManagementModeServer,
  HomebridgeDeviceEnergyManagementServer,
  HomebridgeDoorLockServer,
  HomebridgeEnergyEvseModeServer,
  HomebridgeEnergyEvseServer,
  HomebridgeFanControlServer,
  HomebridgeIdentifyServer,
  HomebridgeKeypadInputServer,
  HomebridgeLevelControlServer,
  HomebridgeMediaPlaybackServer,
  HomebridgeOnOffServer,
  HomebridgeRvcCleanModeServer,
  HomebridgeRvcOperationalStateServer,
  HomebridgeRvcRunModeServer,
  HomebridgeServiceAreaServer,
  HomebridgeThermostatServer,
  HomebridgeValveConfigurationAndControlServer,
  HomebridgeWaterHeaterManagementServer,
  HomebridgeWaterHeaterModeServer,
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

  // Coverings, closures & locks
  windowCovering: HomebridgeWindowCoveringServer,
  closureControl: HomebridgeClosureControlServer,
  doorLock: HomebridgeDoorLockServer,

  // Media players & speakers
  mediaPlayback: HomebridgeMediaPlaybackServer,
  keypadInput: HomebridgeKeypadInputServer,

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

  // Water heater
  waterHeaterMode: HomebridgeWaterHeaterModeServer,
  waterHeaterManagement: HomebridgeWaterHeaterManagementServer,

  // Energy management and EV chargers
  deviceEnergyManagement: HomebridgeDeviceEnergyManagementServer,
  deviceEnergyManagementMode: HomebridgeDeviceEnergyManagementModeServer,
  energyEvse: HomebridgeEnergyEvseServer,
  energyEvseMode: HomebridgeEnergyEvseModeServer,
} as const
