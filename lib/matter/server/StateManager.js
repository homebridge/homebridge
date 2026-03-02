"use strict";
/**
 * State Manager
 *
 * Handles accessory state updates, state retrieval, command triggering,
 * and state change notifications.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
const logger_js_1 = require("../../logger.js");
const types_js_1 = require("../types.js");
const log = logger_js_1.Logger.withPrefix('Matter/Server');
class StateManager {
    accessories;
    emitter;
    getMonitoringEnabled;
    constructor(accessories, emitter, getMonitoringEnabled) {
        this.accessories = accessories;
        this.emitter = emitter;
        this.getMonitoringEnabled = getMonitoringEnabled;
    }
    /**
     * Update the state of a Matter accessory (Plugin API)
     */
    async updateAccessoryState(uuid, cluster, attributes, partId) {
        const accessory = this.accessories.get(uuid);
        if (!accessory) {
            throw new types_js_1.MatterDeviceError(`Accessory ${uuid} not found or not registered`);
        }
        let targetEndpoint;
        let targetClusters;
        let displayName;
        if (partId) {
            const part = accessory._parts?.find(p => p.id === partId);
            if (!part || !part.endpoint) {
                throw new types_js_1.MatterDeviceError(`Part ${partId} not found in accessory ${uuid}`);
            }
            targetEndpoint = part.endpoint;
            targetClusters = part.clusters;
            displayName = part.displayName || `${accessory.displayName} - ${partId}`;
        }
        else {
            if (!accessory.endpoint) {
                throw new types_js_1.MatterDeviceError(`Accessory ${uuid} not registered or missing endpoint`);
            }
            targetEndpoint = accessory.endpoint;
            targetClusters = accessory.clusters;
            displayName = accessory.displayName;
        }
        // Defer the update to avoid "read-only transaction" errors when called from handlers
        return new Promise((resolve, reject) => {
            setImmediate(async () => {
                try {
                    const updateObject = { [cluster]: attributes };
                    await targetEndpoint.set(updateObject);
                    // Update cached clusters object for persistence
                    if (!targetClusters) {
                        log.warn(`Target clusters undefined for ${displayName}, cannot cache state`);
                    }
                    else {
                        if (!targetClusters[cluster]) {
                            targetClusters[cluster] = {};
                        }
                        targetClusters[cluster] = {
                            ...targetClusters[cluster],
                            ...attributes,
                        };
                    }
                    const partInfo = partId ? ` (part: ${partId})` : '';
                    log.debug(`Updated ${cluster} state for ${displayName}${partInfo}:`, attributes);
                    this.notifyStateChange(uuid, cluster, attributes, partId);
                    resolve();
                }
                catch (error) {
                    const partInfo = partId ? ` part ${partId}` : '';
                    log.error(`Failed to update state for accessory ${uuid}${partInfo}:`, error);
                    reject(new types_js_1.MatterDeviceError(`Failed to update accessory state: ${error}`));
                }
            });
        });
    }
    /**
     * Get a Matter accessory's current state
     */
    getAccessoryState(uuid, cluster, partId) {
        const accessory = this.accessories.get(uuid);
        if (!accessory) {
            log.debug(`Accessory ${uuid} not found`);
            return undefined;
        }
        let targetEndpoint;
        let displayName;
        if (partId) {
            const part = accessory._parts?.find(p => p.id === partId);
            if (!part || !part.endpoint) {
                log.debug(`Part ${partId} not found in accessory ${uuid}`);
                return undefined;
            }
            targetEndpoint = part.endpoint;
            displayName = part.displayName || `${accessory.displayName} - ${partId}`;
        }
        else {
            if (!accessory.endpoint) {
                log.debug(`Accessory ${uuid} not registered or missing endpoint`);
                return undefined;
            }
            targetEndpoint = accessory.endpoint;
            displayName = accessory.displayName;
        }
        try {
            if (!targetEndpoint.state) {
                log.debug(`endpoint.state is undefined for ${displayName}`);
                return undefined;
            }
            if (!targetEndpoint.state[cluster]) {
                const availableClusters = Object.keys(targetEndpoint.state || {});
                log.debug(`Cluster '${cluster}' not found on ${displayName}. Available: ${availableClusters.join(', ')}`);
                return undefined;
            }
            const clusterState = targetEndpoint.state[cluster];
            const result = {};
            const allKeys = new Set([
                ...Object.keys(clusterState),
                ...Object.getOwnPropertyNames(clusterState),
            ]);
            for (const key of allKeys) {
                try {
                    if (key.startsWith('_') || key.startsWith('$')) {
                        continue;
                    }
                    const value = clusterState[key];
                    if (typeof value === 'function' || value === undefined) {
                        continue;
                    }
                    result[key] = value;
                }
                catch (propError) {
                    log.debug(`Could not read property ${key} from ${cluster}:`, propError);
                }
            }
            if (Object.keys(result).length === 0) {
                log.debug(`Cluster ${cluster} found but no readable properties on accessory ${accessory.displayName}`);
                return undefined;
            }
            return result;
        }
        catch (error) {
            log.error(`Failed to get state for accessory ${uuid}:`, error);
            return undefined;
        }
    }
    /**
     * Trigger a command on a Matter accessory
     */
    async triggerCommand(uuid, cluster, command, args, partId) {
        const accessory = this.accessories.get(uuid);
        if (!accessory) {
            throw new types_js_1.MatterDeviceError(`Accessory ${uuid} not found or not registered`);
        }
        let targetEndpoint;
        let displayName;
        if (partId) {
            const part = accessory._parts?.find(p => p.id === partId);
            if (!part || !part.endpoint) {
                throw new types_js_1.MatterDeviceError(`Part ${partId} not found in accessory ${uuid}`);
            }
            targetEndpoint = part.endpoint;
            displayName = part.displayName || `${accessory.displayName} - ${partId}`;
        }
        else {
            if (!accessory.endpoint) {
                throw new types_js_1.MatterDeviceError(`Accessory ${uuid} not registered or missing endpoint`);
            }
            targetEndpoint = accessory.endpoint;
            displayName = accessory.displayName;
        }
        try {
            const partInfo = partId ? ` (part: ${partId})` : '';
            log.debug(`Triggering command ${cluster}.${command} for ${displayName}${partInfo}`, args);
            await targetEndpoint.act((agent) => {
                const clusterBehavior = agent[cluster];
                if (!clusterBehavior) {
                    throw new Error(`Cluster '${cluster}' not found on endpoint`);
                }
                if (typeof clusterBehavior[command] !== 'function') {
                    throw new TypeError(`Command '${command}' not found on cluster '${cluster}'`);
                }
                if (args && Object.keys(args).length > 0) {
                    return clusterBehavior[command](args);
                }
                else {
                    return clusterBehavior[command]();
                }
            });
            log.debug(`Command ${cluster}.${command} succeeded for ${displayName}${partInfo}`);
        }
        catch (error) {
            const partInfo = partId ? ` part ${partId}` : '';
            log.error(`Failed to trigger command for accessory ${uuid}${partInfo}:`, error);
            throw new types_js_1.MatterDeviceError(`Failed to trigger command: ${error}`);
        }
    }
    /**
     * Notify that an accessory's state has changed
     */
    notifyStateChange(uuid, cluster, state, partId) {
        if (!this.getMonitoringEnabled()) {
            return;
        }
        this.emitter.emit('stateChange', { uuid, cluster, state, partId });
    }
}
exports.StateManager = StateManager;
//# sourceMappingURL=StateManager.js.map