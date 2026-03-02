"use strict";
/**
 * Child Bridge Matter Message Handler
 *
 * Handles Matter-related message processing for child bridges.
 * Extracted from childBridgeFork.ts to minimize changes to core files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildBridgeMatterMessageHandler = void 0;
const logger_js_1 = require("../logger.js");
const log = logger_js_1.Logger.withPrefix('Matter/ChildMessageHandler');
/**
 * Matter message handler for child bridge processes
 * Provides methods to handle Matter-specific requests from the parent process
 */
class ChildBridgeMatterMessageHandler {
    matterManager;
    bridgeUsername;
    sendMessage;
    constructor(matterManager, bridgeUsername, sendMessage) {
        this.matterManager = matterManager;
        this.bridgeUsername = bridgeUsername;
        this.sendMessage = sendMessage;
    }
    /**
     * Handle start Matter monitoring request from parent process
     */
    handleStartMatterMonitoring() {
        if (this.matterManager?.isMatterEnabled()) {
            this.matterManager.enableStateMonitoring();
        }
    }
    /**
     * Handle stop Matter monitoring request from parent process
     */
    handleStopMatterMonitoring() {
        if (this.matterManager?.isMatterEnabled()) {
            this.matterManager.disableStateMonitoring();
        }
    }
    /**
     * Handle get Matter accessories request from parent process
     */
    handleGetMatterAccessories(data) {
        log.debug(`handleGetMatterAccessories called for bridge ${this.bridgeUsername}`);
        const correlationId = data?.correlationId;
        try {
            // Only collect accessories if Matter is actually enabled for this bridge
            if (!this.matterManager?.isMatterEnabled()) {
                log.debug('Matter not enabled, returning empty accessories list');
                // Return empty accessories list for bridges without Matter
                const event = {
                    type: 'accessoriesData',
                    correlationId,
                    data: {
                        bridgeUsername: this.bridgeUsername,
                        accessories: [],
                    },
                };
                this.sendMessage('matterEvent', event);
                return;
            }
            const accessories = this.matterManager.collectAllAccessories();
            log.debug(`Collected ${accessories.length} accessories from child bridge`);
            const event = {
                type: 'accessoriesData',
                correlationId,
                data: {
                    bridgeUsername: this.bridgeUsername,
                    accessories,
                },
            };
            this.sendMessage('matterEvent', event);
        }
        catch (error) {
            log.error('Failed to get Matter accessories:', error);
            const event = {
                type: 'accessoriesData',
                correlationId,
                data: {
                    bridgeUsername: this.bridgeUsername,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            };
            this.sendMessage('matterEvent', event);
        }
    }
    /**
     * Handle get Matter accessory info request from parent process
     */
    handleGetMatterAccessoryInfo(data) {
        const correlationId = data?.correlationId;
        try {
            // Only process if Matter is enabled for this bridge
            if (!this.matterManager?.isMatterEnabled()) {
                // Don't send a response - let parent handle timeout or try other bridges
                return;
            }
            const accessoryInfo = this.matterManager.getAccessoryInfo(data.uuid);
            if (accessoryInfo) {
                const event = {
                    type: 'accessoryInfoData',
                    correlationId,
                    data: accessoryInfo,
                };
                this.sendMessage('matterEvent', event);
            }
            // If not found, don't send a response - let parent handle timeout
        }
        catch (error) {
            log.error('Failed to get Matter accessory info:', error);
            const event = {
                type: 'accessoryInfoData',
                correlationId,
                data: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            };
            this.sendMessage('matterEvent', event);
        }
    }
    /**
     * Handle Matter accessory control request from parent process
     */
    handleMatterAccessoryControl(data) {
        const correlationId = data?.correlationId;
        // Only process if Matter is enabled for this bridge
        if (!this.matterManager?.isMatterEnabled()) {
            // Silently ignore - this bridge doesn't have Matter enabled
            log.debug(`Ignoring Matter control for ${data.uuid} - Matter not enabled on child bridge ${this.bridgeUsername}`);
            return;
        }
        log.debug(`Matter control request for child bridge ${this.bridgeUsername}: uuid=${data.uuid}, cluster=${data.cluster}, part=${data.partId || 'main'}`);
        this.matterManager.handleTriggerCommand(data.uuid, data.cluster, data.attributes, data.partId)
            .then(() => {
            log.debug(`Successfully controlled accessory ${data.uuid} on child bridge ${this.bridgeUsername}`);
            // Send control response
            const controlResponse = {
                type: 'accessoryControlResponse',
                correlationId,
                data: {
                    success: true,
                    uuid: data.uuid,
                },
            };
            this.sendMessage('matterEvent', controlResponse);
        })
            .catch((error) => {
            // Silently ignore if this bridge doesn't have the accessory
            if (error.message.includes('not found on this bridge')) {
                log.debug(`Accessory ${data.uuid} not on child bridge ${this.bridgeUsername}, ignoring`);
                return;
            }
            log.error(`Failed to control ${data.uuid} on child bridge ${this.bridgeUsername}: ${error.message}`);
            const event = {
                type: 'accessoryControlResponse',
                correlationId,
                data: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    uuid: data.uuid,
                },
            };
            this.sendMessage('matterEvent', event);
        });
    }
}
exports.ChildBridgeMatterMessageHandler = ChildBridgeMatterMessageHandler;
//# sourceMappingURL=ChildBridgeMatterMessageHandler.js.map