"use strict";
/**
 * Accessory Manager
 *
 * Handles registering/unregistering accessories, building custom behaviors,
 * detecting cluster features, creating endpoint options, creating accessory parts,
 * and restoring cached state.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessoryManager = void 0;
const node_events_1 = require("node:events");
const node_process_1 = __importDefault(require("node:process"));
const main_1 = require("@matter/main");
const behaviors_1 = require("@matter/main/behaviors");
const behaviors_2 = require("@matter/node/behaviors");
const logger_js_1 = require("../../logger.js");
const EndpointContext_js_1 = require("../behaviors/EndpointContext.js");
const index_js_1 = require("../behaviors/index.js");
const serverHelpers_js_1 = require("../serverHelpers.js");
const types_js_1 = require("../types.js");
const BehaviorMap_js_1 = require("./BehaviorMap.js");
const log = logger_js_1.Logger.withPrefix('Matter/Server');
class AccessoryManager {
    /**
     * Register a single Matter accessory
     * The first two arguments are unused, but kept to keep consistency with the HAP accessory registration function signature.
     */
    async registerAccessory(_pluginIdentifier, _platformName, accessory, deps) {
        const serverNode = deps.getServerNode();
        const aggregator = deps.getAggregator();
        if (!serverNode || (!deps.config.externalAccessory && !aggregator)) {
            throw new types_js_1.MatterDeviceError('Matter server not started');
        }
        (0, serverHelpers_js_1.validateAccessoryRequiredFields)(accessory);
        if (deps.accessories.has(accessory.UUID)) {
            const existing = deps.accessories.get(accessory.UUID);
            throw new types_js_1.MatterDeviceError(`Matter accessory with UUID "${accessory.UUID}" is already registered.\n`
                + `Existing accessory: "${existing?.displayName}"\n`
                + `New accessory: "${accessory.displayName}"\n`
                + 'Each accessory must have a unique UUID. Use api.hap.uuid.generate() with a unique string.');
        }
        this.restoreCachedState(accessory, deps.accessoryCache);
        if (deps.accessories.size >= 1000) {
            throw new types_js_1.MatterDeviceError(`Cannot register Matter accessory "${accessory.displayName}": `
                + 'Maximum device limit reached (1000 devices).\n'
                + `Current registered devices: ${deps.accessories.size}`);
        }
        try {
            let deviceType = accessory.deviceType;
            const windowCoveringFeatures = (0, serverHelpers_js_1.detectWindowCoveringFeatures)(accessory);
            if (windowCoveringFeatures.length > 0) {
                deviceType = (0, serverHelpers_js_1.applyWindowCoveringFeatures)(deviceType, accessory, windowCoveringFeatures);
            }
            const features = this.detectClusterFeatures(accessory, deviceType);
            const customBehaviors = await this.buildCustomBehaviors(accessory, deviceType, features);
            if (customBehaviors.length > 0) {
                deviceType = deviceType.with(...customBehaviors);
                log.info(`Applied ${customBehaviors.length} custom behavior(s) to device type`);
            }
            if (!deps.config.externalAccessory) {
                deviceType = deviceType.with(behaviors_1.BridgedDeviceBasicInformationServer);
                log.debug(`Added BridgedDeviceBasicInformationServer to ${accessory.displayName}`);
            }
            const endpointOptions = this.createEndpointOptions(accessory, deps.config);
            const endpoint = new main_1.Endpoint(deviceType, endpointOptions);
            (0, EndpointContext_js_1.setRegistryManager)(endpoint, deps.registryManager);
            if (deps.config.debugModeEnabled) {
                log.debug(`Created endpoint for ${accessory.displayName} with initial cluster states`);
            }
            if (deps.config.externalAccessory) {
                await serverNode.add(endpoint);
                log.debug(`Added ${accessory.displayName} as external accessory to ServerNode`);
            }
            else {
                await aggregator.add(endpoint);
                if (deps.config.debugModeEnabled) {
                    log.debug(`Added endpoint for ${accessory.displayName} to aggregator`);
                }
            }
            this.registerAccessoryHandlers(accessory, deps);
            const internalParts = await this.createAccessoryParts(accessory, deps);
            await this.finalizeAccessoryRegistration(accessory, endpoint, internalParts, deps);
        }
        catch (error) {
            log.error(`Failed to register Matter accessory ${accessory.displayName}:`, error);
            throw new types_js_1.MatterDeviceError(`Failed to register accessory: ${error}`);
        }
    }
    /**
     * Unregister a Matter accessory
     */
    async unregisterAccessory(uuid, deps) {
        const accessory = deps.accessories.get(uuid);
        if (!accessory) {
            log.debug(`Accessory ${uuid} not found or not registered`);
            if (deps.accessoryCache && deps.accessoryCache.getCached(uuid)) {
                log.debug(`Removing ${uuid} from cache`);
                deps.accessoryCache.removeCached(uuid);
                deps.accessoryCache.requestSave(deps.accessories);
            }
            return;
        }
        try {
            if (accessory.endpoint && deps.getAggregator()) {
                await accessory.endpoint.close();
                log.debug(`Removed endpoint for ${accessory.displayName}`);
            }
            deps.accessories.delete(uuid);
            log.info(`Unregistered Matter accessory: ${accessory.displayName} (${uuid})`);
            await this.notifyPartsListChanged(deps);
            if (deps.accessoryCache) {
                deps.accessoryCache.removeCached(uuid);
                deps.accessoryCache.requestSave(deps.accessories);
            }
            if (deps.getMonitoringEnabled() && node_process_1.default.send) {
                const event = {
                    type: 'accessoryRemoved',
                    data: { uuid },
                };
                node_process_1.default.send({
                    id: "matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */,
                    data: event,
                });
            }
        }
        catch (error) {
            log.error(`Failed to unregister Matter accessory ${uuid}:`, error);
            throw new types_js_1.MatterDeviceError(`Failed to unregister accessory: ${error}`);
        }
    }
    /**
     * Restore cached state for an accessory
     */
    restoreCachedState(accessory, accessoryCache) {
        if (accessoryCache && accessoryCache.hasCached(accessory.UUID)) {
            const cached = accessoryCache.getCached(accessory.UUID);
            if (cached?.clusters && accessory.clusters) {
                for (const [clusterName, cachedAttrs] of Object.entries(cached.clusters)) {
                    if (!accessory.clusters[clusterName]) {
                        accessory.clusters[clusterName] = cachedAttrs;
                    }
                    else {
                        accessory.clusters[clusterName] = {
                            ...accessory.clusters[clusterName],
                            ...cachedAttrs,
                        };
                    }
                }
                if (cached.context) {
                    accessory.context = cached.context;
                }
                log.info(`Restored cached state for Matter accessory: ${accessory.displayName}`);
            }
        }
    }
    /**
     * Detect cluster features for an accessory
     */
    detectClusterFeatures(accessory, deviceType) {
        const windowCoveringFeatures = (0, serverHelpers_js_1.detectWindowCoveringFeatures)(accessory);
        let serviceAreaFeatures = null;
        if (accessory.clusters?.serviceArea) {
            const features = [];
            if (accessory.clusters.serviceArea.supportedMaps) {
                features.push('Maps');
            }
            if (accessory.clusters.serviceArea.progress !== undefined) {
                features.push('ProgressReporting');
            }
            if (features.length > 0) {
                serviceAreaFeatures = features;
                log.info(`ServiceArea features will be enabled for ${accessory.displayName}: ${features.join(', ')}`);
            }
        }
        let colorControlFeatures = null;
        if (accessory.handlers?.colorControl) {
            colorControlFeatures = (0, serverHelpers_js_1.detectBehaviorFeatures)(deviceType, serverHelpers_js_1.CLUSTER_IDS.COLOR_CONTROL, serverHelpers_js_1.extractColorControlFeatures);
            if (colorControlFeatures) {
                colorControlFeatures = (0, serverHelpers_js_1.determineColorControlFeaturesFromHandlers)(accessory.handlers.colorControl);
            }
        }
        let thermostatFeatures = null;
        if (accessory.handlers?.thermostat) {
            thermostatFeatures = (0, serverHelpers_js_1.detectBehaviorFeatures)(deviceType, serverHelpers_js_1.CLUSTER_IDS.THERMOSTAT, serverHelpers_js_1.extractThermostatFeatures);
        }
        return {
            windowCoveringFeatures,
            serviceAreaFeatures,
            colorControlFeatures,
            thermostatFeatures,
        };
    }
    /**
     * Build custom behaviors for an accessory based on handlers
     */
    async buildCustomBehaviors(accessory, deviceType, features) {
        const customBehaviors = [];
        if (!accessory.handlers) {
            return customBehaviors;
        }
        log.debug(`[${accessory.displayName}] Has handlers: ${Object.keys(accessory.handlers).join(', ')}`);
        // Handle RoboticVacuumCleaner optional clusters
        if (deviceType.deviceType === types_js_1.devices.RoboticVacuumCleanerDevice.deviceType) {
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
                if (accessory.handlers?.serviceArea) {
                    let behaviorClass = index_js_1.HomebridgeServiceAreaServer;
                    if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
                        behaviorClass = behaviorClass.with(...features.serviceAreaFeatures);
                        log.info(`ServiceArea custom behavior will have features: ${features.serviceAreaFeatures.join(', ')}`);
                    }
                    customBehaviors.push(behaviorClass);
                    log.info('Adding custom ServiceArea behavior with handlers');
                }
                else {
                    let behaviorClass = ServiceAreaServer;
                    if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
                        behaviorClass = behaviorClass.with(...features.serviceAreaFeatures);
                        log.info(`ServiceArea base server will have features: ${features.serviceAreaFeatures.join(', ')}`);
                    }
                    customBehaviors.push(behaviorClass);
                    log.info('Adding base ServiceArea server');
                }
            }
            if (accessory.clusters?.powerSource) {
                const hasBattery = accessory.clusters.powerSource.batPercentRemaining !== undefined
                    || accessory.clusters.powerSource.batChargeLevel !== undefined;
                let powerSourceBehavior = behaviors_2.PowerSourceServer;
                if (hasBattery) {
                    powerSourceBehavior = behaviors_2.PowerSourceServer.with('Battery');
                    log.debug('Adding PowerSource server with battery feature');
                }
                else {
                    log.debug('Adding base PowerSource server');
                }
                customBehaviors.push(powerSourceBehavior);
            }
        }
        for (const clusterName of Object.keys(accessory.handlers || {})) {
            const skipWindowCoveringBehavior = accessory.context?._skipWindowCoveringBehavior;
            if (clusterName === 'windowCovering' && skipWindowCoveringBehavior) {
                log.debug('Skipping custom WindowCovering behavior (using base server with features instead)');
                continue;
            }
            if (clusterName === 'rvcCleanMode' || clusterName === 'serviceArea' || clusterName === 'powerSource') {
                continue;
            }
            let behaviorClass = BehaviorMap_js_1.CORE_CLUSTER_BEHAVIOR_MAP[clusterName];
            if (clusterName === 'colorControl' && behaviorClass && features.colorControlFeatures && features.colorControlFeatures.length > 0) {
                behaviorClass = behaviorClass.with(...features.colorControlFeatures);
                log.info(`ColorControl custom behavior will preserve features: ${features.colorControlFeatures.join(', ')}`);
            }
            if (clusterName === 'thermostat' && behaviorClass && features.thermostatFeatures && features.thermostatFeatures.length > 0) {
                behaviorClass = behaviorClass.with(...features.thermostatFeatures);
                log.info(`Thermostat custom behavior will preserve features: ${features.thermostatFeatures.join(', ')}`);
            }
            if (clusterName === 'serviceArea' && behaviorClass && features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
                behaviorClass = behaviorClass.with(...features.serviceAreaFeatures);
                log.info(`ServiceArea custom behavior will preserve features: ${features.serviceAreaFeatures.join(', ')}`);
            }
            if (clusterName === 'windowCovering') {
                log.debug(`WindowCovering handler found: behaviorClass=${!!behaviorClass}, windowCoveringFeatures=${features.windowCoveringFeatures}, length=${features.windowCoveringFeatures?.length}`);
                if (behaviorClass && features.windowCoveringFeatures && features.windowCoveringFeatures.length > 0) {
                    behaviorClass = behaviorClass.with(...features.windowCoveringFeatures);
                    log.debug(`WindowCovering custom behavior will have features: ${features.windowCoveringFeatures.join(', ')}`);
                }
                else {
                    log.debug(`Skipping WindowCovering feature application: behaviorClass=${!!behaviorClass}, features=${features.windowCoveringFeatures}`);
                }
            }
            if (behaviorClass) {
                customBehaviors.push(behaviorClass);
                log.info(`Will use ${behaviorClass.name} for ${accessory.displayName}`);
            }
            else {
                log.warn(`No custom behavior class available for cluster '${clusterName}' - handlers will be registered but may not be called`);
            }
        }
        return customBehaviors;
    }
    /**
     * Create endpoint options for an accessory
     */
    createEndpointOptions(accessory, config) {
        const endpointOptions = {
            id: accessory.UUID,
            ...accessory.clusters,
        };
        if (!config.externalAccessory) {
            endpointOptions.bridgedDeviceBasicInformation = {
                vendorName: accessory.manufacturer,
                nodeLabel: accessory.displayName,
                productName: accessory.model,
                productLabel: accessory.displayName,
                serialNumber: accessory.serialNumber,
                reachable: true,
            };
        }
        return endpointOptions;
    }
    /**
     * Register command handlers for an accessory
     */
    registerAccessoryHandlers(accessory, deps) {
        if (!accessory.handlers) {
            return;
        }
        log.info(`Setting up handlers for accessory ${accessory.UUID}`);
        deps.registryManager.registerEndpoint(accessory.UUID, deps.behaviorRegistry);
        for (const [clusterName, handlers] of Object.entries(accessory.handlers)) {
            log.info(`  Processing cluster: ${clusterName}`);
            for (const [commandName, handler] of Object.entries(handlers)) {
                deps.behaviorRegistry.registerHandler(accessory.UUID, clusterName, commandName, handler);
            }
        }
    }
    /**
     * Create and register child endpoints (parts) for an accessory
     */
    async createAccessoryParts(accessory, deps) {
        const internalParts = [];
        if (!accessory.parts || accessory.parts.length === 0) {
            return internalParts;
        }
        log.info(`Creating ${accessory.parts.length} child endpoint(s) for ${accessory.displayName}`);
        for (const part of accessory.parts) {
            const partEndpointId = `${accessory.UUID}-part-${part.id}`;
            deps.behaviorRegistry.registerPartEndpoint(partEndpointId, accessory.UUID, part.id);
            let partDeviceType = part.deviceType;
            const partCustomBehaviors = [];
            if (part.handlers) {
                for (const clusterName of Object.keys(part.handlers)) {
                    const behaviorClass = BehaviorMap_js_1.CORE_CLUSTER_BEHAVIOR_MAP[clusterName];
                    if (behaviorClass) {
                        partCustomBehaviors.push(behaviorClass);
                        log.info(`  Will use ${behaviorClass.name} for part ${part.id}`);
                    }
                    else {
                        log.warn(`No custom behavior class available for cluster '${clusterName}' on part ${part.id}`);
                    }
                }
                if (partCustomBehaviors.length > 0) {
                    partDeviceType = partDeviceType.with(...partCustomBehaviors);
                    log.info(`  Applied ${partCustomBehaviors.length} custom behavior(s) to part ${part.id}`);
                }
            }
            if (!deps.config.externalAccessory) {
                partDeviceType = partDeviceType.with(behaviors_1.BridgedDeviceBasicInformationServer);
            }
            const partEndpointOptions = {
                id: partEndpointId,
                ...part.clusters,
            };
            if (!deps.config.externalAccessory) {
                partEndpointOptions.bridgedDeviceBasicInformation = {
                    vendorName: accessory.manufacturer,
                    nodeLabel: part.displayName || `${accessory.displayName} - ${part.id}`,
                    productName: accessory.model,
                    productLabel: part.displayName || part.id,
                    serialNumber: `${accessory.serialNumber}-${part.id}`,
                    reachable: true,
                };
            }
            const partEndpoint = new main_1.Endpoint(partDeviceType, partEndpointOptions);
            (0, EndpointContext_js_1.setRegistryManager)(partEndpoint, deps.registryManager);
            const serverNode = deps.getServerNode();
            const aggregator = deps.getAggregator();
            if (deps.config.externalAccessory) {
                await serverNode.add(partEndpoint);
            }
            else {
                await aggregator.add(partEndpoint);
            }
            log.info(`  Created part endpoint: ${part.displayName || part.id} (${partEndpointId})`);
            if (part.handlers) {
                deps.registryManager.registerEndpoint(partEndpointId, deps.behaviorRegistry);
                for (const [clusterName, handlers] of Object.entries(part.handlers)) {
                    for (const [commandName, handler] of Object.entries(handlers)) {
                        deps.behaviorRegistry.registerHandler(partEndpointId, clusterName, commandName, handler);
                    }
                }
                log.debug(`  Registered ${Object.keys(part.handlers).length} handler(s) for part ${part.id}`);
            }
            internalParts.push({
                ...part,
                endpoint: partEndpoint,
            });
        }
        return internalParts;
    }
    /**
     * Finalize accessory registration (store, emit events, save cache)
     */
    async finalizeAccessoryRegistration(accessory, endpoint, internalParts, deps) {
        const internalAccessory = {
            ...accessory,
            endpoint,
            registered: true,
            _parts: internalParts.length > 0 ? internalParts : undefined,
            _eventEmitter: new node_events_1.EventEmitter(),
        };
        deps.accessories.set(accessory.UUID, internalAccessory);
        log.info(`Registered Matter accessory: ${accessory.displayName} (${accessory.UUID})`);
        if (deps.config.debugModeEnabled) {
            log.debug(`Total registered accessories: ${deps.accessories.size}/1000`);
        }
        await this.notifyPartsListChanged(deps);
        if (deps.accessoryCache) {
            deps.accessoryCache.requestSave(deps.accessories);
        }
        if (deps.getMonitoringEnabled() && node_process_1.default.send) {
            const event = {
                type: 'accessoryAdded',
                data: { uuid: accessory.UUID },
            };
            node_process_1.default.send({
                id: "matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */,
                data: event,
            });
        }
    }
    /**
     * Notify controllers that the parts list has changed
     */
    async notifyPartsListChanged(deps) {
        const aggregator = deps.getAggregator();
        if (!aggregator || !deps.isCommissioned()) {
            return;
        }
        try {
            const aggregatorState = aggregator;
            if (aggregatorState.state?.descriptor) {
                const partsList = aggregatorState.state.descriptor.partsList || [];
                if (deps.config.debugModeEnabled) {
                    log.debug(`Parts list changed: ${partsList.length} devices (endpoints: ${partsList.join(', ')})`);
                }
                await aggregator.set({
                    descriptor: {
                        partsList,
                    },
                });
                log.info(`Notified controllers of parts list change (${deps.accessories.size} devices)`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn(`Failed to notify controllers of parts list change: ${errorMessage}`);
        }
    }
}
exports.AccessoryManager = AccessoryManager;
//# sourceMappingURL=AccessoryManager.js.map