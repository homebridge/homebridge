"use strict";
/**
 * Helper functions for MatterServer.registerAccessory()
 * Extracted from the monolithic 521-line function for better maintainability
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLUSTER_IDS = void 0;
exports.validateAccessoryRequiredFields = validateAccessoryRequiredFields;
exports.detectBehaviorFeatures = detectBehaviorFeatures;
exports.extractColorControlFeatures = extractColorControlFeatures;
exports.extractThermostatFeatures = extractThermostatFeatures;
exports.determineColorControlFeaturesFromHandlers = determineColorControlFeaturesFromHandlers;
exports.detectWindowCoveringFeatures = detectWindowCoveringFeatures;
exports.detectServiceAreaFeatures = detectServiceAreaFeatures;
exports.applyWindowCoveringFeatures = applyWindowCoveringFeatures;
exports.buildRvcCustomBehaviors = buildRvcCustomBehaviors;
exports.applyFeaturesToBehavior = applyFeaturesToBehavior;
const logger_js_1 = require("../logger.js");
const index_js_1 = require("./behaviors/index.js");
// Direct matter.js .with() API used instead of typeHelpers wrappers
const types_js_1 = require("./types.js");
const log = logger_js_1.Logger.withPrefix('Matter/Server');
/**
 * Cluster IDs from Matter specification
 * Using Matter.js Cluster references instead of magic numbers
 */
exports.CLUSTER_IDS = {
    AIR_QUALITY: types_js_1.clusters.AirQuality.Cluster.id,
    CARBON_MONOXIDE_CONCENTRATION: types_js_1.clusters.CarbonMonoxideConcentrationMeasurement.Cluster.id,
    COLOR_CONTROL: types_js_1.clusters.ColorControl.Cluster.id,
    DOOR_LOCK: types_js_1.clusters.DoorLock.Cluster.id,
    LEVEL_CONTROL: types_js_1.clusters.LevelControl.Cluster.id,
    NITROGEN_DIOXIDE_CONCENTRATION: types_js_1.clusters.NitrogenDioxideConcentrationMeasurement.Cluster.id,
    ON_OFF: types_js_1.clusters.OnOff.Cluster.id,
    OZONE_CONCENTRATION: types_js_1.clusters.OzoneConcentrationMeasurement.Cluster.id,
    PM10_CONCENTRATION: types_js_1.clusters.Pm10ConcentrationMeasurement.Cluster.id,
    PM25_CONCENTRATION: types_js_1.clusters.Pm25ConcentrationMeasurement.Cluster.id,
    THERMOSTAT: types_js_1.clusters.Thermostat.Cluster.id,
    WINDOW_COVERING: types_js_1.clusters.WindowCovering.Cluster.id,
};
/**
 * Validates required fields on a Matter accessory
 * @throws MatterDeviceError if validation fails
 */
function validateAccessoryRequiredFields(accessory) {
    if (!accessory.deviceType) {
        throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName || 'unknown'}" is missing required field 'deviceType'. `
            + 'Example: deviceType: api.matter.deviceTypes.OnOffLight\n'
            + 'Available device types: OnOffLight, DimmableLight, TemperatureSensor, etc.\n'
            + 'See the Matter types documentation for the full list.');
    }
    if (!accessory.UUID) {
        throw new types_js_1.MatterDeviceError('Matter accessory is missing required field \'UUID\'.\n'
            + 'Generate a unique UUID for your accessory:\n'
            + '  const UUID = api.matter.uuid.generate(\'my-unique-id\')');
    }
    if (!accessory.displayName) {
        throw new types_js_1.MatterDeviceError(`Matter accessory (${accessory.UUID}) is missing required field 'displayName'.\n`
            + 'Example: displayName: \'Living Room Light\'');
    }
    if (!accessory.serialNumber) {
        throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName}" is missing required field 'serialNumber'.\n`
            + 'Example: serialNumber: \'ABC123\' or serialNumber: accessory.UUID');
    }
    if (!accessory.manufacturer) {
        throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName}" is missing required field 'manufacturer'.\n`
            + 'Example: manufacturer: \'Homebridge\' or manufacturer: \'My Plugin Name\'');
    }
    if (!accessory.model) {
        throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName}" is missing required field 'model'.\n`
            + 'Example: model: \'v1.0\' or model: \'Smart Light\'');
    }
    // Clusters are required unless parts are provided (for composed devices)
    if (!accessory.parts || accessory.parts.length === 0) {
        if (!accessory.clusters || typeof accessory.clusters !== 'object') {
            throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName}" is missing or has invalid 'clusters' field.\n`
                + 'Clusters define the functionality of your device. Example:\n'
                + '  clusters: {\n'
                + '    onOff: { onOff: false },\n'
                + '    levelControl: { currentLevel: 0, minLevel: 0, maxLevel: 254 }\n'
                + '  }\n'
                + 'Alternatively, use "parts" array for composed devices with multiple endpoints.');
        }
    }
    // Validate parts if provided
    if (accessory.parts && accessory.parts.length > 0) {
        for (const part of accessory.parts) {
            if (!part.id) {
                throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName}" has a part missing required field 'id'`);
            }
            if (!part.deviceType) {
                throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName}" part "${part.id}" is missing required field 'deviceType'`);
            }
            if (!part.clusters || typeof part.clusters !== 'object') {
                throw new types_js_1.MatterDeviceError(`Matter accessory "${accessory.displayName}" part "${part.id}" is missing or has invalid 'clusters' field`);
            }
        }
    }
}
/**
 * Convert device type behaviors to array
 * Handles array, Set, object, or iterable formats
 */
function convertBehaviorsToArray(behaviors) {
    if (Array.isArray(behaviors)) {
        return behaviors;
    }
    if (typeof behaviors === 'object' && behaviors !== null) {
        const values = Object.values(behaviors);
        if (values.length > 0) {
            return values;
        }
    }
    try {
        return Array.from(behaviors);
    }
    catch {
        return [];
    }
}
/**
 * Find a specific behavior by cluster ID or name
 */
function findBehaviorByCluster(behaviors, clusterIdOrName) {
    return behaviors.find((behavior) => {
        if (typeof clusterIdOrName === 'number') {
            return behavior.cluster?.id === clusterIdOrName;
        }
        return behavior.id === clusterIdOrName;
    });
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
function detectBehaviorFeatures(deviceType, clusterIdOrName, featureExtractor) {
    const deviceTypeDef = deviceType;
    const existingBehaviors = deviceTypeDef.behaviors;
    if (!existingBehaviors) {
        return null;
    }
    const behaviorsArray = convertBehaviorsToArray(existingBehaviors);
    const behavior = findBehaviorByCluster(behaviorsArray, clusterIdOrName);
    if (!behavior?.cluster?.supportedFeatures) {
        return null;
    }
    return featureExtractor(behavior.cluster.supportedFeatures);
}
/**
 * Extract ColorControl features from supportedFeatures
 */
function extractColorControlFeatures(supportedFeatures) {
    const features = [];
    if (supportedFeatures.hueSaturation) {
        features.push('HueSaturation');
    }
    if (supportedFeatures.xy) {
        features.push('Xy');
    }
    if (supportedFeatures.colorTemperature) {
        features.push('ColorTemperature');
    }
    return features;
}
/**
 * Extract Thermostat features from supportedFeatures
 */
function extractThermostatFeatures(supportedFeatures) {
    const features = [];
    if (supportedFeatures.heating) {
        features.push('Heating');
    }
    if (supportedFeatures.cooling) {
        features.push('Cooling');
    }
    if (supportedFeatures.occupancy) {
        features.push('Occupancy');
    }
    if (supportedFeatures.autoMode) {
        features.push('AutoMode');
    }
    return features;
}
/**
 * Determine ColorControl features based on handlers
 * Only includes features that have corresponding handler methods
 */
function determineColorControlFeaturesFromHandlers(handlers) {
    const features = [];
    if ('moveToHueAndSaturationLogic' in handlers) {
        features.push('HueSaturation');
    }
    if ('moveToColorLogic' in handlers) {
        features.push('Xy');
    }
    if ('moveToColorTemperatureLogic' in handlers) {
        features.push('ColorTemperature');
    }
    return features;
}
/**
 * Detect WindowCovering features from accessory attributes
 * Auto-detects Lift and Tilt capabilities based on cluster attributes
 *
 * @param accessory - Matter accessory to inspect
 * @returns Array of detected feature names
 */
function detectWindowCoveringFeatures(accessory) {
    const features = [];
    const wcCluster = accessory.clusters?.windowCovering;
    if (!wcCluster) {
        return features;
    }
    // Detect lift capability
    const hasLiftAttrs = 'targetPositionLiftPercent100ths' in wcCluster
        || 'currentPositionLiftPercent100ths' in wcCluster;
    const configStatus = wcCluster.configStatus;
    const hasConfigLift = configStatus?.liftPositionAware === true;
    // Detect tilt capability
    const hasTiltAttrs = 'targetPositionTiltPercent100ths' in wcCluster
        || 'currentPositionTiltPercent100ths' in wcCluster;
    const hasConfigTilt = configStatus?.tiltPositionAware === true;
    log.debug(`[${accessory.displayName}] WindowCovering detection: `
        + `hasLiftAttrs=${hasLiftAttrs}, hasConfigLift=${hasConfigLift}, `
        + `hasTiltAttrs=${hasTiltAttrs}, hasConfigTilt=${hasConfigTilt}`);
    if (hasLiftAttrs) {
        features.push('Lift');
        if (hasConfigLift) {
            features.push('PositionAwareLift');
        }
    }
    if (hasTiltAttrs) {
        features.push('Tilt');
        if (hasConfigTilt) {
            features.push('PositionAwareTilt');
        }
    }
    return features;
}
/**
 * Detect ServiceArea features from cluster attributes
 */
function detectServiceAreaFeatures(serviceAreaCluster) {
    const features = [];
    if (!serviceAreaCluster) {
        return features;
    }
    if ('supportedMaps' in serviceAreaCluster) {
        features.push('Maps');
    }
    if ('progress' in serviceAreaCluster) {
        features.push('ProgressReporting');
    }
    return features;
}
/**
 * Apply WindowCovering features to device type
 */
function applyWindowCoveringFeatures(deviceType, accessory, features) {
    if (features.length === 0) {
        log.warn(`⚠️  No WindowCovering features detected for ${accessory.displayName}!`);
        return deviceType;
    }
    log.info(`Auto-detected WindowCovering features for ${accessory.displayName}: ${features.join(', ')}`);
    // Add WindowCoveringServer with features to the device type
    const windowCoveringWithFeatures = index_js_1.HomebridgeWindowCoveringServer.with(...features);
    const modifiedDeviceType = deviceType.with(windowCoveringWithFeatures);
    const hasTiltFeatures = features.includes('Tilt');
    if (hasTiltFeatures && accessory.clusters) {
        const wcCluster = accessory.clusters.windowCovering;
        wcCluster.type = 8; // TiltBlindLift
        log.debug('Set WindowCovering type to 8 (TiltBlindLift) for tilt-capable device');
    }
    if (!accessory.context) {
        accessory.context = {};
    }
    accessory.context._skipWindowCoveringBehavior = true;
    return modifiedDeviceType;
}
/**
 * Build custom behaviors for RoboticVacuumCleaner devices
 */
function buildRvcCustomBehaviors(accessory, serviceAreaFeatures) {
    const customBehaviors = [];
    const { RvcCleanModeServer, ServiceAreaServer } = types_js_1.devices.RoboticVacuumCleanerRequirements;
    if (accessory.clusters?.rvcCleanMode) {
        if (accessory.handlers?.rvcCleanMode) {
            customBehaviors.push(index_js_1.HomebridgeRvcCleanModeServer);
            log.info('Adding custom RvcCleanMode behavior with handlers');
        }
        else {
            customBehaviors.push(RvcCleanModeServer);
            log.info('Adding base RvcCleanMode server');
        }
    }
    if (accessory.clusters?.serviceArea) {
        let behaviorClass = accessory.handlers?.serviceArea
            ? index_js_1.HomebridgeServiceAreaServer
            : ServiceAreaServer;
        if (serviceAreaFeatures && serviceAreaFeatures.length > 0) {
            behaviorClass = behaviorClass.with(...serviceAreaFeatures);
            log.info(`ServiceArea ${accessory.handlers?.serviceArea ? 'custom behavior' : 'base server'} will have features: ${serviceAreaFeatures.join(', ')}`);
        }
        customBehaviors.push(behaviorClass);
    }
    return customBehaviors;
}
/**
 * Apply detected features to a behavior class
 */
function applyFeaturesToBehavior(behaviorClass, features, clusterName) {
    if (!features || features.length === 0) {
        return behaviorClass;
    }
    const modifiedBehavior = behaviorClass.with(...features);
    log.info(`${clusterName} custom behavior will preserve features: ${features.join(', ')}`);
    return modifiedBehavior;
}
//# sourceMappingURL=serverHelpers.js.map