/**
 * Cluster Behavior Map
 *
 * The one mapping from cluster names to custom Homebridge behavior classes.
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
 * It holds the clusters with commands a controller can send, which need a
 * custom behavior to call the plugin's handlers (used by server/AccessoryManager.ts).
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
