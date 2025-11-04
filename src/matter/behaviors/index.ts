/**
 * Matter Behaviors Index
 *
 * Exports all behavior classes and the registry
 */

// Export registry
export { BehaviorRegistry } from './BehaviorRegistry.js'
export type { MatterAccessoryMap, MatterCommandHandler } from './BehaviorRegistry.js'

export { HomebridgeAirQualityServer } from './AirQualityBehavior.js'
export type { MatterAccessoryMap, MatterCommandHandler } from './BehaviorRegistry.js'
export { BehaviorRegistry } from './BehaviorRegistry.js'
export { HomebridgeColorControlServer } from './ColorControlBehavior.js'
export { HomebridgeDoorLockServer } from './DoorLockBehavior.js'
export { HomebridgeFanControlServer } from './FanControlBehavior.js'
export { HomebridgeIdentifyServer } from './IdentifyBehavior.js'
export { HomebridgeLevelControlServer } from './LevelControlBehavior.js'
export { HomebridgeOnOffServer } from './OnOffBehavior.js'
export { HomebridgeRvcCleanModeServer } from './RvcCleanModeBehavior.js'
export { HomebridgeRvcOperationalStateServer } from './RvcOperationalStateBehavior.js'
export { HomebridgeRvcRunModeServer } from './RvcRunModeBehavior.js'
export { HomebridgeServiceAreaServer } from './ServiceAreaBehavior.js'
export { HomebridgeThermostatServer } from './ThermostatBehavior.js'
export { HomebridgeWindowCoveringServer } from './WindowCoveringBehavior.js'
