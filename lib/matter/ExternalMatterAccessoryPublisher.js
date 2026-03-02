"use strict";
/**
 * External Matter Accessory Publisher
 *
 * Shared logic for publishing external Matter accessories on dedicated bridges.
 * Used by both MatterBridgeManager and ChildBridgeMatterManager to avoid code duplication.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishExternalMatterAccessory = publishExternalMatterAccessory;
const logger_js_1 = require("../logger.js");
const user_js_1 = require("../user.js");
const mac_js_1 = require("../util/mac.js");
const server_js_1 = require("./server.js");
const log = logger_js_1.Logger.withPrefix('Matter/External');
/**
 * Publish an external Matter accessory on its own dedicated Matter server.
 * This is required for devices like Robotic Vacuum Cleaners that Apple Home
 * requires to be on their own bridge.
 *
 * @param accessory - The Matter accessory to publish
 * @param context - Configuration context for publishing
 * @returns Published accessory info, or null if publishing failed
 */
async function publishExternalMatterAccessory(accessory, context) {
    // Validate accessory has required fields
    if (!accessory.UUID) {
        log.error('External Matter accessory missing UUID - skipping');
        return null;
    }
    if (!accessory.displayName) {
        log.error(`External Matter accessory ${accessory.UUID} missing displayName - skipping`);
        return null;
    }
    // Generate deterministic MAC address from UUID (same pattern as HAP external accessories)
    const advertiseAddress = (0, mac_js_1.generate)(accessory.UUID);
    // For Matter, use the MAC without colons as uniqueId
    const uniqueId = advertiseAddress.replace(/:/g, '');
    // Allocate Matter port for the external Matter server
    const port = await context.portService.requestMatterPort(uniqueId);
    if (!port) {
        log.error(`Failed to allocate Matter port for external Matter accessory ${accessory.displayName}`);
        log.error('Please configure matterPorts in config.json or free up ports in the default range (5530-5541)');
        return null;
    }
    log.info(`Allocated port ${port} for external Matter accessory: ${accessory.displayName}`);
    // Create dedicated Matter server for this accessory
    const matterServer = new server_js_1.MatterServer({
        port,
        uniqueId,
        storagePath: user_js_1.User.matterPath(),
        manufacturer: accessory.manufacturer,
        model: accessory.model,
        firmwareRevision: accessory.firmwareRevision,
        serialNumber: accessory.serialNumber || uniqueId, // use uniqueId as fallback serial number
        debugModeEnabled: context.debugModeEnabled,
        externalAccessory: true, // external accessory, added before server runs
        networkInterfaces: context.networkInterfaces,
    });
    // Start the Matter server (but don't run it yet due to externalAccessory mode)
    await matterServer.start();
    // Get plugin identifier from accessory
    const pluginIdentifier = accessory._associatedPlugin || 'unknown';
    // Register the accessory to this dedicated server
    await matterServer.registerPlatformAccessories(pluginIdentifier, 'ExternalMatter', [accessory]);
    // Now run the server with the device already attached (required for external accessories)
    await matterServer.runServer();
    log.info(`✓ External Matter accessory published: ${accessory.displayName} on port ${port} (bridge ${advertiseAddress})`);
    // Get commissioning info
    const commissioningInfo = matterServer.getCommissioningInfo();
    return {
        server: matterServer,
        port,
        username: advertiseAddress,
        commissioningInfo,
    };
}
//# sourceMappingURL=ExternalMatterAccessoryPublisher.js.map