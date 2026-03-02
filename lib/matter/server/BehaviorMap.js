"use strict";
/**
 * Cluster Behavior Map
 *
 * Single authoritative mapping from cluster names to custom Homebridge behavior classes.
 * Consolidates the duplicate maps that existed in server.ts and serverHelpers.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FULL_CLUSTER_BEHAVIOR_MAP = exports.CORE_CLUSTER_BEHAVIOR_MAP = void 0;
const index_js_1 = require("../behaviors/index.js");
/**
 * Maps cluster names to custom Homebridge behavior classes.
 *
 * The "core" map contains only clusters with user-triggered commands that need
 * custom behaviors (used by server.ts for the CLUSTER_BEHAVIOR_MAP).
 *
 * The "full" map adds sensor/measurement clusters that don't have user commands
 * but still need custom behaviors for state management.
 */
exports.CORE_CLUSTER_BEHAVIOR_MAP = {
    // Core controls
    onOff: index_js_1.HomebridgeOnOffServer,
    levelControl: index_js_1.HomebridgeLevelControlServer,
    colorControl: index_js_1.HomebridgeColorControlServer,
    // Coverings & locks
    windowCovering: index_js_1.HomebridgeWindowCoveringServer,
    doorLock: index_js_1.HomebridgeDoorLockServer,
    // Climate control
    fanControl: index_js_1.HomebridgeFanControlServer,
    thermostat: index_js_1.HomebridgeThermostatServer,
    // Robotic vacuum cleaners
    rvcOperationalState: index_js_1.HomebridgeRvcOperationalStateServer,
    rvcRunMode: index_js_1.HomebridgeRvcRunModeServer,
    rvcCleanMode: index_js_1.HomebridgeRvcCleanModeServer,
    serviceArea: index_js_1.HomebridgeServiceAreaServer,
    // Identification
    identify: index_js_1.HomebridgeIdentifyServer,
};
/**
 * Full cluster behavior map including sensor/measurement behaviors.
 * Used by serverHelpers.ts for behavior resolution.
 */
exports.FULL_CLUSTER_BEHAVIOR_MAP = {
    ...exports.CORE_CLUSTER_BEHAVIOR_MAP,
    // Air quality & concentration measurement sensors
    airQuality: index_js_1.HomebridgeAirQualityServer,
    carbonMonoxideConcentrationMeasurement: index_js_1.HomebridgeCarbonMonoxideConcentrationMeasurementServer,
    nitrogenDioxideConcentrationMeasurement: index_js_1.HomebridgeNitrogenDioxideConcentrationMeasurementServer,
    ozoneConcentrationMeasurement: index_js_1.HomebridgeOzoneConcentrationMeasurementServer,
    pm10ConcentrationMeasurement: index_js_1.HomebridgePm10ConcentrationMeasurementServer,
    pm25ConcentrationMeasurement: index_js_1.HomebridgePm25ConcentrationMeasurementServer,
};
//# sourceMappingURL=BehaviorMap.js.map