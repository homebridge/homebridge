"use strict";
/**
 * Lightweight Matter Configuration Utilities
 *
 * This module provides config collection and validation without importing
 * heavy Matter.js libraries. This ensures fast startup for users without
 * Matter configured.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterConfigCollector = void 0;
const logger_js_1 = require("../logger.js");
const log = logger_js_1.Logger.withPrefix('Matter/Config');
/**
 * Lightweight config collector that doesn't require Matter.js imports
 */
class MatterConfigCollector {
    /**
     * Check if any Matter configuration exists in the config
     */
    static hasMatterConfig(config) {
        return !!(config.bridge.matter
            || config.platforms.some((p) => p._bridge?.matter)
            || config.accessories.some((a) => a._bridge?.matter));
    }
    /**
     * Collect all configured Matter ports from config to avoid conflicts
     */
    static collectConfiguredMatterPorts(config) {
        const configuredMatterPorts = [];
        if (config.bridge.matter?.port) {
            configuredMatterPorts.push(config.bridge.matter.port);
        }
        for (const platform of config.platforms) {
            if (platform._bridge?.matter?.port) {
                configuredMatterPorts.push(platform._bridge.matter.port);
            }
        }
        for (const accessory of config.accessories) {
            if (accessory._bridge?.matter?.port) {
                configuredMatterPorts.push(accessory._bridge.matter.port);
            }
        }
        return configuredMatterPorts;
    }
    /**
     * Validate the matterPorts pool configuration
     * Ensures start and end are defined and start <= end
     *
     * @param config - The Homebridge configuration
     */
    static validateMatterPortsPool(config) {
        if (config.matterPorts !== undefined) {
            if (config.matterPorts.start && config.matterPorts.end) {
                if (config.matterPorts.start > config.matterPorts.end) {
                    log.error('Invalid Matter port pool configuration. End should be greater than or equal to start.');
                    config.matterPorts = undefined;
                }
            }
            else {
                log.error('Invalid configuration for \'matterPorts\'. Missing \'start\' and \'end\' properties! Ignoring it!');
                config.matterPorts = undefined;
            }
        }
    }
    /**
     * Validate Matter configuration (lazy-loads validator only when needed)
     * This function dynamically imports the full validator to avoid loading it
     * when Matter is not configured.
     */
    static async validateMatterConfig(config) {
        // Only validate if Matter config exists
        if (!this.hasMatterConfig(config)) {
            return;
        }
        // Lazy-load the full validator (which has heavier dependencies)
        const { MatterConfigValidator } = await Promise.resolve().then(() => __importStar(require('./configValidator.js')));
        // Validate main bridge Matter config
        if (config.bridge.matter) {
            const validation = MatterConfigValidator.validate(config.bridge.matter);
            if (!validation.isValid) {
                log.error('Main bridge Matter configuration is invalid. Matter will not be enabled for the main bridge.');
                delete config.bridge.matter;
            }
        }
        // Validate all child bridge Matter configs and check for port conflicts
        const childMatterValidation = MatterConfigValidator.validateAllChildMatterConfigs(config.platforms, config.accessories);
        if (!childMatterValidation.isValid) {
            log.error('Some child bridge Matter configurations are invalid. Check the errors above.');
        }
        // Check for conflicts between main bridge Matter port and child bridge ports
        if (config.bridge.matter?.port) {
            this.checkPortConflicts(config);
        }
    }
    /**
     * Check for port conflicts between main bridge and child bridges
     *
     * @param config - The Homebridge configuration
     */
    static checkPortConflicts(config) {
        const mainMatterPort = config.bridge.matter?.port;
        if (!mainMatterPort) {
            return;
        }
        // Collect all child bridge Matter ports
        const childMatterPorts = [];
        for (const platform of config.platforms) {
            if (platform._bridge?.matter?.port) {
                childMatterPorts.push(platform._bridge.matter.port);
            }
        }
        for (const accessory of config.accessories) {
            if (accessory._bridge?.matter?.port) {
                childMatterPorts.push(accessory._bridge.matter.port);
            }
        }
        // Check for conflicts with child bridge Matter ports
        if (childMatterPorts.includes(mainMatterPort)) {
            log.error(`Main bridge Matter port ${mainMatterPort} conflicts with a child bridge Matter port. Please use unique ports.`);
        }
        // Check for conflict with main bridge HAP port
        if (config.bridge.port && Math.abs(config.bridge.port - mainMatterPort) < 10) {
            log.warn(`Main bridge HAP port ${config.bridge.port} and Matter port ${mainMatterPort} are very close. Consider spacing them further apart.`);
        }
    }
}
exports.MatterConfigCollector = MatterConfigCollector;
//# sourceMappingURL=config.js.map